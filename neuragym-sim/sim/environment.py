"""PyBullet tabletop pick-and-place environment.

One Franka Panda arm, one small randomized cube, one fixed target zone.
Everything a scripted controller needs (IK, joint state, success check)
lives here; trajectory generation lives in controller.py.
"""
import math
import random

import pybullet as p
import pybullet_data

ARM_JOINTS = [0, 1, 2, 3, 4, 5, 6]
FINGER_JOINTS = [9, 10]
EE_LINK = 11  # panda_grasptarget: a point centered between the fingertips
FINGER_OPEN = 0.04
HOME_JOINTS = [0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785]  # gripper faces down
DOWN_ORIENTATION = p.getQuaternionFromEuler([math.pi, 0, 0])

TABLE_TOP_Z = 0.626
OBJECT_X_RANGE = (0.38, 0.50)
OBJECT_Y_RANGE = (-0.15, 0.02)
OBJECT_HALF_EXTENT_RANGE = (0.020, 0.030)
OBJECT_COLORS = [
    (0.85, 0.15, 0.15, 1.0),   # red
    (0.15, 0.45, 0.85, 1.0),   # blue
    (0.20, 0.75, 0.30, 1.0),   # green
    (0.95, 0.75, 0.10, 1.0),   # yellow
    (0.60, 0.25, 0.75, 1.0),   # purple
]
TARGET_ZONE_CENTER = (0.38, 0.18)
TARGET_ZONE_RADIUS = 0.07

HOVER_HEIGHT = 0.15


class PickPlaceEnv:
    """A single Panda arm on a table, one cube, one target zone."""

    def __init__(self, gui=False, timestep=1.0 / 240.0):
        self.gui = gui
        self.timestep = timestep
        self.client = p.connect(p.GUI if gui else p.DIRECT)
        p.setAdditionalSearchPath(pybullet_data.getDataPath())
        p.setTimeStep(self.timestep, physicsClientId=self.client)

        self.plane_id = None
        self.table_id = None
        self.panda_id = None
        self.object_id = None
        self.object_half_extent = None
        self.object_color = None
        self.object_start_pos = None
        self.target_center = TARGET_ZONE_CENTER
        self.target_radius = TARGET_ZONE_RADIUS

        self._build_static_scene()

    def _build_static_scene(self):
        p.resetSimulation(physicsClientId=self.client)
        p.setGravity(0, 0, -9.8, physicsClientId=self.client)
        self.plane_id = p.loadURDF("plane.urdf")
        self.table_id = p.loadURDF("table/table.urdf", basePosition=[0.4, 0, 0], useFixedBase=True)
        self.panda_id = p.loadURDF(
            "franka_panda/panda.urdf", basePosition=[0, 0, TABLE_TOP_Z], useFixedBase=True
        )
        for j in ARM_JOINTS + FINGER_JOINTS:
            p.changeDynamics(self.panda_id, j, linearDamping=0, angularDamping=0)
        for j in FINGER_JOINTS:
            p.changeDynamics(self.panda_id, j, lateralFriction=1.5)
        self._draw_target_zone()

    def _draw_target_zone(self):
        cx, cy = self.target_center
        visual = p.createVisualShape(
            p.GEOM_CYLINDER,
            radius=self.target_radius,
            length=0.002,
            rgbaColor=(0.2, 0.9, 0.9, 0.6),
        )
        p.createMultiBody(
            baseMass=0,
            baseVisualShapeIndex=visual,
            basePosition=[cx, cy, TABLE_TOP_Z + 0.001],
        )

    def reset(self, seed=None):
        """Respawn the object at a randomized pose. Returns episode config dict."""
        rng = random.Random(seed)

        if self.object_id is not None:
            p.removeBody(self.object_id)

        for i, j in enumerate(ARM_JOINTS):
            p.resetJointState(self.panda_id, j, HOME_JOINTS[i])
        for j in FINGER_JOINTS:
            p.resetJointState(self.panda_id, j, FINGER_OPEN)

        half_extent = rng.uniform(*OBJECT_HALF_EXTENT_RANGE)
        ox = rng.uniform(*OBJECT_X_RANGE)
        oy = rng.uniform(*OBJECT_Y_RANGE)
        color = rng.choice(OBJECT_COLORS)

        collision = p.createCollisionShape(p.GEOM_BOX, halfExtents=[half_extent] * 3)
        visual = p.createVisualShape(p.GEOM_BOX, halfExtents=[half_extent] * 3, rgbaColor=color)
        self.object_id = p.createMultiBody(
            baseMass=0.05,
            baseCollisionShapeIndex=collision,
            baseVisualShapeIndex=visual,
            basePosition=[ox, oy, TABLE_TOP_Z + half_extent + 0.001],
        )
        p.changeDynamics(self.object_id, -1, lateralFriction=1.2)

        self.object_half_extent = half_extent
        self.object_color = color
        self.object_start_pos = (ox, oy, TABLE_TOP_Z + half_extent)

        for _ in range(20):
            p.stepSimulation()

        return {
            "object_start_pos": list(self.object_start_pos),
            "object_half_extent": half_extent,
            "object_color": list(color),
            "target_center": list(self.target_center),
            "target_radius": self.target_radius,
            "seed": seed,
        }

    def move_ee(self, target_pos, target_orn=DOWN_ORIENTATION):
        joint_targets = p.calculateInverseKinematics(
            self.panda_id,
            EE_LINK,
            target_pos,
            target_orn,
            maxNumIterations=200,
            residualThreshold=1e-5,
        )
        p.setJointMotorControlArray(
            self.panda_id,
            ARM_JOINTS,
            p.POSITION_CONTROL,
            targetPositions=joint_targets[: len(ARM_JOINTS)],
            forces=[87] * len(ARM_JOINTS),
        )

    def set_gripper(self, opening):
        """opening: target half-gap per finger, in meters (0 = closed, 0.04 = fully open)."""
        p.setJointMotorControlArray(
            self.panda_id,
            FINGER_JOINTS,
            p.POSITION_CONTROL,
            targetPositions=[opening, opening],
            forces=[40, 40],
        )

    def step(self):
        p.stepSimulation()

    def get_joint_state(self):
        states = p.getJointStates(self.panda_id, ARM_JOINTS + FINGER_JOINTS)
        positions = [s[0] for s in states]
        velocities = [s[1] for s in states]
        return positions, velocities

    def get_ee_pose(self):
        ls = p.getLinkState(self.panda_id, EE_LINK, computeForwardKinematics=True)
        return list(ls[4]), list(ls[5])  # position, orientation (quaternion)

    def get_object_pose(self):
        pos, orn = p.getBasePositionAndOrientation(self.object_id)
        return list(pos), list(orn)

    def check_success(self):
        pos, _ = self.get_object_pose()
        cx, cy = self.target_center
        dist = math.hypot(pos[0] - cx, pos[1] - cy)
        on_table = pos[2] > TABLE_TOP_Z - 0.05
        return bool(on_table and dist <= self.target_radius)

    def render_frame(self, width=320, height=240):
        view_matrix = p.computeViewMatrix(
            cameraEyePosition=[1.3, -1.1, 1.8],
            cameraTargetPosition=[0.35, 0.05, TABLE_TOP_Z + 0.1],
            cameraUpVector=[0, 0, 1],
        )
        proj_matrix = p.computeProjectionMatrixFOV(
            fov=50, aspect=width / height, nearVal=0.1, farVal=3.0
        )
        _, _, rgba, _, _ = p.getCameraImage(
            width,
            height,
            viewMatrix=view_matrix,
            projectionMatrix=proj_matrix,
            renderer=p.ER_TINY_RENDERER,
        )
        rgba = _to_hwc_rgb(rgba, width, height)
        return rgba

    def close(self):
        p.disconnect(physicsClientId=self.client)


def _to_hwc_rgb(rgba, width, height):
    import numpy as np

    arr = np.reshape(rgba, (height, width, 4)).astype("uint8")
    return arr[:, :, :3]
