/*
 * render.js — all canvas drawing. Kept separate from the simulation
 * logic so the physics/architecture code above has zero DOM/canvas
 * dependencies and can be read (or reused, or unit-tested) on its own.
 */
(function () {
  "use strict";

  const UNREAD_COLOR = "#1b2430"; // placeholder for photosites not yet read out
  const GRID_LINE = "rgba(255,255,255,0.05)";

  // Paints a w x h grid of photosites into `ctx` at `cellPx` per cell.
  // valueFn(x,y) returns either a 0..1 grayscale level, or null if that
  // photosite hasn't been read out yet (drawn as UNREAD_COLOR instead).
  function drawGrid(ctx, cellPx, w, h, valueFn) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = valueFn(x, y);
        if (v === null) {
          ctx.fillStyle = UNREAD_COLOR;
        } else {
          const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
          ctx.fillStyle = "rgb(" + g + "," + g + "," + g + ")";
        }
        ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
      }
    }
    if (cellPx >= 6) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x++) {
        ctx.beginPath(); ctx.moveTo(x * cellPx, 0); ctx.lineTo(x * cellPx, h * cellPx); ctx.stroke();
      }
      for (let y = 0; y <= h; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * cellPx); ctx.lineTo(w * cellPx, y * cellPx); ctx.stroke();
      }
    }
  }

  // CCD readout overlay: a horizontal "shift register" strip below the
  // array, the packet currently queued in it, a highlighted cell for the
  // pixel presently at the single output amplifier (bottom-right node),
  // and a wire connecting them — the bucket-brigade, drawn literally.
  function drawCCDOverlay(ctx, cellPx, w, h, phase, ampFlashCounter) {
    const registerY = h * cellPx;
    const registerH = Math.max(10, cellPx);
    ctx.fillStyle = "#2a2340";
    ctx.fillRect(0, registerY, w * cellPx, registerH);

    if (phase.type === "vshift") {
      // whole row is dropping into the register: highlight the row and
      // draw it "falling" into the strip below.
      ctx.strokeStyle = "#c98af0";
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, phase.row * cellPx + 0.5, w * cellPx - 1, cellPx - 1);
    } else if (phase.type === "hshift") {
      // the packet currently shifting through the register toward the amp
      ctx.fillStyle = "#c98af0";
      ctx.fillRect(phase.col * cellPx, registerY + registerH / 4, cellPx, registerH / 2);
      ctx.strokeStyle = "#c98af0";
      ctx.lineWidth = 2;
      ctx.strokeRect(phase.col * cellPx + 0.5, phase.row * cellPx + 0.5, cellPx - 1, cellPx - 1);
    }

    // The single output amplifier, bottom-right corner. It "flashes"
    // for a couple of frames every time a pixel is clocked out.
    const ampR = Math.max(6, cellPx * 0.9);
    const ampX = w * cellPx + 14, ampY = registerY + registerH / 2;
    ctx.beginPath();
    ctx.arc(ampX, ampY, ampR, 0, Math.PI * 2);
    ctx.fillStyle = ampFlashCounter > 0 ? "#f0c040" : "#5b6b63";
    ctx.fill();
    ctx.fillStyle = "#9aa89f";
    ctx.font = "10px monospace";
    ctx.fillText("amp", ampX - 10, ampY + ampR + 12);
  }

  // CMOS readout overlay: the current row lit up all at once (parallel
  // column ADCs), with small tick marks along the right edge to suggest
  // "many amplifiers working together," not one serial path.
  function drawCMOSOverlay(ctx, cellPx, w, h, phase) {
    if (phase.type !== "row") return;
    ctx.strokeStyle = "#6fa3ec";
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, phase.row * cellPx + 0.5, w * cellPx - 1, cellPx - 1);
    ctx.fillStyle = "#6fa3ec";
    for (let x = 0; x < w; x++) {
      ctx.fillRect(x * cellPx + cellPx * 0.15, h * cellPx + 3, cellPx * 0.7, 4);
    }
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Render = { drawGrid, drawCCDOverlay, drawCMOSOverlay, UNREAD_COLOR };
})();
