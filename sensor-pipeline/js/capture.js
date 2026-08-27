/*
 * capture.js — stage 1 & 2 of the pipeline: photon capture and charge
 * accumulation. This stage is shared by both architectures; only the
 * *timing* of when each row samples the scene differs (rolling shutter
 * vs. global exposure), which is why `rowTime(row)` is a parameter.
 *
 * Physically-inspired but deliberately simplified constants live at the
 * top of this file — see README.md for what's real vs. illustrative.
 */
(function () {
  "use strict";

  // Electrons generated per unit "light intensity" x "exposure ms" at a
  // fully-illuminated photosite. Arbitrary but fixed unit, tuned so the
  // *default* slider settings land around 40% of full well (a clearly
  // visible image with headroom before saturation) and pushing exposure
  // and intensity to their maxima drives bright areas ~3x over full
  // well — enough to see dramatic blooming without every scene clipping
  // to a solid block. See README.md.
  const QUANTUM_EFFICIENCY_CONST = 300; // electrons / (ms * intensity)

  // Dark current at 25C, electrons/ms, before the temperature scaling.
  const DARK_CURRENT_BASE = 0.35;
  // Real dark current roughly doubles every ~7C — a widely-cited rule of
  // thumb for silicon sensors, not a precise physical law.
  const DARK_DOUBLING_C = 7;

  function darkRatePerMs(temperatureC) {
    return DARK_CURRENT_BASE * Math.pow(2, (temperatureC - 25) / DARK_DOUBLING_C);
  }

  /**
   * Captures one frame of charge.
   * @param {object} scene - from scene.js, provides .sample(x,y,w,h,t)
   * @param {object} opts
   *   w, h            grid size
   *   exposureMs      integration time
   *   lightIntensity  0..1 scene brightness multiplier
   *   temperatureC    sensor temperature (drives dark current)
   *   fullWellE       full well capacity, electrons
   *   rng             Sensor.RNG generator function
   *   rowTime(row)    -> t in [0,1] used to sample the scene for that row
   *                     (rolling shutter passes a per-row value; global
   *                     exposure architectures pass a constant, e.g. 0.5)
   * @returns {{electrons: Float32Array, overflow: Float32Array}}
   *   electrons — charge actually held per photosite, clamped to full well
   *   overflow  — electrons that exceeded full well before clamping
   *               (0 where the photosite didn't saturate); CCD blooming
   *               consumes this, CMOS ignores it (see blooming.js).
   */
  function captureFrame(scene, opts) {
    const { w, h, exposureMs, lightIntensity, temperatureC, fullWellE, rng, rowTime } = opts;
    const n = w * h;
    const electrons = new Float32Array(n);
    const overflow = new Float32Array(n);
    const dark = darkRatePerMs(temperatureC) * exposureMs;

    for (let y = 0; y < h; y++) {
      const t = rowTime(y);
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const flux = scene.sample(x, y, w, h, t); // 0..1
        const expectedSignal = flux * lightIntensity * exposureMs * QUANTUM_EFFICIENCY_CONST;
        const expectedTotal = expectedSignal + dark;
        // Shot noise applies to the total charge collected — signal and
        // dark electrons are physically indistinguishable once they've
        // landed in the potential well, so we sample Poisson once on
        // the sum rather than adding two independently-noised terms.
        const collected = Sensor.RNG.poisson(rng, expectedTotal);
        if (collected > fullWellE) {
          electrons[idx] = fullWellE;
          overflow[idx] = collected - fullWellE;
        } else {
          electrons[idx] = collected;
          overflow[idx] = 0;
        }
      }
    }
    return { electrons, overflow };
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Capture = { captureFrame, darkRatePerMs, QUANTUM_EFFICIENCY_CONST };
})();
