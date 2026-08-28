/*
 * noise.js — the three IMU noise categories found on every real
 * datasheet, modeled as three DISTINCT mechanisms because they behave
 * distinctly, not as one lumped "noisiness" knob:
 *
 *   - white noise: independent random error every sample, doesn't
 *     accumulate — averages out over time (e.g. via a low-pass filter),
 *     but never disappears from a single reading.
 *   - bias: a fixed per-axis offset, constant for the whole run — the
 *     sensor is simply always wrong by the same fixed amount.
 *   - bias drift ("bias instability" / random walk): the bias ITSELF
 *     slowly wanders over time. This is the one that makes long-term
 *     integration (gyro angle, double-integrated position) hopeless
 *     without external correction — a fixed bias could in principle be
 *     calibrated out once; a drifting one can't.
 */
(function () {
  "use strict";

  const RNG = window.RNG;

  // One noise channel per scalar signal (so an accelerometer or
  // gyroscope needs three of these, one per axis).
  function createChannel(cfg, rng) {
    return {
      bias: cfg.bias,          // fixed, m/s^2 or rad/s
      driftAccum: 0,           // current wandered-bias value
      driftRate: cfg.driftRate, // how fast the bias itself wanders, per sqrt(s)
      whiteNoiseStd: cfg.whiteNoiseStd,
      rng,
    };
  }

  function step(channel, trueValue, dt) {
    // Bias drift is a discrete random walk: each step's increment scales
    // with sqrt(dt) so the drift's variance grows linearly with time
    // (the standard, correct way to discretize a continuous random
    // walk / Wiener process — halving dt does not change the total
    // drift accumulated over a fixed wall-clock duration).
    channel.driftAccum += RNG.gaussian(channel.rng, 0, channel.driftRate * Math.sqrt(dt));
    const white = RNG.gaussian(channel.rng, 0, channel.whiteNoiseStd);
    return trueValue + channel.bias + channel.driftAccum + white;
  }

  function reset(channel) { channel.driftAccum = 0; }

  window.Noise = { createChannel, step, reset };
})();
