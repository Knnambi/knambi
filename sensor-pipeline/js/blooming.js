/*
 * blooming.js — CCD-only failure mode. When a photosite's well overflows,
 * the excess charge has nowhere to go but the shared vertical charge-
 * transfer channel, bleeding into the photosites above and below it in
 * the same column. That's why real CCD blooming shows up as a vertical
 * streak through bright highlights, not a blob.
 *
 * CMOS sensors don't share this failure mode the same way (each pixel
 * has its own isolated well/amplifier), so this function is only ever
 * called for the CCD pipeline.
 */
(function () {
  "use strict";

  // Gives `amount` electrons to photosite (x,ny) in `charge`, clamped to
  // full well; whatever doesn't fit is recorded into `spillOut` so it can
  // keep bleeding further on the next pass. Returns nothing (mutates).
  function deposit(charge, spillOut, w, x, ny, amount, fullWellE) {
    const idx = ny * w + x;
    const room = Math.max(0, fullWellE - charge[idx]);
    const accepted = Math.min(room, amount);
    charge[idx] += accepted;
    const leftover = amount - accepted;
    if (leftover > 0) spillOut[idx] += leftover;
  }

  /**
   * Bleeds each photosite's overflow into its vertical neighbors,
   * iterating a few passes so overflow can cascade further up/down a
   * column if a neighbor saturates too from the charge it just received.
   * Does not mutate its inputs — returns a new electrons grid.
   */
  function applyBlooming(electrons, overflow, w, h, fullWellE, passes) {
    let charge = Float32Array.from(electrons);
    let spill = Float32Array.from(overflow);

    for (let pass = 0; pass < passes; pass++) {
      const nextCharge = Float32Array.from(charge);
      const nextSpill = new Float32Array(w * h);
      let anySpill = false;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = spill[y * w + x];
          if (s <= 0) continue;
          anySpill = true;

          const hasUp = y > 0, hasDown = y < h - 1;
          if (hasUp && hasDown) {
            deposit(nextCharge, nextSpill, w, x, y - 1, s / 2, fullWellE);
            deposit(nextCharge, nextSpill, w, x, y + 1, s / 2, fullWellE);
          } else if (hasUp) {
            deposit(nextCharge, nextSpill, w, x, y - 1, s, fullWellE);
          } else if (hasDown) {
            deposit(nextCharge, nextSpill, w, x, y + 1, s, fullWellE);
          }
          // else: a single-row column has nowhere to bleed; the charge
          // is lost off the end of the register, as it would be in life.
        }
      }

      charge = nextCharge;
      spill = nextSpill;
      if (!anySpill) break;
    }
    return charge;
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Blooming = { applyBlooming };
})();
