/*
 * motion.js — ground-truth rigid-body motion, before any sensor is
 * involved. Each preset is a pure function of time t (seconds) so the
 * ground truth itself never accumulates numerical error the way a
 * stepped simulation would — only the SENSORS (with their own noise)
 * and the FUSION/POSITION estimates built from them are allowed to
 * drift. Manual control is the one exception, necessarily stateful
 * since it's driven by live input rather than a closed form.
 *
 * Every sample returns:
 *   { position, velocity, orientation (quat), angularVelocityBody,
 *     trueAccelWorld }
 * trueAccelWorld is the pure kinematic (coordinate) acceleration from
 * the motion itself — gravity is added separately in imu.js, which is
 * the whole point of "specific force" (see README).
 */
(function () {
  "use strict";

  const V = window.Vec3;
  const Q = window.Quat;

  function straightLine(cfg, t) {
    const a = cfg.accel;
    return {
      position: [0.5 * a * t * t, 0, 0],
      velocity: [a * t, 0, 0],
      orientation: Q.identity(),
      angularVelocityBody: [0, 0, 0],
      trueAccelWorld: [a, 0, 0],
    };
  }

  function constantTurn(cfg, t) {
    // Position/velocity are derived from the SAME rotation convention
    // Q.fromAxisAngle uses (right-handed around +Y), not picked
    // independently — a mismatch here is exactly how a body's drawn
    // orientation and its actual direction of travel quietly diverge
    // over time. facing(t) = rotateVector(fromAxisAngle([0,1,0],yaw),
    // [1,0,0]) = [cos(yaw), 0, -sin(yaw)]; velocity = speed * facing;
    // position = integral of velocity — verified against a numeric
    // finite-difference of position before trusting it.
    const omega = cfg.speed / cfg.radius;
    const yaw = omega * t;
    return {
      position: [cfg.radius * Math.sin(yaw), 0, -cfg.radius * (1 - Math.cos(yaw))],
      velocity: [cfg.speed * Math.cos(yaw), 0, -cfg.speed * Math.sin(yaw)],
      orientation: Q.fromAxisAngle([0, 1, 0], yaw),
      angularVelocityBody: [0, omega, 0],
      trueAccelWorld: [-cfg.speed * omega * Math.sin(yaw), 0, -cfg.speed * omega * Math.cos(yaw)],
    };
  }

  // facing(yaw) = rotateVector(fromAxisAngle([0,1,0], yaw), [1,0,0])
  //             = [cos(yaw), 0, -sin(yaw)]  (verified against
  //             constantTurn's own facing-vs-velocity check), so to
  //             face the velocity direction: cos(yaw) = vx/|v| and
  //             sin(yaw) = -vz/|v| => yaw = atan2(-vz, vx).
  function figureEightHeadingAt(cfg, t) {
    const w = cfg.omega;
    const vx = cfg.amplitude * w * Math.cos(w * t);
    const vz = cfg.amplitude * w * Math.cos(2 * w * t);
    return Math.atan2(-vz, vx);
  }
  function figureEight(cfg, t) {
    const w = cfg.omega, A = cfg.amplitude;
    const vx = A * w * Math.cos(w * t), vz = A * w * Math.cos(2 * w * t);
    const ax = -A * w * w * Math.sin(w * t), az = -2 * A * w * w * Math.sin(2 * w * t);
    const eps = 1e-4;
    const yawRate = (figureEightHeadingAt(cfg, t + eps) - figureEightHeadingAt(cfg, t - eps)) / (2 * eps);
    return {
      position: [A * Math.sin(w * t), 0, A * Math.sin(2 * w * t) / 2],
      velocity: [vx, 0, vz],
      orientation: Q.fromAxisAngle([0, 1, 0], figureEightHeadingAt(cfg, t)),
      angularVelocityBody: [0, yawRate, 0],
      trueAccelWorld: [ax, 0, az],
    };
  }

  function freeFall(cfg, t) {
    const g = cfg.g;
    return {
      position: [0, -0.5 * g * t * t, 0],
      velocity: [0, -g * t, 0],
      orientation: Q.identity(),
      angularVelocityBody: [0, 0, 0],
      trueAccelWorld: [0, -g, 0],
    };
  }

  function shake(cfg, t) {
    const w = 2 * Math.PI * cfg.frequency;
    const x = cfg.amplitude * Math.sin(w * t);
    const vx = cfg.amplitude * w * Math.cos(w * t);
    const ax = -cfg.amplitude * w * w * Math.sin(w * t);
    // A small rotational jitter around a fixed axis — enough to stress
    // the gyro channel too, not meant as a precise rotational path.
    const rotAmp = 0.12; // radians, ~7 degrees
    const roll = rotAmp * Math.sin(w * t + 0.7);
    const rollRate = rotAmp * w * Math.cos(w * t + 0.7);
    return {
      position: [x, 0, 0],
      velocity: [vx, 0, 0],
      orientation: Q.fromAxisAngle([1, 0, 0], roll),
      angularVelocityBody: [rollRate, 0, 0],
      trueAccelWorld: [ax, 0, 0],
    };
  }

  const PROFILES = {
    straightLine, constantTurn, figureEight, freeFall, shake,
  };

  function sampleProfile(name, cfg, t) {
    return (PROFILES[name] || straightLine)(cfg, t);
  }

  // ---------- manual control: stateful, driven by held-key input ----------
  function createManualState() {
    return {
      position: [0, 0, 0], velocity: [0, 0, 0], orientation: Q.identity(),
    };
  }
  // Velocity decays toward zero on its own (a ~1.2s time constant) when
  // there's no accel input fighting it, rather than coasting forever —
  // both a more forgiving feel for actually driving the thing, and a
  // safety net against a single stray captured keystroke (e.g. arrow
  // keys used to operate the profile dropdown) leaving the body with a
  // permanent, never-decaying velocity and no way to stop it.
  const MANUAL_DAMPING_PER_SECOND = 0.8;

  // input: { accelBody:[x,y,z] (m/s^2, in the body's own current axes,
  //          e.g. from WASD), angularVelocityBody:[x,y,z] (rad/s, from
  //          rotation keys) }
  function stepManual(state, input, dt) {
    const accelWorld = Q.rotateVector(state.orientation, input.accelBody);
    const damping = Math.exp(-MANUAL_DAMPING_PER_SECOND * dt);
    const velocity = V.add(V.scale(state.velocity, damping), V.scale(accelWorld, dt));
    const position = V.add(state.position, V.scale(velocity, dt));
    const orientation = Q.integrateBodyRate(state.orientation, input.angularVelocityBody, dt);
    return {
      position, velocity, orientation,
      angularVelocityBody: input.angularVelocityBody,
      trueAccelWorld: accelWorld,
      _internal: { position, velocity, orientation },
    };
  }

  window.Motion = { sampleProfile, createManualState, stepManual, PROFILE_NAMES: Object.keys(PROFILES) };
})();
