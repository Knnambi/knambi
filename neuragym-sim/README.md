# NeuraGym Demo — Simulation Component

PyBullet pick-and-place simulation that generates a training dataset: a
Franka Panda arm on a tabletop picks up a randomized cube and places it
in a target zone, with every episode logged to disk in a structured,
versioned layout. Built per `PRD-neuragym-demo-simulation.md` — this is
the simulation layer only (no UI, no billing, no MLflow dashboard).

## Quickstart

```bash
cd neuragym-sim
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python generate_dataset.py --episodes 50
```

Add `--gui` to watch it live in a PyBullet window (needs a display —
skip it on a headless box). Each run creates
`datasets/run_<timestamp>_<id>/` containing:

```
datasets/run_20260101_120000_abcdef/
  manifest.json                  # run-level summary (see below)
  episode_000/
    trajectory.npz                # joint positions/velocities, ee pose, timestamps
    metadata.json                 # object start pose, outcome, config
    video.mp4                     # rendered episode video
  episode_001/
  ...
```

`manifest.json` carries what a later MLflow-integration phase needs
without rework: run ID, start/end timestamps, the exact config used
(seed, episode count, task parameters), and summary stats (success
rate, average episode length).

## How it works

- **`sim/environment.py`** — the scene: a table, a fixed Panda arm, a
  randomized cube (position, size, color), and a fixed circular target
  zone. Exposes IK-based end-effector control, joint/pose readouts, a
  success check (object resting inside the target zone), and an
  off-screen camera renderer that works headless (`ER_TINY_RENDERER`,
  no GPU or display required).
- **`sim/controller.py`** — the scripted motion: a fixed waypoint
  sequence (hover → descend → grasp → lift → transfer → place →
  release → retreat), each leg driven by linear interpolation of the
  end-effector target through `calculateInverseKinematics`. No
  teleoperation hardware exists for this demo, so this is
  "programmatic control, option B" from the PRD.
- **`sim/recorder.py`** — captures joint positions/velocities and
  end-effector pose every simulation step, and a camera frame every
  few steps, then writes them to `trajectory.npz` + `metadata.json` +
  `video.mp4` per episode.
- **`generate_dataset.py`** — the single-command entrypoint: loops
  episodes, randomizing the cube each time, and writes the run
  manifest.

Tested at 30+ consecutive episodes with a 100% pick-and-place success
rate in headless (`DIRECT`) mode — the scripted controller is
deliberately conservative (generous waypoint durations, snug but not
tight grasp width) so it re-runs reliably live without babysitting.

## Stretch goal: behavior cloning

```bash
pip install torch   # not in requirements.txt — optional
python train_policy.py --episodes 60   # or: python generate_dataset.py --episodes 60 first
python train_policy.py --run-dir datasets/run_<...>
```

Trains a small MLP to imitate the scripted controller (state = current
joint positions + object start position + target center; action = a
joint-position delta a few steps ahead), then evaluates it by rolling
it out closed-loop in the simulator for N fresh episodes and reports a
success rate. It's a real training pipeline (see `train_policy.py`) run
end-to-end, but **its success rate is currently low-to-zero** with the
default ~30-episode dataset: single-step imitation error is tiny (the
model predicts held-out validation states almost exactly), but small
per-step errors compound over a ~500-step closed-loop rollout —
classic BC covariate shift, most visible right after the constant
"home" reset state. This is expected for 30 episodes of a single
scripted demonstrator with no corrective (DAgger-style) data; the
honest fix is more episodes and/or on-policy correction, not a bigger
network. Per the PRD, this piece is explicitly a stretch goal — the
dataset-generation pipeline above is the hard requirement, and it's
solid.

## Notes / assumptions

- Object spawn region and target zone were empirically tuned to sit
  well inside the Panda's reachable, non-singular workspace (see the
  constants at the top of `sim/environment.py`).
- `PickPlaceEnv.render_frame` uses PyBullet's software renderer, so
  video capture works in a container with no GPU and no X display —
  useful for CI/dev, and `--gui` still works normally wherever a
  display is available (e.g. during the live interview demo).
