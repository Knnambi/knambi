/*
 * position.js — the classic IMU-alone position failure: double-integrate
 * the (noisy) accelerometer into velocity, then into position, with no
 * outside correction at all (no GPS, no vision, nothing). Orientation
 * error compounds into this too — you need to know which way "down" is
 * to remove gravity before integrating, so a drifting orientation
 * estimate makes an already-bad position estimate worse.
 */
(function () {
  "use strict";

  const V = window.Vec3;
  const Q = window.Quat;

  function createState() {
    return { velocity: [0, 0, 0], position: [0, 0, 0] };
  }

  // accelMeasuredBody: this tick's noisy accelerometer reading (specific
  // force, body frame). orientationEstimate: whichever fusion mode is
  // currently selected — its own error becomes part of the position
  // error too, exactly like a real strapdown INS.
  function step(state, accelMeasuredBody, orientationEstimate, gravity, dt) {
    const specificForceWorld = Q.rotateVector(orientationEstimate, accelMeasuredBody);
    const accelWorld = V.add(specificForceWorld, [0, -gravity, 0]); // add gravity back to recover true motion accel
    const velocity = V.add(state.velocity, V.scale(accelWorld, dt));
    const position = V.add(state.position, V.scale(V.add(state.velocity, velocity), 0.5 * dt)); // trapezoidal
    return { velocity, position };
  }

  window.PositionEstimate = { createState, step };
})();
