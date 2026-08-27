/*
 * readout-ccd.js — the literal bucket-brigade: one vertical shift of the
 * whole array into the horizontal register, then that row's charge
 * packets shift out ONE AT A TIME through a single output amplifier,
 * before the next row is allowed to shift in. This serial bottleneck
 * (every pixel takes its turn at the one amplifier) is the whole reason
 * CCD readout is slow — the animation is the argument.
 *
 * Returned object is a step-able state machine so main.js can drive it
 * either one micro-step at a time ("Step") or continuously ("Run").
 */
(function () {
  "use strict";

  function makeCCDReadout(charge, w, h, columnFPN, opts) {
    // opts: { fullWellE, readNoiseE, bitDepth, rng }
    const maxDn = Math.pow(2, opts.bitDepth) - 1;
    const dn = new Uint16Array(w * h);
    const revealed = new Uint8Array(w * h);
    const totalSteps = h * (w + 1); // h vertical shifts + w*h serial shifts
    let step = 0;

    // Given the current step index, what is the machine doing right now?
    // type "vshift": row `row` is dropping into the horizontal register.
    // type "hshift": the packet originally at (row,col) is at the output
    //                amplifier this instant, being converted to a number.
    function phaseAt(s) {
      let remaining = s;
      for (let row = 0; row < h; row++) {
        if (remaining === 0) return { type: "vshift", row: row };
        remaining -= 1;
        if (remaining < w) return { type: "hshift", row: row, col: remaining };
        remaining -= w;
      }
      return { type: "done" };
    }

    function readOnePixel(row, col) {
      const idx = row * w + col;
      const withFPN = Math.max(0, charge[idx] * columnFPN.gain[col] + columnFPN.offset[col]);
      const noised = withFPN + Sensor.RNG.gaussian(opts.rng, 0, opts.readNoiseE);
      const frac = Math.min(1, Math.max(0, noised / opts.fullWellE));
      dn[idx] = Math.round(frac * maxDn);
      revealed[idx] = 1;
    }

    return {
      w: w, h: h, totalSteps: totalSteps,
      dn: dn, revealed: revealed,
      isDone: function () { return step >= totalSteps; },
      currentStep: function () { return step; },
      currentPhase: function () { return phaseAt(step); },
      // Advances exactly one micro-step (one row-shift OR one pixel-shift).
      step: function () {
        if (step >= totalSteps) return false;
        const phase = phaseAt(step);
        if (phase.type === "hshift") readOnePixel(phase.row, phase.col);
        step += 1;
        return true;
      },
    };
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.ReadoutCCD = { makeCCDReadout };
})();
