/*
 * rng.js — seeded random numbers + the two noise distributions the whole
 * simulation leans on: Gaussian (read noise, FPN) and Poisson (shot noise).
 *
 * Everything here is namespaced under Sensor.RNG so plain script tags
 * (no bundler, no ES modules) can be loaded in order without collisions.
 * Seeded PRNG (not Math.random) so "Reseed sensor" can regenerate a fixed
 * fixed-pattern-noise map on demand, and so the same seed reproduces the
 * same sensor imperfections — real FPN is a fixed trait of a physical chip.
 */
(function () {
  "use strict";

  // Mulberry32 — small, fast, good-enough-for-pedagogy PRNG.
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

  // Standard normal via Box-Muller, using a given rng() -> [0,1) source.
  function gaussian(rng, mean, sigma) {
    let u1 = 0;
    while (u1 <= 1e-12) u1 = rng(); // avoid log(0)
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
  }

  // Poisson sampling — the classic model for photon shot noise.
  // Knuth's algorithm is exact but O(lambda), which is too slow once a
  // photosite is collecting thousands of electrons. Above a threshold we
  // switch to a Gaussian approximation (valid for large lambda by the
  // central limit theorem) — a standard, well-known practical shortcut,
  // called out here and in the README rather than left silent.
  const POISSON_EXACT_LIMIT = 40;
  function poisson(rng, lambda) {
    if (lambda <= 0) return 0;
    if (lambda < POISSON_EXACT_LIMIT) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= rng();
      } while (p > L);
      return k - 1;
    }
    // Gaussian approximation, clamped to a physically sane >=0 integer.
    const sample = gaussian(rng, lambda, Math.sqrt(lambda));
    return Math.max(0, Math.round(sample));
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.RNG = { makeRng, gaussian, poisson };
})();
