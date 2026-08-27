/*
 * adc.js — the last stop before a "digital image" exists: add read
 * noise (temporal, different every frame — unlike FPN), then quantize
 * to the chosen bit depth.
 */
(function () {
  "use strict";

  /**
   * @param electrons  Float32Array, post-FPN electron-equivalent signal
   * @param fullWellE  used to set the ADC's full-scale range
   * @param readNoiseE read noise standard deviation, electrons
   * @param bitDepth   8, 10, or 12
   * @param rng        Sensor.RNG generator
   * @returns {{ dn: Uint16Array, maxDn: number }} dn = digital number per
   *          photosite in [0, 2^bitDepth - 1]
   */
  function convert(electrons, fullWellE, readNoiseE, bitDepth, rng) {
    const n = electrons.length;
    const maxDn = Math.pow(2, bitDepth) - 1;
    const dn = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const noised = electrons[i] + Sensor.RNG.gaussian(rng, 0, readNoiseE);
      const frac = Math.min(1, Math.max(0, noised / fullWellE));
      dn[i] = Math.round(frac * maxDn);
    }
    return { dn, maxDn };
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.ADC = { convert };
})();
