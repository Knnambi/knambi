/*
 * chart.js — a small scrolling multi-series line chart on a plain
 * <canvas>, hand-rolled rather than pulling in a charting library, to
 * keep this app (like its sibling sensor sims) buildable and runnable
 * with zero network access.
 */
(function () {
  "use strict";

  function createChart(canvas, series, opts) {
    opts = opts || {};
    const windowSeconds = opts.windowSeconds || 6;
    const fixedRange = opts.yRange || null; // [min, max], or null to auto-scale
    let buffer = []; // { t, values: [...] }

    function addSample(t, values) {
      buffer.push({ t, values });
      const cutoff = t - windowSeconds;
      while (buffer.length > 1 && buffer[0].t < cutoff) buffer.shift();
    }

    function clear() { buffer = []; }

    function render() {
      const ctx = canvas.getContext("2d");
      const w = canvas.clientWidth || 300, h = canvas.clientHeight || 150;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#11151c";
      ctx.fillRect(0, 0, w, h);
      if (buffer.length < 2) return;

      const tMax = buffer[buffer.length - 1].t, tMin = tMax - windowSeconds;
      let yMin, yMax;
      if (fixedRange) {
        [yMin, yMax] = fixedRange;
      } else {
        yMin = Infinity; yMax = -Infinity;
        for (const s of buffer) for (const v of s.values) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
        if (!isFinite(yMin) || !isFinite(yMax)) { yMin = -1; yMax = 1; }
        if (yMax - yMin < 1e-6) { yMax += 0.5; yMin -= 0.5; }
        const pad = (yMax - yMin) * 0.12;
        yMin -= pad; yMax += pad;
      }

      const xOf = (t) => ((t - tMin) / windowSeconds) * w;
      const yOf = (v) => h - ((v - yMin) / (yMax - yMin)) * h;

      // zero line, if in range
      if (yMin < 0 && yMax > 0) {
        ctx.strokeStyle = "#2a3341"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yOf(0)); ctx.lineTo(w, yOf(0)); ctx.stroke();
      }

      for (let s = 0; s < series.length; s++) {
        ctx.strokeStyle = series[s].color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (const sample of buffer) {
          const v = sample.values[s];
          if (v == null || !isFinite(v)) continue;
          const x = xOf(sample.t), y = yOf(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }

      // legend
      ctx.font = "11px monospace";
      let lx = 6;
      for (const s of series) {
        ctx.fillStyle = s.color;
        ctx.fillRect(lx, 6, 8, 8);
        ctx.fillStyle = "#8b97a7";
        ctx.fillText(s.label, lx + 12, 14);
        lx += 12 + ctx.measureText(s.label).width + 12;
      }
      // current y-range readout (auto-scaled charts only — helps read
      // the numbers off a graph whose scale changes)
      if (!fixedRange) {
        ctx.fillStyle = "#8b97a7";
        ctx.textAlign = "right";
        ctx.fillText(yMax.toFixed(2), w - 4, 12);
        ctx.fillText(yMin.toFixed(2), w - 4, h - 4);
        ctx.textAlign = "left";
      }
    }

    return { addSample, clear, render };
  }

  window.Chart = { createChart };
})();
