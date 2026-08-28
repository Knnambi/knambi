/*
 * quat.js — minimal quaternion math for orientation tracking. Quaternions
 * are plain [x, y, z, w] arrays (Hamilton convention, right-handed,
 * matching Three.js's own quaternion layout so results can be dropped
 * straight into a THREE.Quaternion).
 */
(function () {
  "use strict";

  const V = window.Vec3;

  function identity() { return [0, 0, 0, 1]; }

  function fromAxisAngle(axis, angleRad) {
    const half = angleRad / 2, s = Math.sin(half);
    const a = V.normalize(axis);
    return [a[0] * s, a[1] * s, a[2] * s, Math.cos(half)];
  }

  // Hamilton product a*b: apply b's rotation first, then a's — i.e. the
  // combined rotation "a after b". For body-frame angular-velocity
  // integration we want "current orientation, then a small extra spin
  // in the body's own current axes", which is q ⊗ dq — this function
  // applied as multiply(q, dq).
  function multiply(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  }

  function normalize(q) {
    const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }

  function conjugate(q) { return [-q[0], -q[1], -q[2], q[3]]; }

  // Rotate a world/body vector v by quaternion q (standard v' = q v q*).
  function rotateVector(q, v) {
    const qv = [q[0], q[1], q[2]];
    const uv = V.cross(qv, v);
    const uuv = V.cross(qv, uv);
    return V.add(v, V.scale(V.add(V.scale(uv, q[3]), uuv), 2));
  }

  // Integrate orientation q forward by a BODY-frame angular velocity
  // (rad/s) over dt, using the exact exponential map (not a linearized
  // small-angle approximation) — exact for any dt as long as ω is
  // constant over the step, which it is between two sample instants.
  function integrateBodyRate(q, angularVelocityBody, dt) {
    const w = angularVelocityBody;
    const mag = V.length(w);
    if (mag < 1e-12) return q;
    const dq = fromAxisAngle(w, mag * dt);
    return normalize(multiply(q, dq));
  }

  // Intrinsic Z-Y-X (yaw-pitch-roll) Euler decomposition — the common
  // aerospace/robotics convention. Used only for the complementary
  // filter's blending step and for display; the propagation itself
  // always stays in quaternions to avoid gimbal lock.
  function toEulerZYX(q) {
    const [x, y, z, w] = q;
    const sinr_cosp = 2 * (w * x + y * z), cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
    const siny_cosp = 2 * (w * z + x * y), cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);
    return { roll, pitch, yaw };
  }

  function fromEulerZYX(roll, pitch, yaw) {
    const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
    const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    return [
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
      cr * cp * cy + sr * sp * sy,
    ];
  }

  window.Quat = {
    identity, fromAxisAngle, multiply, normalize, conjugate, rotateVector,
    integrateBodyRate, toEulerZYX, fromEulerZYX,
  };
})();
