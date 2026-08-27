#!/usr/bin/env python3
"""Generate a pick-and-place episode dataset.

Usage:
    python generate_dataset.py --episodes 50
    python generate_dataset.py --episodes 10 --gui --seed 42

Each run creates datasets/run_<timestamp>/ containing one episode_<n>/
directory per attempt (trajectory.npz, metadata.json, video.mp4) plus a
manifest.json summarizing the whole run.
"""
import argparse
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sim import environment as env_config
from sim.controller import run_pick_and_place
from sim.environment import PickPlaceEnv
from sim.recorder import EpisodeRecorder


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episodes", type=int, default=50, help="number of episodes to generate")
    parser.add_argument("--seed", type=int, default=0, help="base random seed (episode i uses seed+i)")
    parser.add_argument("--gui", action="store_true", help="open the PyBullet GUI window")
    parser.add_argument("--out-dir", type=str, default="datasets", help="root output directory")
    parser.add_argument("--no-video", action="store_true", help="skip writing per-episode video")
    parser.add_argument("--frame-every", type=int, default=8, help="capture a frame every N sim steps")
    return parser.parse_args()


def main():
    args = parse_args()

    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    run_dir = Path(args.out_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    config = {
        "episodes": args.episodes,
        "base_seed": args.seed,
        "gui": args.gui,
        "frame_every": args.frame_every,
        "object_x_range": list(env_config.OBJECT_X_RANGE),
        "object_y_range": list(env_config.OBJECT_Y_RANGE),
        "object_half_extent_range": list(env_config.OBJECT_HALF_EXTENT_RANGE),
        "target_center": list(env_config.TARGET_ZONE_CENTER),
        "target_radius": env_config.TARGET_ZONE_RADIUS,
    }

    start_time = datetime.now(timezone.utc).isoformat()
    print(f"[{run_id}] starting dataset generation: {args.episodes} episodes -> {run_dir}")

    env = PickPlaceEnv(gui=args.gui)
    successes = 0
    episode_lengths = []

    try:
        for i in range(args.episodes):
            episode_seed = args.seed + i
            episode_start = time.perf_counter()

            episode_config = env.reset(seed=episode_seed)
            recorder = EpisodeRecorder()
            success, num_steps = run_pick_and_place(env, recorder, frame_every=args.frame_every)
            wall_seconds = time.perf_counter() - episode_start

            episode_dir = run_dir / f"episode_{i:03d}"
            recorder.save(
                episode_dir,
                episode_index=i,
                config=episode_config,
                success=success,
                wall_seconds=wall_seconds,
                write_video=not args.no_video,
            )

            successes += int(success)
            episode_lengths.append(num_steps)
            status = "SUCCESS" if success else "FAILURE"
            print(f"  episode {i:03d}: {status} ({num_steps} steps, {wall_seconds:.2f}s)")
    finally:
        env.close()

    end_time = datetime.now(timezone.utc).isoformat()
    summary = {
        "num_episodes": args.episodes,
        "success_count": successes,
        "success_rate": successes / args.episodes if args.episodes else 0.0,
        "avg_episode_length": sum(episode_lengths) / len(episode_lengths) if episode_lengths else 0.0,
    }

    manifest = {
        "run_id": run_id,
        "start_time": start_time,
        "end_time": end_time,
        "config": config,
        "summary": summary,
    }
    with open(run_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[{run_id}] done. success_rate={summary['success_rate']:.2%} "
          f"avg_episode_length={summary['avg_episode_length']:.1f}")
    print(f"manifest: {run_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
