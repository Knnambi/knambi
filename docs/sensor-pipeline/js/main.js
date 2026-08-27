/*
 * main.js — wires the DOM controls to the simulation modules above and
 * drives the two readout state machines (Step / Run). This file owns
 * *state and orchestration only*; all the actual sensor physics lives in
 * capture.js / blooming.js / fpn.js / adc.js / timing.js /
 * readout-ccd.js / readout-cmos.js, and all drawing lives in render.js.
 */
(function () {
  "use strict";

  const S = window.Sensor;

  // Read noise differs by architecture on purpose: a single well-tuned
  // CCD output amplifier is traditionally quieter than the many cheaper
  // per-pixel CMOS amplifiers — a real, textbook tradeoff, not an
  // arbitrary knob. See README.md.
  const READ_NOISE_CCD_E = 4;
  const READ_NOISE_CMOS_E = 7;
  const FULL_WELL_E = 20000;
  const BLOOM_PASSES = 6;
  const DISPLAY_BUDGET_PX = 360; // target grid width/height on screen

  // --- DOM ------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const controlsEl = {
    resolution: el("resolution"),
    sceneSelect: el("sceneSelect"),
    imageUpload: el("imageUpload"),
    motionToggle: el("motionToggle"),
    exposure: el("exposure"),
    intensity: el("intensity"),
    temperature: el("temperature"),
    pixelClock: el("pixelClock"),
    bitDepth: el("bitDepth"),
    globalShutter: el("globalShutter"),
    animSpeed: el("animSpeed"),
  };
  const readouts = {
    exposureVal: el("exposureVal"),
    intensityVal: el("intensityVal"),
    tempVal: el("tempVal"),
    clockVal: el("clockVal"),
    animSpeedVal: el("animSpeedVal"),
  };
  const buttons = {
    capture: el("captureBtn"),
    reseed: el("reseedBtn"),
    step: el("stepBtn"),
    run: el("runBtn"),
    resetReadout: el("resetReadoutBtn"),
  };
  const sourceCanvas = el("sourceCanvas");
  const ccdCanvas = el("ccdCanvas");
  const cmosCanvas = el("cmosCanvas");
  const ccdStatsEl = el("ccdStats");
  const cmosStatsEl = el("cmosStats");
  const ccdProgressEl = el("ccdProgress");
  const cmosProgressEl = el("cmosProgress");
  const compareBody = document.querySelector("#compareTable tbody");

  // --- global state -----------------------------------------------------
  const rng = S.RNG.makeRng(0xC0FFEE);
  let uploadedImageEl = null; // raw <img>, kept so its scene can be rebuilt at any resolution
  let cellPx = 10;
  let w = 32, h = 32;
  let columnFPN = null, pixelFPN = null; // regenerated on resolution change / Reseed
  let ccdCharge = null, cmosCharge = null, ccdOverflow = null;
  let ccdReadout = null, cmosReadout = null;
  let ccdAmpFlash = 0;
  let isRunning = false;
  let rafHandle = null;
  let lastFrame = { ccdDone: false, cmosDone: false };

  // --- control reading --------------------------------------------------
  function readControls() {
    return {
      resolution: parseInt(controlsEl.resolution.value, 10),
      sceneKey: controlsEl.sceneSelect.value,
      motionEnabled: controlsEl.motionToggle.checked,
      exposureMs: parseFloat(controlsEl.exposure.value),
      intensity: parseFloat(controlsEl.intensity.value) / 100,
      temperatureC: parseFloat(controlsEl.temperature.value),
      pixelClockHz: parseFloat(controlsEl.pixelClock.value) * 1e6,
      bitDepth: parseInt(controlsEl.bitDepth.value, 10),
      globalShutter: controlsEl.globalShutter.checked,
      animSpeed: parseInt(controlsEl.animSpeed.value, 10),
    };
  }

  function buildScene(cfg) {
    switch (cfg.sceneKey) {
      case "gradient": return S.Scene.gradientScene();
      case "checkerboard": return S.Scene.checkerboardScene();
      case "radial": return S.Scene.radialScene();
      case "image":
        // Rebuilt at the *current* resolution every time — an uploaded
        // image scene baked at one grid size would misindex after the
        // user changes resolution.
        return uploadedImageEl ? S.Scene.buildImageScene(uploadedImageEl, w, h) : S.Scene.gradientScene();
      case "movingbar":
      default:
        return S.Scene.movingBarScene(cfg.motionEnabled);
    }
  }

  // --- canvas sizing ------------------------------------------------------
  function sizeCanvases() {
    cellPx = Math.max(4, Math.min(22, Math.floor(DISPLAY_BUDGET_PX / Math.max(w, h))));
    const gridW = w * cellPx, gridH = h * cellPx;
    const AMP_MARGIN = 60, STRIP_H = 24;

    sourceCanvas.width = gridW;
    sourceCanvas.height = gridH;

    ccdCanvas.width = gridW + AMP_MARGIN;
    ccdCanvas.height = gridH + STRIP_H;
    cmosCanvas.width = gridW + AMP_MARGIN;
    cmosCanvas.height = gridH + STRIP_H;
  }

  // --- capture: photon capture + charge accumulation + blooming ---------
  // This is stage 1-3a of the pipeline (everything up to, but not
  // including, readout). Rebuilds both architectures' charge grids from
  // scratch and resets the readout state machines — a fresh exposure
  // means a fresh readout, just like a real sensor.
  function doCapture() {
    const cfg = readControls();
    w = h = cfg.resolution; // square grids keep the UI + animations simple

    const resolutionChanged = !columnFPN || columnFPN.gain.length !== w || !pixelFPN || pixelFPN.gain.length !== w * h;
    if (resolutionChanged) {
      sizeCanvases();
      regenerateFPN();
    }

    const scene = buildScene(cfg);

    // CCD: the whole array is exposed and shifted out as one global
    // frame — every row samples the scene at the same instant.
    const ccdFrame = S.Capture.captureFrame(scene, {
      w, h,
      exposureMs: cfg.exposureMs,
      lightIntensity: cfg.intensity,
      temperatureC: cfg.temperatureC,
      fullWellE: FULL_WELL_E,
      rng: rng,
      rowTime: function () { return 0.5; },
    });
    ccdOverflow = ccdFrame.overflow;
    ccdCharge = S.Blooming.applyBlooming(ccdFrame.electrons, ccdFrame.overflow, w, h, FULL_WELL_E, BLOOM_PASSES);

    // CMOS: rolling shutter samples each row at a different point in the
    // frame timeline; global shutter samples every row at the same
    // instant (t=0.5), same as the CCD.
    const cmosFrame = S.Capture.captureFrame(scene, {
      w, h,
      exposureMs: cfg.exposureMs,
      lightIntensity: cfg.intensity,
      temperatureC: cfg.temperatureC,
      fullWellE: FULL_WELL_E,
      rng: rng,
      rowTime: cfg.globalShutter
        ? function () { return 0.5; }
        : function (row) { return h > 1 ? row / (h - 1) : 0; },
    });
    cmosCharge = cmosFrame.electrons; // CMOS pixels don't bloom into neighbors

    // Fresh exposure => fresh readout. Any in-progress animation is
    // discarded, same as it would be on a real sensor.
    ccdReadout = S.ReadoutCCD.makeCCDReadout(ccdCharge, w, h, columnFPN, {
      fullWellE: FULL_WELL_E, readNoiseE: READ_NOISE_CCD_E, bitDepth: cfg.bitDepth, rng: rng,
    });
    cmosReadout = S.ReadoutCMOS.makeCMOSReadout(cmosCharge, w, h, pixelFPN, {
      fullWellE: FULL_WELL_E, readNoiseE: READ_NOISE_CMOS_E, bitDepth: cfg.bitDepth, rng: rng,
    });
    lastFrame = { ccdDone: false, cmosDone: false };
    stopRun();

    drawSource(scene);
    render();
  }

  function regenerateFPN() {
    columnFPN = S.FPN.makeColumnFPN(w, rng);
    pixelFPN = S.FPN.makePixelFPN(w, h, rng);
  }

  // --- drawing ------------------------------------------------------------
  function drawSource(scene) {
    const ctx = sourceCanvas.getContext("2d");
    S.Render.drawGrid(ctx, cellPx, w, h, function (x, y) {
      return scene.sample(x, y, w, h, 0.5); // representative static snapshot
    });
  }

  function render() {
    const cfg = readControls();
    const maxDn = Math.pow(2, cfg.bitDepth) - 1;
    const ccdCtx = ccdCanvas.getContext("2d");
    const cmosCtx = cmosCanvas.getContext("2d");
    ccdCtx.clearRect(0, 0, ccdCanvas.width, ccdCanvas.height);
    cmosCtx.clearRect(0, 0, cmosCanvas.width, cmosCanvas.height);

    S.Render.drawGrid(ccdCtx, cellPx, w, h, function (x, y) {
      const idx = y * w + x;
      return ccdReadout.revealed[idx] ? ccdReadout.dn[idx] / maxDn : null;
    });
    S.Render.drawCCDOverlay(ccdCtx, cellPx, w, h, ccdReadout.currentPhase(), ccdAmpFlash);
    if (ccdAmpFlash > 0) ccdAmpFlash--;

    S.Render.drawGrid(cmosCtx, cellPx, w, h, function (x, y) {
      const idx = y * w + x;
      return cmosReadout.revealed[idx] ? cmosReadout.dn[idx] / maxDn : null;
    });
    S.Render.drawCMOSOverlay(cmosCtx, cellPx, w, h, cmosReadout.currentPhase());

    ccdProgressEl.textContent = ccdReadout.currentStep() + " / " + ccdReadout.totalSteps;
    cmosProgressEl.textContent = cmosReadout.currentStep() + " / " + cmosReadout.totalSteps;

    updateColumnStats();

    const ccdDone = ccdReadout.isDone(), cmosDone = cmosReadout.isDone();
    if (ccdDone && cmosDone && !(lastFrame.ccdDone && lastFrame.cmosDone)) {
      updateComparison();
    }
    lastFrame = { ccdDone: ccdDone, cmosDone: cmosDone };
    buttons.step.disabled = ccdDone && cmosDone;
    buttons.run.disabled = ccdDone && cmosDone;
  }

  function updateColumnStats() {
    const cfg = readControls();
    const ccdTime = S.Timing.ccdReadoutSeconds(w, h, cfg.pixelClockHz);
    const cmosTime = S.Timing.cmosReadoutSeconds(w, h, cfg.pixelClockHz);
    const blooming = S.Stats.hasBlooming(ccdOverflow);

    ccdStatsEl.innerHTML =
      statRow("Readout time", fmtTime(ccdTime)) +
      statRow("Blooming this frame", blooming ? "yes" : "no", blooming ? "warn" : "ok");

    const skew = !cfg.globalShutter && cfg.motionEnabled && cfg.sceneKey === "movingbar";
    cmosStatsEl.innerHTML =
      statRow("Readout time", fmtTime(cmosTime)) +
      statRow("Shutter mode", cfg.globalShutter ? "global" : "rolling") +
      statRow("Motion skew this frame", skew ? "yes" : "no", skew ? "warn" : "ok");
  }

  function updateComparison() {
    const cfg = readControls();
    const ccdTime = S.Timing.ccdReadoutSeconds(w, h, cfg.pixelClockHz);
    const cmosTime = S.Timing.cmosReadoutSeconds(w, h, cfg.pixelClockHz);
    const ccdPower = S.Timing.relativePower(w, h, ccdTime, "ccd", false);
    const cmosPower = S.Timing.relativePower(w, h, cmosTime, "cmos", cfg.globalShutter);
    const ccdSnr = S.Stats.snrDb(ccdReadout.dn);
    const cmosSnr = S.Stats.snrDb(cmosReadout.dn);
    const blooming = S.Stats.hasBlooming(ccdOverflow);
    const skew = !cfg.globalShutter && cfg.motionEnabled && cfg.sceneKey === "movingbar";

    const rows = [
      ["Readout time", fmtTime(ccdTime), fmtTime(cmosTime)],
      ["Speedup", "1×", (ccdTime / cmosTime).toFixed(1) + "× faster"],
      ["Relative power draw", ccdPower.toFixed(1) + " u", cmosPower.toFixed(1) + " u"],
      ["SNR", isFinite(ccdSnr) ? ccdSnr.toFixed(1) + " dB" : "—", isFinite(cmosSnr) ? cmosSnr.toFixed(1) + " dB" : "—"],
      ["Visible artifact", blooming ? "blooming" : "none", skew ? "rolling-shutter skew" : "none"],
    ];
    compareBody.innerHTML = rows.map(function (r) {
      return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
    }).join("");
  }

  function statRow(label, value, cls) {
    return "<dt>" + label + "</dt><dd" + (cls ? ' class="' + cls + '"' : "") + ">" + value + "</dd>";
  }
  function fmtTime(seconds) {
    if (seconds < 1e-3) return (seconds * 1e6).toFixed(1) + " µs";
    if (seconds < 1) return (seconds * 1e3).toFixed(2) + " ms";
    return seconds.toFixed(2) + " s";
  }

  // --- readout stepping / run loop --------------------------------------
  function advanceOnce() {
    let didAnything = false;
    if (ccdReadout && !ccdReadout.isDone()) {
      const wasHshift = ccdReadout.currentPhase().type === "hshift";
      ccdReadout.step();
      if (wasHshift) ccdAmpFlash = 4;
      didAnything = true;
    }
    if (cmosReadout && !cmosReadout.isDone()) {
      cmosReadout.step();
      didAnything = true;
    }
    return didAnything;
  }

  function stepButtonHandler() {
    stopRun();
    advanceOnce();
    render();
  }

  function runLoop() {
    if (!isRunning) return;
    const cfg = readControls();
    let any = false;
    for (let i = 0; i < cfg.animSpeed; i++) {
      if (advanceOnce()) any = true; else break;
    }
    render();
    if (!any) { stopRun(); return; }
    rafHandle = requestAnimationFrame(runLoop);
  }

  function startRun() {
    if (isRunning) return;
    isRunning = true;
    buttons.run.textContent = "Pause ❚❚";
    rafHandle = requestAnimationFrame(runLoop);
  }
  function stopRun() {
    isRunning = false;
    buttons.run.textContent = "Run ▸▸";
    if (rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  function toggleRun() {
    if (isRunning) stopRun(); else startRun();
  }

  function resetReadout() {
    stopRun();
    const cfg = readControls();
    ccdReadout = S.ReadoutCCD.makeCCDReadout(ccdCharge, w, h, columnFPN, {
      fullWellE: FULL_WELL_E, readNoiseE: READ_NOISE_CCD_E, bitDepth: cfg.bitDepth, rng: rng,
    });
    cmosReadout = S.ReadoutCMOS.makeCMOSReadout(cmosCharge, w, h, pixelFPN, {
      fullWellE: FULL_WELL_E, readNoiseE: READ_NOISE_CMOS_E, bitDepth: cfg.bitDepth, rng: rng,
    });
    lastFrame = { ccdDone: false, cmosDone: false };
    render();
  }

  // --- wiring --------------------------------------------------------------
  function bindLiveLabel(input, labelEl, fmt) {
    input.addEventListener("input", function () {
      labelEl.textContent = fmt ? fmt(input.value) : input.value;
    });
  }
  bindLiveLabel(controlsEl.exposure, readouts.exposureVal);
  bindLiveLabel(controlsEl.intensity, readouts.intensityVal);
  bindLiveLabel(controlsEl.temperature, readouts.tempVal);
  bindLiveLabel(controlsEl.pixelClock, readouts.clockVal);
  bindLiveLabel(controlsEl.animSpeed, readouts.animSpeedVal);

  // Anything that changes what gets captured triggers a fresh exposure.
  // (Bit depth also affects capture indirectly since it re-creates the
  // readout state machines, so it's included here too.)
  [
    controlsEl.resolution, controlsEl.sceneSelect, controlsEl.motionToggle,
    controlsEl.exposure, controlsEl.intensity, controlsEl.temperature,
    controlsEl.bitDepth, controlsEl.globalShutter,
  ].forEach(function (input) {
    input.addEventListener("input", doCapture);
    input.addEventListener("change", doCapture);
  });
  // Pixel clock only affects the *timing display*, not the captured
  // charge, so it just needs a re-render, not a full recapture.
  controlsEl.pixelClock.addEventListener("input", updateColumnStats);

  controlsEl.imageUpload.addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        uploadedImageEl = img;
        controlsEl.sceneSelect.value = "image";
        doCapture();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  buttons.capture.addEventListener("click", doCapture);
  buttons.reseed.addEventListener("click", function () { regenerateFPN(); doCapture(); });
  buttons.step.addEventListener("click", stepButtonHandler);
  buttons.run.addEventListener("click", toggleRun);
  buttons.resetReadout.addEventListener("click", resetReadout);

  // --- boot ------------------------------------------------------------
  sizeCanvases();
  regenerateFPN();
  doCapture();
})();
