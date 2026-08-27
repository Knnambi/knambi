/*
 * timing.js — the headline numbers this whole demo exists to make
 * intuitive: why CCD readout is slow and CMOS readout is fast.
 *
 * Model: `pixelClockHz` is how many clock cycles the sensor's readout
 * electronics can perform per second.
 *   CCD  needs ~one cycle PER PIXEL (serial shift through one amplifier),
 *        plus one cycle per row (the vertical shift into the register).
 *   CMOS needs ~one cycle PER ROW (all columns in a row convert through
 *        their own amplifier/ADC in parallel), so it is roughly `width`
 *        times faster for the same clock — the real-world reason
 *        column-parallel CMOS sensors dominate high-frame-rate video.
 *
 * This intentionally ignores second-order overhead (ADC conversion
 * cycles, row/column select settling time, blanking intervals) to keep
 * the ~N-times speedup the single, clear takeaway. See README.md.
 */
(function () {
  "use strict";

  function ccdReadoutSeconds(w, h, pixelClockHz) {
    const cycles = h + w * h; // h vertical shifts + w*h serial pixel shifts
    return cycles / pixelClockHz;
  }

  function cmosReadoutSeconds(w, h, pixelClockHz) {
    const cycles = h; // one row-parallel conversion cycle per row
    return cycles / pixelClockHz;
  }

  // Rough, relative power estimate — NOT calibrated milliwatts.
  // CCD: constant cost to run the high-voltage transfer clocks for the
  //      whole (slow) readout, plus one always-on output amplifier.
  // CMOS: a small idle cost per pixel (every pixel has an amplifier
  //       whether or not it's currently being read) plus a short burst
  //       while the much shorter readout runs; global shutter adds a
  //       fixed overhead for the extra per-pixel storage node it needs.
  function relativePower(w, h, readoutSeconds, arch, globalShutter) {
    const n = w * h;
    if (arch === "ccd") {
      const CLOCK_DRIVER_COST = 4.0; // relative units/sec of readout
      const BASE_IDLE = 0.6;
      return BASE_IDLE + CLOCK_DRIVER_COST * readoutSeconds * 1000;
    }
    const PER_PIXEL_IDLE = 0.0025;
    const READOUT_BURST_COST = 1.2;
    const GLOBAL_SHUTTER_OVERHEAD = globalShutter ? 0.5 : 0;
    return PER_PIXEL_IDLE * n + READOUT_BURST_COST * readoutSeconds * 1000 + GLOBAL_SHUTTER_OVERHEAD;
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Timing = { ccdReadoutSeconds, cmosReadoutSeconds, relativePower };
})();
