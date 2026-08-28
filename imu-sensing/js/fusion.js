/*
 * fusion.js — three ways to turn noisy gyro (+ accel, + optional mag)
 * readings into an orientation estimate, precisely so their difference
 * in stability is visible side by side:
 *
 *   - gyro-only: pure integration, no correction at all. Any constant
 *     gyro bias integrates into an ever-growing angle error — this is
 *     the drift demo, deliberately left uncorrected.
 *   - complementary filter: gyro integration (trusted short-term)
 *     continuously nudged back toward an accelerometer-derived "which
 *     way is up" reference (trusted long-term, since gravity doesn't
 *     drift) — and, if a magnetometer is enabled, a separate yaw-only
 *     nudge toward magnetic north, since accelerometer alone can never
 *     observe yaw (gravity doesn't change if you spin in place).
 *   - Kalman filter: the same two physical facts (gyro integrates
 *     short-term error, accel/mag observe absolute tilt/yaw long-term),
 *     but with a formally derived, uncertainty-aware gain instead of a
 *     fixed blend factor, tracking gyro bias as part of its own state
 *     so it can additionally cancel out a KNOWN constant bias over time
 *     — which a fixed-gain complementary filter never explicitly does.
 *
 * Both correction steps work on 3D "which direction is this" vectors,
 * not Euler angles — the accelerometer correction is a pure vector
 * alignment (predicted "up" vs. sensed "up"), and the magnetometer
 * correction is the same idea projected onto the horizontal plane so it
 * can only ever affect yaw. This sidesteps gimbal lock and, more
 * importantly, sidesteps hand-deriving an Euler tilt formula for a
 * particular axis convention — a real source of sign-order bugs
 * elsewhere in this app, caught only by testing against known angles.
 */
(function () {
  "use strict";

  const V = window.Vec3;
  const Q = window.Quat;

  function gyroOnlyStep(q, gyroMeasured, dt) {
    return Q.integrateBodyRate(q, gyroMeasured, dt);
  }

  function projectPerp(v, n) { return V.sub(v, V.scale(n, V.dot(v, n))); }

  // Returns a small BODY-FRAME rotation dq such that, once applied as
  // q_new = q ⊗ dq (right-multiplied — see integrateBodyRate above), the
  // corrected orientation's own implied `predicted` vector moves toward
  // `measured`. Because q ⊗ dq applies dq's rotation FIRST when acting
  // on a vector (rotateVector(q⊗dq, v) = rotateVector(q, rotateVector(dq,
  // v)) — verified directly, see the test suite), the quaternion that
  // needs to be right-multiplied on is the INVERSE of "rotate predicted
  // onto measured": it's the one that rotates the FINAL frame's view of
  // `measured` back onto `predicted`. Getting this backwards silently
  // converges to a stable-but-wrong orientation rather than throwing —
  // exactly what happened here before being caught by testing against a
  // known tilt angle instead of just checking the filter "settles."
  function correctionTowardBodyVector(predicted, measured, gain) {
    const axis = V.cross(measured, predicted);
    const axisLen = V.length(axis);
    if (axisLen < 1e-9) return Q.identity();
    const cosAngle = Math.max(-1, Math.min(1, V.dot(measured, predicted)));
    const angle = Math.atan2(axisLen, cosAngle);
    return Q.fromAxisAngle(V.scale(axis, 1 / axisLen), angle * gain);
  }

  /**
   * @param q            current orientation estimate
   * @param gyroMeasured body-frame rad/s
   * @param accelMeasured body-frame specific force (m/s^2) — treated as
   *                      a noisy measurement of "which way is up" (only
   *                      valid near-rest; see README for the limitation)
   * @param magMeasured  body-frame field, or null if disabled
   * @param magFieldWorld world-frame reference field (unit-normalized inside)
   * @param dt, cfg      { accelGain, magGain }
   */
  function complementaryStep(q, gyroMeasured, accelMeasured, magMeasured, magFieldWorld, dt, cfg) {
    let qNew = Q.integrateBodyRate(q, gyroMeasured, dt);

    const measuredUp = V.normalize(accelMeasured);
    const predictedUp = V.normalize(Q.rotateVector(Q.conjugate(qNew), [0, 1, 0]));
    const tiltCorrection = correctionTowardBodyVector(predictedUp, measuredUp, cfg.accelGain);
    qNew = Q.normalize(Q.multiply(qNew, tiltCorrection));

    if (magMeasured) {
      const up = V.normalize(Q.rotateVector(Q.conjugate(qNew), [0, 1, 0]));
      const measuredNorth = V.normalize(projectPerp(magMeasured, up));
      const predictedNorth = V.normalize(projectPerp(Q.rotateVector(Q.conjugate(qNew), V.normalize(magFieldWorld)), up));
      if (V.length(measuredNorth) > 1e-6 && V.length(predictedNorth) > 1e-6) {
        const yawCorrection = correctionTowardBodyVector(predictedNorth, measuredNorth, cfg.magGain);
        qNew = Q.normalize(Q.multiply(qNew, yawCorrection));
      }
    }
    return qNew;
  }

  // A compact per-axis Kalman filter over (angle, gyro bias) for roll,
  // pitch, and yaw independently — the standard "IMU attitude KF"
  // structure. Angle here is tracked as the axis-angle deviation from
  // the current quaternion each step (i.e. this KF only ever estimates
  // a SMALL correction each tick, then folds it into the quaternion and
  // resets), so it inherits the same gimbal-lock-free propagation as
  // everything else, while still gaining the KF's real advantage: an
  // explicit, converging estimate of gyro bias itself.
  function createKalmanState() {
    return {
      biasEstimate: [0, 0, 0],
      P: [ // 2x2 covariance per axis: [[angleVar, cov],[cov, biasVar]]
        [1, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 1],
      ],
    };
  }

  function kalmanStep(q, kf, gyroMeasured, accelMeasured, magMeasured, magFieldWorld, dt, cfg) {
    // Process: propagate with bias-corrected gyro rate.
    const correctedRate = gyroMeasured.map((g, i) => g - kf.biasEstimate[i]);
    let qNew = Q.integrateBodyRate(q, correctedRate, dt);

    // Measurement: the same body-frame vector observations as the
    // complementary filter, converted into an axis-angle correction
    // vector (one small rotation, decomposed per axis for the KF).
    // Same inversion as correctionTowardBodyVector above: the vector fed
    // in here ultimately becomes a right-multiplied body-frame rotation
    // (q ⊗ correction), so it must be "measured onto predicted", not the
    // other way round.
    const measuredUp = V.normalize(accelMeasured);
    const predictedUp = V.normalize(Q.rotateVector(Q.conjugate(qNew), [0, 1, 0]));
    const tiltAxis = V.cross(measuredUp, predictedUp);
    const tiltAngle = Math.atan2(V.length(tiltAxis), Math.max(-1, Math.min(1, V.dot(measuredUp, predictedUp))));
    let measurementVec = tiltAngle > 1e-9 ? V.scale(V.normalize(tiltAxis), tiltAngle) : [0, 0, 0];

    if (magMeasured) {
      const up = V.normalize(Q.rotateVector(Q.conjugate(qNew), [0, 1, 0]));
      const measuredNorth = V.normalize(projectPerp(magMeasured, up));
      const predictedNorth = V.normalize(projectPerp(Q.rotateVector(Q.conjugate(qNew), V.normalize(magFieldWorld)), up));
      if (V.length(measuredNorth) > 1e-6 && V.length(predictedNorth) > 1e-6) {
        const yawAxis = V.cross(measuredNorth, predictedNorth);
        const yawAngle = Math.atan2(V.length(yawAxis), Math.max(-1, Math.min(1, V.dot(measuredNorth, predictedNorth))));
        if (yawAngle > 1e-9) measurementVec = V.add(measurementVec, V.scale(V.normalize(yawAxis), yawAngle));
      }
    }

    // Independent scalar KF per axis of that correction vector. State is
    // [angle_error, bias]; the process model is angle_error' = angle_error
    // - bias*dt (an uncorrected bias silently accumulates angle error),
    // bias' = bias (a slow random walk only via process noise) — so the
    // transition matrix F = [[1,-dt],[0,1]] and covariance must propagate
    // as F P F^T + Q, not just have noise added to the diagonal: without
    // the F P F^T cross term, the angle-bias covariance that the update
    // step needs to actually learn the bias (via kBias = pBA/S) can never
    // become nonzero — it starts at 0 and (F P F^T's off-diagonal term
    // being the only source of cross-covariance) stays exactly 0 forever,
    // so the bias estimate silently never moves. Caught by checking the
    // bias estimate against its known true value, not just checking that
    // the overall orientation output looked stable.
    const Q_process = cfg.processNoise, R_meas = cfg.measurementNoise;
    const correction = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const [pAA0, pAB0, pBA0, pBB0] = kf.P[i];
      const pAA = pAA0 - dt * pBA0 - dt * pAB0 + dt * dt * pBB0 + Q_process.angle * dt;
      const pAB = pAB0 - dt * pBB0;
      const pBA = pBA0 - dt * pBB0;
      const pBB = pBB0 + Q_process.bias * dt;
      // Update using the measured small-angle correction as the
      // observation of the (bias-driven) angle error accumulated this
      // step: z = measurementVec[i], predicted z = 0 - bias*dt (the
      // angle we'd have drifted by from an uncorrected bias).
      const predictedZ = -kf.biasEstimate[i] * dt;
      const innovation = measurementVec[i] - predictedZ;
      const S = pAA + R_meas;
      const kAngle = pAA / S, kBias = pBA / S;
      correction[i] = kAngle * innovation;
      kf.biasEstimate[i] += kBias * innovation / Math.max(dt, 1e-6);
      const newPAA = pAA - kAngle * pAA, newPAB = pAB - kAngle * pAB;
      const newPBA = pBA - kBias * pAA, newPBB = pBB - kBias * pAB;
      kf.P[i] = [newPAA, newPAB, newPBA, newPBB];
    }

    const correctionMag = V.length(correction);
    if (correctionMag > 1e-9) {
      const correctionQ = Q.fromAxisAngle(V.scale(correction, 1 / correctionMag), correctionMag);
      qNew = Q.normalize(Q.multiply(qNew, correctionQ));
    }
    return qNew;
  }

  window.Fusion = { gyroOnlyStep, complementaryStep, createKalmanState, kalmanStep };
})();
