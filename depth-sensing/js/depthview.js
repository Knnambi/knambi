/*
 * depthview.js — canvas drawing for all three sensors, using one shared
 * visual language so the three depth maps are actually comparable at a
 * glance: the same near/far color scale, and the same "hole" color for
 * a pixel with no confident reading (never silently rendered as if it
 * were a real far-away measurement).
 */
(function () {
  "use strict";

  const NEAR_COLOR = [240, 176, 82];  // warm — close
  const FAR_COLOR = [32, 54, 110];    // cool — far
  const HOLE_COLOR = "#4a1620";       // no confident reading at all

  function depthColor(depth, minDepth, maxDepth) {
    const t = Math.max(0, Math.min(1, (depth - minDepth) / (maxDepth - minDepth)));
    const r = Math.round(NEAR_COLOR[0] + (FAR_COLOR[0] - NEAR_COLOR[0]) * t);
    const g = Math.round(NEAR_COLOR[1] + (FAR_COLOR[1] - NEAR_COLOR[1]) * t);
    const b = Math.round(NEAR_COLOR[2] + (FAR_COLOR[2] - NEAR_COLOR[2]) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // Generic w x h grid painter. valueFn(x,y) -> depth in meters, or
  // null/NaN for "no reading" (drawn as HOLE_COLOR).
  function drawDepthGrid(ctx, cellPx, w, h, valueFn, minDepth, maxDepth) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = valueFn(x, y);
        ctx.fillStyle = (v === null || v === undefined || !isFinite(v)) ? HOLE_COLOR : depthColor(v, minDepth, maxDepth);
        ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
      }
    }
  }

  // Grayscale brightness grid (0..1), used for the plain camera views.
  function drawBrightnessGrid(ctx, cellPx, w, h, valueFn) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.max(0, Math.min(1, valueFn(x, y)));
        const g = Math.round(v * 255);
        ctx.fillStyle = "rgb(" + g + "," + g + "," + g + ")";
        ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
      }
    }
  }

  // ToF wavefront: a stylized expanding ring over the canvas center,
  // drawn while acquisition is in progress. Purely illustrative — the
  // actual per-pixel reveal timing is driven by true distance, computed
  // in main.js, not by anything about this ring's radius or position.
  function drawWavefrontRing(ctx, canvasWidthPx, canvasHeightPx, radiusPx) {
    ctx.save();
    ctx.strokeStyle = "rgba(240,176,82,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasWidthPx / 2, canvasHeightPx / 2, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Structured-light dot overlay: small crosses at the expected
  // (calibration-plane) position and dots at the observed position,
  // with a connecting line — the shift *is* the visualization.
  function drawDotPattern(ctx, scaleX, scaleY, dots) {
    for (const d of dots) {
      if (d.expectedPixel) {
        ctx.strokeStyle = "rgba(111,163,236,0.55)";
        ctx.lineWidth = 1;
        const ex = d.expectedPixel[0] * scaleX, ey = d.expectedPixel[1] * scaleY;
        ctx.beginPath();
        ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey);
        ctx.moveTo(ex, ey - 3); ctx.lineTo(ex, ey + 3);
        ctx.stroke();
      }
      if (d.observedPixel && d.expectedPixel) {
        const ex = d.expectedPixel[0] * scaleX, ey = d.expectedPixel[1] * scaleY;
        const ox = d.observedPixel[0] * scaleX, oy = d.observedPixel[1] * scaleY;
        ctx.strokeStyle = d.valid ? "rgba(240,176,82,0.5)" : "rgba(220,70,70,0.35)";
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ox, oy); ctx.stroke();
        ctx.fillStyle = d.valid ? "#f0b052" : "#dc4646";
        ctx.beginPath(); ctx.arc(ox, oy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  window.Depth = window.Depth || {};
  window.Depth.View = { depthColor, drawDepthGrid, drawBrightnessGrid, drawWavefrontRing, drawDotPattern, HOLE_COLOR, NEAR_COLOR, FAR_COLOR };
})();
