#!/usr/bin/env python3
"""Stretch goal: behavior-cloning policy trained on recorded episodes.

Not the hard requirement of the PRD -- the dataset-generation pipeline
(generate_dataset.py) is. This is a minimal, readable BC baseline: an
MLP that maps (current joint positions, object start position, target
center) -> next joint positions, trained on successful scripted episodes,
then evaluated by closed-loop rollout in the same simulator.

Usage:
    python train_policy.py --run-dir datasets/run_20260101_120000_abcdef
    python train_policy.py                      # uses the most recent run
"""
import argparse
import json
from pathlib import Path

import numpy as np

try:
    import torch
    import torch.nn as nn
except ImportError as e:
    raise SystemExit(
        "train_policy.py needs torch (not in requirements.txt since it's a "
        "stretch goal). Install with: pip install torch"
    ) from e

from sim.controller import build_waypoints  # noqa: F401  (kept for reference/debugging)
from sim.environment import ARM_JOINTS, FINGER_JOINTS, PickPlaceEnv

STATE_DIM = len(ARM_JOINTS) + len(FINGER_JOINTS) + 3 + 2  # joints + object_start(3) + target(2)
ACTION_DIM = len(ARM_JOINTS) + len(FINGER_JOINTS)
ROLLOUT_STEPS = 600
STRIDE = 8  # policy predicts a joint-position delta STRIDE sim-steps ahead, then holds
# that target for STRIDE steps -- per-step deltas at 240Hz are ~1% of joint range,
# too small relative to noise for a single-step MLP regression target to learn anything
# but the identity map, hence chunking.


class BCPolicy(nn.Module):
    def __init__(self, state_dim=STATE_DIM, action_dim=ACTION_DIM, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, action_dim),
        )

    def forward(self, x):
        return self.net(x)


def find_latest_run(datasets_dir="datasets"):
    runs = sorted(Path(datasets_dir).glob("run_*"))
    if not runs:
        raise SystemExit(f"No runs found under {datasets_dir}/. Run generate_dataset.py first.")
    return runs[-1]


def load_episode(episode_dir):
    traj = np.load(episode_dir / "trajectory.npz")
    with open(episode_dir / "metadata.json") as f:
        meta = json.load(f)
    return traj, meta


def build_dataset(run_dir, successful_only=True):
    states, actions = [], []
    episode_dirs = sorted(Path(run_dir).glob("episode_*"))
    used = 0
    for ep_dir in episode_dirs:
        traj, meta = load_episode(ep_dir)
        if successful_only and not meta["success"]:
            continue
        used += 1
        joint_pos = traj["joint_positions"]  # (T, 9)
        obj_start = np.array(meta["object_start_pos"], dtype=np.float32)
        target = np.array(meta["target_center"], dtype=np.float32)
        context = np.concatenate([obj_start, target])
        for t in range(len(joint_pos) - STRIDE):
            states.append(np.concatenate([joint_pos[t], context]))
            actions.append(joint_pos[t + STRIDE] - joint_pos[t])
    if not states:
        raise SystemExit(f"No usable episodes found in {run_dir} (successful_only={successful_only}).")
    print(f"built dataset from {used}/{len(episode_dirs)} episodes, {len(states)} transitions")
    return np.array(states, dtype=np.float32), np.array(actions, dtype=np.float32)


def train(states, actions, epochs, batch_size=256, lr=1e-3):
    state_mean, state_std = states.mean(0), states.std(0) + 1e-6
    states_norm = (states - state_mean) / state_std

    n = len(states)
    n_val = max(1, int(0.1 * n))
    perm = np.random.permutation(n)
    val_idx, train_idx = perm[:n_val], perm[n_val:]

    x_train = torch.tensor(states_norm[train_idx])
    y_train = torch.tensor(actions[train_idx])
    x_val = torch.tensor(states_norm[val_idx])
    y_val = torch.tensor(actions[val_idx])

    model = BCPolicy()
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(x_train))
        epoch_loss = 0.0
        for i in range(0, len(x_train), batch_size):
            idx = perm[i:i + batch_size]
            pred = model(x_train[idx])
            loss = loss_fn(pred, y_train[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(idx)
        epoch_loss /= len(x_train)

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(x_val), y_val).item()
        if epoch % max(1, epochs // 10) == 0 or epoch == epochs - 1:
            print(f"  epoch {epoch:03d}: train_loss={epoch_loss:.5f} val_loss={val_loss:.5f}")

    return model, state_mean, state_std


def evaluate(model, state_mean, state_std, num_episodes, base_seed=10_000):
    model.eval()
    env = PickPlaceEnv(gui=False)
    successes = 0
    try:
        for i in range(num_episodes):
            episode_config = env.reset(seed=base_seed + i)
            context = np.concatenate([
                np.array(episode_config["object_start_pos"], dtype=np.float32),
                np.array(episode_config["target_center"], dtype=np.float32),
            ])
            import pybullet as p
            for _ in range(ROLLOUT_STEPS // STRIDE):
                joint_pos, _ = env.get_joint_state()
                state = np.concatenate([joint_pos, context]).astype(np.float32)
                state_norm = (state - state_mean) / state_std
                with torch.no_grad():
                    delta = model(torch.tensor(state_norm).unsqueeze(0)).squeeze(0).numpy()
                target = np.array(joint_pos) + delta
                p.setJointMotorControlArray(
                    env.panda_id, ARM_JOINTS + FINGER_JOINTS, p.POSITION_CONTROL,
                    targetPositions=target.tolist(), forces=[87] * 7 + [40, 40],
                )
                for _ in range(STRIDE):
                    env.step()
            successes += int(env.check_success())
    finally:
        env.close()
    return successes / num_episodes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=str, default=None, help="dataset run directory (default: latest)")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--eval-episodes", type=int, default=10)
    parser.add_argument("--out-dir", type=str, default="checkpoints")
    args = parser.parse_args()

    run_dir = Path(args.run_dir) if args.run_dir else find_latest_run()
    print(f"training on {run_dir}")

    states, actions = build_dataset(run_dir)
    model, state_mean, state_std = train(states, actions, epochs=args.epochs)

    print(f"evaluating over {args.eval_episodes} fresh rollouts...")
    success_rate = evaluate(model, state_mean, state_std, args.eval_episodes)
    print(f"BC policy success rate: {success_rate:.2%}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = out_dir / f"{run_dir.name}_bc.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "state_mean": state_mean,
        "state_std": state_std,
    }, ckpt_path)

    eval_path = out_dir / f"{run_dir.name}_eval.json"
    with open(eval_path, "w") as f:
        json.dump({
            "run_dir": str(run_dir),
            "epochs": args.epochs,
            "eval_episodes": args.eval_episodes,
            "success_rate": success_rate,
        }, f, indent=2)

    print(f"checkpoint: {ckpt_path}")
    print(f"eval report: {eval_path}")


if __name__ == "__main__":
    main()
