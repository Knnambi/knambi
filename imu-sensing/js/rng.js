/*
 * rng.js — seeded PRNG + Gaussian sampling, so scene layout and any
 * per-run noise are reproducible and reseedable rather than relying on
 * Math.random.
 */
(function () {
  "use strict";

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng, mean, sigma) {
    let u1 = 0;
    while (u1 <= 1e-12) u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
  }

  window.RNG = { makeRng, gaussian };
})();
