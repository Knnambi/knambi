/*
 * fpn.js — fixed-pattern noise: the part of a sensor's noise that is a
 * property of the physical chip, not of any single exposure. Every frame
 * from the same sensor shows the *same* pattern, which is exactly what
 * makes it distinct from shot/read noise and why it's generated once
 * and reused across frames (until "Reseed sensor" is clicked).
 *
 *   CCD:  one amplifier chain per column of the shift register, so any
 *         gain/offset error is shared by every pixel in that column —
 *         the model here follows the assignment's spec of per-column FPN.
 *   CMOS: one amplifier per pixel, so mismatch is per-pixel.
 */
(function () {
  "use strict";

  const GAIN_SIGMA = 0.02;   // ~2% gain mismatch between amplifiers
  const OFFSET_SIGMA_E = 6;  // electrons-equivalent offset mismatch

  function makeColumnFPN(w, rng) {
    const gain = new Float32Array(w);
    const offset = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      gain[x] = 1 + Sensor.RNG.gaussian(rng, 0, GAIN_SIGMA);
      offset[x] = Sensor.RNG.gaussian(rng, 0, OFFSET_SIGMA_E);
    }
    return { kind: "column", gain, offset };
  }

  function makePixelFPN(w, h, rng) {
    const n = w * h;
    const gain = new Float32Array(n);
    const offset = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      gain[i] = 1 + Sensor.RNG.gaussian(rng, 0, GAIN_SIGMA);
      offset[i] = Sensor.RNG.gaussian(rng, 0, OFFSET_SIGMA_E);
    }
    return { kind: "pixel", gain, offset };
  }

  // Applies a previously-generated FPN map to an electrons grid.
  function applyFPN(electrons, w, h, fpn) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const paramIdx = fpn.kind === "column" ? x : idx;
        out[idx] = Math.max(0, electrons[idx] * fpn.gain[paramIdx] + fpn.offset[paramIdx]);
      }
    }
    return out;
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.FPN = { makeColumnFPN, makePixelFPN, applyFPN };
})();
