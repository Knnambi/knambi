/*
 * stats.js — the numbers in the comparison panel: SNR, and whether this
 * frame shows the artifact each architecture is known for.
 */
(function () {
  "use strict";

  // Signal-to-noise ratio, estimated from the finished digital image.
  // A naive mean(DN)/stdev(DN) over the *whole* frame would conflate
  // real scene contrast (e.g. a bright bar against a dark background)
  // with actual sensor noise, making high-contrast test scenes always
  // read as "noisy" regardless of exposure/temperature settings.
  // Instead we take the darker half of the pixel population as a proxy
  // for a flat region of the scene (every built-in scene has one) and
  // measure mean/stdev there — a simplification (a rigorous per-pixel
  // SNR would need a noise-free reference frame to compare against),
  // but one that responds to the settings a viewer is actually
  // adjusting, and stays directly comparable between CCD and CMOS since
  // both use the same formula on the same scene.
  function snrDb(dn) {
    const sorted = Float64Array.from(dn).sort();
    const flat = sorted.subarray(0, Math.max(1, Math.floor(sorted.length / 2)));
    let sum = 0;
    for (let i = 0; i < flat.length; i++) sum += flat[i];
    const mean = sum / flat.length;
    let variance = 0;
    for (let i = 0; i < flat.length; i++) variance += (flat[i] - mean) * (flat[i] - mean);
    variance /= flat.length;
    const noise = Math.sqrt(variance) || 1e-6;
    if (mean <= 0) return -Infinity;
    return 20 * Math.log10(mean / noise);
  }

  function hasBlooming(overflow) {
    for (let i = 0; i < overflow.length; i++) if (overflow[i] > 0) return true;
    return false;
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Stats = { snrDb, hasBlooming };
})();
