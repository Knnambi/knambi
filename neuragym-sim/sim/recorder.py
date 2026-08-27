"""Per-episode data capture: joint trajectory, end-effector pose, video."""
import json
import time
from pathlib import Path

import imageio.v2 as imageio
import numpy as np


class EpisodeRecorder:
    def __init__(self):
        self.timestamps = []
        self.joint_positions = []
        self.joint_velocities = []
        self.ee_positions = []
        self.ee_orientations = []
        self.frames = []
        self._t0 = time.perf_counter()

    def record_step(self, env, capture_frame=False):
        positions, velocities = env.get_joint_state()
        ee_pos, ee_orn = env.get_ee_pose()
        self.timestamps.append(time.perf_counter() - self._t0)
        self.joint_positions.append(positions)
        self.joint_velocities.append(velocities)
        self.ee_positions.append(ee_pos)
        self.ee_orientations.append(ee_orn)
        if capture_frame:
            self.frames.append(env.render_frame())

    def save(self, episode_dir, episode_index, config, success, wall_seconds, write_video=True):
        episode_dir = Path(episode_dir)
        episode_dir.mkdir(parents=True, exist_ok=True)

        np.savez_compressed(
            episode_dir / "trajectory.npz",
            timestamps=np.array(self.timestamps, dtype=np.float32),
            joint_positions=np.array(self.joint_positions, dtype=np.float32),
            joint_velocities=np.array(self.joint_velocities, dtype=np.float32),
            ee_positions=np.array(self.ee_positions, dtype=np.float32),
            ee_orientations=np.array(self.ee_orientations, dtype=np.float32),
        )

        metadata = {
            "episode_index": episode_index,
            "success": success,
            "num_steps": len(self.timestamps),
            "wall_seconds": wall_seconds,
            **config,
        }
        with open(episode_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        if write_video and self.frames:
            try:
                imageio.mimwrite(episode_dir / "video.mp4", self.frames, fps=15, quality=6)
            except Exception:
                frames_dir = episode_dir / "frames"
                frames_dir.mkdir(exist_ok=True)
                for i, frame in enumerate(self.frames):
                    imageio.imwrite(frames_dir / f"{i:04d}.png", frame)

        return metadata
