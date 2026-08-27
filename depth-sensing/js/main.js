/*
 * main.js — wires controls to the three sensor modules, runs them
 * against one shared scene, and drives a single unified "acquisition
 * progress" animation across all three panels so their step-through
 * behavior stays comparable. All the actual sensing math lives in
 * tof.js / structured-light.js / stereo.js; this file is state,
 * wiring, and drawing calls only.
 */
(function () {
  "use strict";

  const D = window.Depth;
  const V = D.Vec3;

  const FOV_WIDE = 60 * Math.PI / 180;   // reference view, ToF, stereo
  const FOV_NARROW = 35 * Math.PI / 180; // structured light (see README: a
                                          // narrower working FOV is realistic
                                          // for a close/mid-range dot projector,
                                          // and keeps per-pixel angular
                                          // resolution usable at this sensor size)
  const DISPLAY_BUDGET_PX = 220;

  const el = (id) => document.getElementById(id);
  const controlsEl = {
    resolution: el("resolution"), layout: el("layout"),
    objectCount: el("objectCount"), distance: el("distance"),
    surfaceType: el("surfaceType"), ambient: el("ambient"), texture: el("texture"),
    baseline: el("baseline"), jitter: el("jitter"), speed: el("speed"),
  };
  const readouts = {
    objectCountVal: el("objectCountVal"), distanceVal: el("distanceVal"),
    ambientVal: el("ambientVal"), textureVal: el("textureVal"),
    baselineVal: el("baselineVal"), jitterVal: el("jitterVal"), speedVal: el("speedVal"),
  };
  const buttons = { capture: el("captureBtn"), reset: el("resetBtn"), step: el("stepBtn"), run: el("runBtn") };
  const progressPct = el("progressPct");

  const sourceCanvas = el("sourceCanvas");
  const tofCanvas = el("tofCanvas");
  const slPatternCanvas = el("slPatternCanvas"), slDepthCanvas = el("slDepthCanvas");
  const stereoViewsCanvas = el("stereoViewsCanvas"), stereoDepthCanvas = el("stereoDepthCanvas");
  const tofStatsEl = el("tofStats"), slStatsEl = el("slStats"), stereoStatsEl = el("stereoStats");
  const compareBody = document.querySelector("#compareTable tbody");

  const rng = D.RNG.makeRng(0xdeadbeef);

  let res = 32, gridSize = 16, cellPx = 6, cellPxSL = 6;
  let progress = 0; // 0..1 shared acquisition progress
  let isRunning = false, rafId = null;
  let frame = null; // holds everything computed for the current capture

  function readControls() {
    return {
      resolution: parseInt(controlsEl.resolution.value, 10),
      layout: controlsEl.layout.value,
      objectCount: parseInt(controlsEl.objectCount.value, 10),
      objectDistance: parseFloat(controlsEl.distance.value),
      surfaceType: controlsEl.surfaceType.value,
      ambient: parseFloat(controlsEl.ambient.value) / 100,
      textureDensity: parseFloat(controlsEl.texture.value) / 100,
      baseline: parseFloat(controlsEl.baseline.value),
      jitterMultiplier: parseFloat(controlsEl.jitter.value),
      speed: parseInt(controlsEl.speed.value, 10),
    };
  }

  function sizeCanvases() {
    cellPx = Math.max(3, Math.floor(DISPLAY_BUDGET_PX / res));
    cellPxSL = Math.max(4, Math.floor(DISPLAY_BUDGET_PX / gridSize));
    const g = res * cellPx, sl = gridSize * cellPxSL;
    sourceCanvas.width = g; sourceCanvas.height = g;
    tofCanvas.width = g; tofCanvas.height = g;
    slPatternCanvas.width = g; slPatternCanvas.height = g;
    slDepthCanvas.width = sl; slDepthCanvas.height = sl;
    stereoViewsCanvas.width = g * 2 + 4; stereoViewsCanvas.height = g;
    stereoDepthCanvas.width = g; stereoDepthCanvas.height = g;
  }

  // ---------- capture: build the scene, run all three sensors ----------
  function doCapture() {
    const cfg = readControls();
    res = cfg.resolution;
    gridSize = Math.max(8, Math.round(res / 2));
    sizeCanvases();

    const prims = D.Scene.buildScene(cfg);

    const mainCam = D.Camera.makeCamera([0, 0, 0], FOV_WIDE, res, res);
    const slCam = D.Camera.makeCamera([0, 0, 0], FOV_NARROW, res, res);
    const projector = D.Camera.makeCamera([cfg.baseline, 0, 0], FOV_NARROW, gridSize, gridSize);
    const leftCam = D.Camera.makeCamera([-cfg.baseline / 2, 0, 0], FOV_WIDE, res, res);
    const rightCam = D.Camera.makeCamera([cfg.baseline / 2, 0, 0], FOV_WIDE, res, res);

    const focalWide = res / (2 * Math.tan(FOV_WIDE / 2));
    const maxDisparity = Math.min(res - 1, Math.ceil((cfg.baseline * focalWide) / 1.4) + 4);

    let t0 = performance.now();
    const tof = D.ToF.simulateToF(mainCam, prims, { jitterMultiplier: cfg.jitterMultiplier, rng });
    const tofMs = performance.now() - t0;

    t0 = performance.now();
    const sl = D.StructuredLight.simulateStructuredLight(slCam, projector, prims, {
      gridSize, baseline: cfg.baseline, ambient: cfg.ambient, rng,
    });
    const slMs = performance.now() - t0;

    t0 = performance.now();
    const stereo = D.Stereo.simulateStereo(leftCam, rightCam, prims, {
      ambient: cfg.ambient, textureDensity: cfg.textureDensity, baseline: cfg.baseline, maxDisparity, rng,
    });
    const stereoMs = performance.now() - t0;

    const referenceView = D.Render.renderView(mainCam, prims, { ambient: cfg.ambient, textureDensity: cfg.textureDensity });

    // Stereo's own ground truth (from the left camera), computed once
    // here rather than inside the per-frame stats update — this is a
    // full raycast pass and render() can run every animation frame.
    const stereoGroundTruth = new Float32Array(res * res).fill(NaN);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      const ray = D.Camera.pixelRay(leftCam, x, y);
      const hit = D.Scene.intersectScene(leftCam.position, ray.dir, prims);
      if (hit) stereoGroundTruth[y * res + x] = hit.t;
    }

    let maxTrueDepth = 0;
    for (let i = 0; i < tof.trueDepth.length; i++) if (isFinite(tof.trueDepth[i])) maxTrueDepth = Math.max(maxTrueDepth, tof.trueDepth[i]);

    frame = {
      cfg, prims, mainCam, slCam, projector, leftCam, rightCam,
      tof, sl, stereo, referenceView, stereoGroundTruth,
      timings: { tofMs, slMs, stereoMs },
      minDepth: 0, maxDepth: Math.max(6, maxTrueDepth * 1.05),
    };

    progress = 0;
    stopRun();
    render();
  }

  // ---------- rendering ----------
  function render() {
    if (!frame) return;
    const { tof, sl, stereo, referenceView, minDepth, maxDepth } = frame;
    const View = D.View;

    // reference view (always fully shown — it's just context)
    D.View.drawBrightnessGrid(sourceCanvas.getContext("2d"), cellPx, res, res, (x, y) => referenceView[y * res + x]);

    // --- ToF: reveal by TRUE distance, so farther pixels appear later,
    // exactly like a real pulse actually would.
    const tofCtx = tofCanvas.getContext("2d");
    const revealDepth = progress * maxDepth;
    View.drawDepthGrid(tofCtx, cellPx, res, res, (x, y) => {
      const idx = y * res + x;
      if (!tof.valid[idx]) return null;
      if (!(tof.trueDepth[idx] <= revealDepth)) return null;
      return tof.measuredDepth[idx];
    }, minDepth, maxDepth);
    if (progress < 1) {
      const ringRadiusPx = progress * (Math.min(tofCanvas.width, tofCanvas.height) / 2) * 1.15;
      View.drawWavefrontRing(tofCtx, tofCanvas.width, tofCanvas.height, ringRadiusPx);
    }

    // --- Structured light: raster-reveal the dot pattern, then the
    // reconstructed depth grid once each dot has "landed".
    const patternCtx = slPatternCanvas.getContext("2d");
    View.drawBrightnessGrid(patternCtx, cellPx, res, res, (x, y) => referenceView[y * res + x] * 0.35);
    const revealCount = Math.floor(progress * sl.dots.length);
    View.drawDotPattern(patternCtx, cellPx, cellPx, sl.dots.slice(0, revealCount));

    const slDepthCtx = slDepthCanvas.getContext("2d");
    View.drawDepthGrid(slDepthCtx, cellPxSL, gridSize, gridSize, (gx, gy) => {
      const idx = gy * gridSize + gx;
      if (idx >= revealCount) return null;
      return sl.validGrid[idx] ? sl.depthGrid[idx] : NaN;
    }, minDepth, maxDepth);

    // --- Stereo: show both camera views immediately (capture is
    // effectively instantaneous), raster-reveal the matched depth map
    // (the part that actually takes "work").
    const viewsCtx = stereoViewsCanvas.getContext("2d");
    View.drawBrightnessGrid(viewsCtx, cellPx, res, res, (x, y) => stereo.leftImage[y * res + x]);
    viewsCtx.save(); viewsCtx.translate(res * cellPx + 4, 0);
    View.drawBrightnessGrid(viewsCtx, cellPx, res, res, (x, y) => stereo.rightImage[y * res + x]);
    viewsCtx.restore();

    const stereoDepthCtx = stereoDepthCanvas.getContext("2d");
    const stereoRevealCount = Math.floor(progress * res * res);
    View.drawDepthGrid(stereoDepthCtx, cellPx, res, res, (x, y) => {
      const idx = y * res + x;
      if (idx >= stereoRevealCount) return null;
      return stereo.valid[idx] ? stereo.depth[idx] : NaN;
    }, minDepth, maxDepth);

    updateStats();
    progressPct.textContent = Math.round(progress * 100) + "%";
    buttons.step.disabled = progress >= 1;
    buttons.run.disabled = progress >= 1;
  }

  // ---------- stats ----------
  function meanAbsError(measured, trueVals, validMask) {
    let sum = 0, n = 0;
    for (let i = 0; i < measured.length; i++) {
      if (validMask && !validMask[i]) continue;
      if (!isFinite(trueVals[i]) || !isFinite(measured[i])) continue;
      sum += Math.abs(measured[i] - trueVals[i]); n++;
    }
    return n ? sum / n : NaN;
  }
  function validFraction(validMask, n) {
    let c = 0;
    for (let i = 0; i < n; i++) if (validMask[i]) c++;
    return c / n;
  }
  function fmtM(v) { return isFinite(v) ? v.toFixed(3) + " m" : "—"; }
  function fmtPct(v) { return isFinite(v) ? Math.round(v * 100) + "%" : "—"; }
  function statRow(label, value, cls) {
    return "<dt>" + label + "</dt><dd" + (cls ? ' class="' + cls + '"' : "") + ">" + value + "</dd>";
  }

  function updateStats() {
    const { tof, sl, stereo, timings } = frame;

    const tofErr = meanAbsError(tof.measuredDepth, tof.trueDepth, tof.valid);
    const tofValidFrac = validFraction(tof.valid, tof.valid.length);
    let multipathN = 0; for (let i = 0; i < tof.multipath.length; i++) if (tof.multipath[i]) multipathN++;
    tofStatsEl.innerHTML =
      statRow("Mean depth error", fmtM(tofErr)) +
      statRow("Valid returns", fmtPct(tofValidFrac), tofValidFrac < 0.7 ? "warn" : "ok") +
      statRow("Multipath-affected px", multipathN, multipathN > 0 ? "warn" : "ok") +
      statRow("Compute", timings.tofMs.toFixed(1) + " ms");

    const slDots = sl.dots;
    let slValidN = 0, slErrSum = 0, slErrN = 0;
    for (const d of slDots) {
      if (d.valid) slValidN++;
      if (d.valid && isFinite(d.trueDepth)) { slErrSum += Math.abs(d.reconstructedDepth - d.trueDepth); slErrN++; }
    }
    slStatsEl.innerHTML =
      statRow("Mean depth error", fmtM(slErrN ? slErrSum / slErrN : NaN)) +
      statRow("Valid dots", fmtPct(slValidN / slDots.length), (slValidN / slDots.length) < 0.4 ? "warn" : "ok") +
      statRow("Compute", timings.slMs.toFixed(1) + " ms");

    const stereoErr = meanAbsError(stereo.depth, frame.stereoGroundTruth, stereo.valid);
    const stereoValidFrac = validFraction(stereo.valid, stereo.valid.length);
    stereoStatsEl.innerHTML =
      statRow("Mean depth error", fmtM(stereoErr)) +
      statRow("Valid matches", fmtPct(stereoValidFrac), stereoValidFrac < 0.3 ? "warn" : "ok") +
      statRow("Compute", timings.stereoMs.toFixed(1) + " ms");

    if (progress >= 1) updateComparisonTable(tofErr, tofValidFrac, slErrN ? slErrSum / slErrN : NaN, slValidN / slDots.length, stereoErr, stereoValidFrac);
  }

  function updateComparisonTable(tofErr, tofValid, slErr, slValid, stereoErr, stereoValid) {
    const { timings, cfg } = frame;
    const rows = [
      ["Mean depth error", fmtM(tofErr), fmtM(slErr), fmtM(stereoErr)],
      ["Valid reading rate", fmtPct(tofValid), fmtPct(slValid), fmtPct(stereoValid)],
      ["Compute time", timings.tofMs.toFixed(1) + " ms", timings.slMs.toFixed(1) + " ms", timings.stereoMs.toFixed(1) + " ms"],
      ["Ambient light (current)", fmtPct(cfg.ambient) + " — robust", fmtPct(cfg.ambient) + (cfg.ambient > 0.5 ? " — degraded" : " — ok"), fmtPct(cfg.ambient) + (cfg.ambient < 0.1 ? " — too dark" : " — ok")],
      ["Surface (current)", cfg.surfaceType, cfg.surfaceType, cfg.surfaceType === "dark" ? cfg.surfaceType + " — low contrast" : cfg.surfaceType],
    ];
    compareBody.innerHTML = rows.map((r) => "<tr><td>" + r.join("</td><td>") + "</td></tr>").join("");
  }

  // ---------- run loop ----------
  function needsLoop() { return isRunning; }
  function tick() {
    const cfg = readControls();
    progress = Math.min(1, progress + cfg.speed / 100);
    render();
    if (progress >= 1) { stopRun(); return; }
    if (needsLoop()) rafId = requestAnimationFrame(tick);
  }
  function startRun() { if (isRunning) return; isRunning = true; buttons.run.textContent = "Pause ❚❚"; rafId = requestAnimationFrame(tick); }
  function stopRun() { isRunning = false; buttons.run.textContent = "Run ▸▸"; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  // ---------- wiring ----------
  function bindLiveLabel(input, labelEl, fmt) {
    input.addEventListener("input", () => { labelEl.textContent = fmt ? fmt(input.value) : input.value; });
  }
  bindLiveLabel(controlsEl.objectCount, readouts.objectCountVal);
  bindLiveLabel(controlsEl.distance, readouts.distanceVal, (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(controlsEl.ambient, readouts.ambientVal);
  bindLiveLabel(controlsEl.texture, readouts.textureVal);
  bindLiveLabel(controlsEl.baseline, readouts.baselineVal, (v) => parseFloat(v).toFixed(2));
  bindLiveLabel(controlsEl.jitter, readouts.jitterVal, (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(controlsEl.speed, readouts.speedVal);

  // Every control triggers a fresh capture except playback speed, which
  // only paces the Run animation and shouldn't re-run the simulations.
  Object.keys(controlsEl).forEach((key) => {
    if (key === "speed") return;
    controlsEl[key].addEventListener("input", doCapture);
    controlsEl[key].addEventListener("change", doCapture);
  });

  buttons.capture.addEventListener("click", doCapture);
  buttons.reset.addEventListener("click", () => { progress = 0; stopRun(); render(); });
  buttons.step.addEventListener("click", () => {
    stopRun();
    const cfg = readControls();
    progress = Math.min(1, progress + Math.max(0.05, cfg.speed / 100));
    render();
  });
  buttons.run.addEventListener("click", () => { if (isRunning) stopRun(); else startRun(); });

  // boot
  doCapture();
})();
