"""Scripted, IK-driven pick-and-place trajectory.

No teleoperation hardware exists for this demo, so motion is generated
programmatically: a fixed sequence of waypoints (reach -> grasp -> lift ->
move -> release -> retreat), each achieved by driving the end-effector
in a straight line via inverse kinematics.
"""
from .environment import FINGER_OPEN, HOVER_HEIGHT

GRASP_CLOSE_MARGIN = 0.002  # finger opening = half object width - margin, for a snug grip


def build_waypoints(env):
    ox, oy, oz = env.object_start_pos
    tx, ty = env.target_center
    half = env.object_half_extent
    grasp_opening = max(0.0, half - GRASP_CLOSE_MARGIN)
    table_z = oz - half  # table top under the object
    hover_z = table_z + HOVER_HEIGHT
    grasp_z = oz
    place_z = table_z + half

    return [
        # (target_xyz, gripper_opening, duration_steps)
        ((ox, oy, hover_z), FINGER_OPEN, 60),   # pre-grasp: hover above object
        ((ox, oy, grasp_z), FINGER_OPEN, 60),   # descend to object
        ((ox, oy, grasp_z), grasp_opening, 40), # close gripper
        ((ox, oy, hover_z), grasp_opening, 60), # lift
        ((tx, ty, hover_z), grasp_opening, 90), # transfer above target zone
        ((tx, ty, place_z), grasp_opening, 60), # descend to place
        ((tx, ty, place_z), FINGER_OPEN, 30),   # release
        ((tx, ty, hover_z), FINGER_OPEN, 60),   # retreat
    ]


def run_pick_and_place(env, recorder=None, frame_every=8, settle_steps=40):
    """Executes the full scripted episode. Returns True/False success."""
    waypoints = build_waypoints(env)
    current_pos, _ = env.get_ee_pose()
    step_count = 0

    for target_pos, gripper_opening, duration in waypoints:
        start_pos = current_pos
        for i in range(1, duration + 1):
            frac = i / duration
            interp = [
                start_pos[k] + (target_pos[k] - start_pos[k]) * frac for k in range(3)
            ]
            env.move_ee(interp)
            env.set_gripper(gripper_opening)
            env.step()
            step_count += 1
            if recorder is not None:
                recorder.record_step(env, capture_frame=(step_count % frame_every == 0))
        current_pos = list(target_pos)

    for _ in range(settle_steps):
        env.step()
        step_count += 1
        if recorder is not None:
            recorder.record_step(env, capture_frame=(step_count % frame_every == 0))

    return env.check_success(), step_count
