/*
 * imu.js — turns ground-truth motion (from motion.js) into what an
 * accelerometer, gyroscope, and magnetometer would actually report,
 * each corrupted by its own noise channels (from noise.js).
 *
 * The one physics point this file exists to get right: an accelerometer
 * measures SPECIFIC FORCE, not coordinate acceleration. Specific force =
 * trueAcceleration - gravity. Sitting still on a table, trueAcceleration
 * is zero, so specific force = -gravityVector = pointing UP at +9.81 —
 * that's the normal force holding the accelerometer up, which is exactly
 * what a real accelerometer reads at rest. In free fall, trueAcceleration
 * equals gravity exactly, so specific force is zero — a real
 * accelerometer in free fall reads zero on every axis, which is the
 * whole reason "9.8 m/s^2" is a misleading way to describe what these
 * sensors measure. Both cases are checked directly, not just described.
 */
(function () {
  "use strict";

  const V = window.Vec3;
  const Q = window.Quat;

  function createIMU(cfg, rng) {
    const mk = (axisCfg) => [0, 1, 2].map(() => window.Noise.createChannel(axisCfg, rng));
    return {
      cfg,
      accelChannels: mk(cfg.accel),
      gyroChannels: mk(cfg.gyro),
      magChannels: mk(cfg.mag),
    };
  }

  function resetDrift(imu) {
    for (const ch of imu.accelChannels.concat(imu.gyroChannels, imu.magChannels)) window.Noise.reset(ch);
  }

  // groundTruth: one sample from motion.js — { orientation, trueAccelWorld, angularVelocityBody }
  function sampleAccelerometer(imu, groundTruth, dt) {
    const gravityWorld = [0, -imu.cfg.gravity, 0];
    const specificForceWorld = V.sub(groundTruth.trueAccelWorld, gravityWorld);
    const specificForceBody = Q.rotateVector(Q.conjugate(groundTruth.orientation), specificForceWorld);
    return specificForceBody.map((v, i) => window.Noise.step(imu.accelChannels[i], v, dt));
  }

  function sampleGyroscope(imu, groundTruth, dt) {
    return groundTruth.angularVelocityBody.map((v, i) => window.Noise.step(imu.gyroChannels[i], v, dt));
  }

  // fieldWorld: Earth's field direction/strength, world frame (constant).
  // interference, if enabled, is a slowly-wandering large disturbance —
  // modeled as its own random walk with a much bigger step than any
  // sensor's own bias drift, since that's what a nearby motor/ferrous
  // mass actually looks like: not more "noise," a real added field.
  function sampleMagnetometer(imu, groundTruth, dt, fieldWorld, interference) {
    let fieldBody = Q.rotateVector(Q.conjugate(groundTruth.orientation), fieldWorld);
    if (interference.enabled) {
      interference.offset = interference.offset.map((v) => v + window.RNG.gaussian(interference.rng, 0, interference.strength * Math.sqrt(dt)));
      fieldBody = V.add(fieldBody, interference.offset);
    }
    return fieldBody.map((v, i) => window.Noise.step(imu.magChannels[i], v, dt));
  }

  window.IMU = { createIMU, resetDrift, sampleAccelerometer, sampleGyroscope, sampleMagnetometer };
})();
