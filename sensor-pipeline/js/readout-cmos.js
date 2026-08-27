/*
 * readout-cmos.js — column-parallel readout: every pixel already has its
 * own amplifier, and a row of per-column ADCs converts an ENTIRE ROW at
 * once. So the sensor only needs one step per ROW, not per pixel — the
 * direct visual and numerical contrast with the CCD's one-step-per-PIXEL
 * bucket brigade.
 *
 * Rolling vs. global shutter is decided earlier, at capture time (see
 * capture.js's rowTime callback in main.js) — by the time charge reaches
 * this stepper, both shutter modes are read out identically. That's
 * physically accurate: even global-shutter CMOS sensors typically still
 * read out row-by-row after simultaneously latching every pixel to a
 * shielded storage node.
 */
(function () {
  "use strict";

  function makeCMOSReadout(charge, w, h, pixelFPN, opts) {
    // opts: { fullWellE, readNoiseE, bitDepth, rng }
    const maxDn = Math.pow(2, opts.bitDepth) - 1;
    const dn = new Uint16Array(w * h);
    const revealed = new Uint8Array(w * h);
    const totalSteps = h; // one row-parallel conversion per row
    let step = 0;

    function readOneRow(row) {
      for (let col = 0; col < w; col++) {
        const idx = row * w + col;
        const withFPN = Math.max(0, charge[idx] * pixelFPN.gain[idx] + pixelFPN.offset[idx]);
        const noised = withFPN + Sensor.RNG.gaussian(opts.rng, 0, opts.readNoiseE);
        const frac = Math.min(1, Math.max(0, noised / opts.fullWellE));
        dn[idx] = Math.round(frac * maxDn);
        revealed[idx] = 1;
      }
    }

    return {
      w: w, h: h, totalSteps: totalSteps,
      dn: dn, revealed: revealed,
      isDone: function () { return step >= totalSteps; },
      currentStep: function () { return step; },
      currentPhase: function () { return step < totalSteps ? { type: "row", row: step } : { type: "done" }; },
      step: function () {
        if (step >= totalSteps) return false;
        readOneRow(step);
        step += 1;
        return true;
      },
    };
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.ReadoutCMOS = { makeCMOSReadout };
})();
