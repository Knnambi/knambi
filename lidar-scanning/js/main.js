/*
 * main.js — wires controls to the four scanning modules, runs them
 * against one shared 360-degree environment, and drives a single
 * "scene time" shared by all four so their build-up patterns stay
 * directly comparable. All the actual scan-pattern math lives in
 * mechanical.js / solidstate.js / hybrid.js / planar2d.js; this file is
 * state, wiring, and drawing calls only.
 */
(function () {
  "use strict";

  const L = window.Lidar;
  const SIM_TIME_WRAP = 20; // seconds — the scrubber's range; autoplay loops within it

  const el = (id) => document.getElementById(id);
  const envEl = {
    objectCount: el("objectCount"), minRadius: el("minRadius"), maxRadius: el("maxRadius"),
    sensorHeight: el("sensorHeight"), movingEnabled: el("movingEnabled"), movingSpeed: el("movingSpeed"),
  };
  const mechEl = { channels: el("mechChannels"), fov: el("mechFov"), rpm: el("mechRpm"), res: el("mechRes") };
  const ssEl = { fovH: el("ssFovH"), azimuth: el("ssAzimuth"), res: el("ssRes") };
  const hybEl = { arc: el("hybArc"), osc: el("hybOsc"), res: el("hybRes") };
  const p2dEl = { rpm: el("p2dRpm"), res: el("p2dRes") };
  const sharedEl = { maxRange: el("maxRange"), colorMode: el("colorMode"), speed: el("speed"), simTime: el("simTime") };
  const buttons = { play: el("playBtn"), resetTime: el("resetTimeBtn") };

  const statsEl = { mech: el("mechStats"), ss: el("ssStats"), hyb: el("hybStats"), p2d: el("p2dStats") };
  const compareBody = document.querySelector("#compareTable tbody");

  const viewports = {
    mech: L.View.createViewport(el("mechCanvas")),
    ss: L.View.createViewport(el("ssCanvas")),
    hyb: L.View.createViewport(el("hybCanvas")),
    p2d: L.View.createViewport(el("p2dCanvas")),
  };

  const SEED = 0xC0FFEE;
  let sceneObj = null;
  let simTime = 0;
  let playing = false;
  let lastWallMs = null;

  // ---------- reading controls ----------
  function readEnv() {
    return {
      objectCount: parseInt(envEl.objectCount.value, 10),
      minRadius: parseFloat(envEl.minRadius.value),
      maxRadius: Math.max(parseFloat(envEl.minRadius.value) + 1, parseFloat(envEl.maxRadius.value)),
      sensorHeight: parseFloat(envEl.sensorHeight.value),
      movingEnabled: envEl.movingEnabled.checked,
      movingSpeed: parseFloat(envEl.movingSpeed.value),
      seed: SEED,
    };
  }
  function readMech(maxRange) {
    const fov = parseFloat(mechEl.fov.value);
    return {
      numChannels: parseInt(mechEl.channels.value, 10),
      elevMin: -fov / 2, elevMax: fov / 2,
      rpm: parseFloat(mechEl.rpm.value),
      pointsPerRev: parseInt(mechEl.res.value, 10),
      maxRange,
    };
  }
  function readSS(maxRange) {
    const [w, h] = ssEl.res.value.split(",").map(Number);
    return {
      fovH: parseFloat(ssEl.fovH.value), fovV: 25,
      rasterW: w, rasterH: h,
      refreshHz: 20, centerAzimuth: parseFloat(ssEl.azimuth.value),
      maxRange,
    };
  }
  function readHyb(maxRange) {
    const [steps, cw, ch] = hybEl.res.value.split(",").map(Number);
    return {
      arcDeg: parseFloat(hybEl.arc.value),
      elevMin: -10, elevMax: 10,
      oscHz: parseFloat(hybEl.osc.value),
      stepsPerArc: steps, clusterW: cw, clusterH: ch,
      maxRange,
    };
  }
  function readP2D(maxRange) {
    return { rpm: parseFloat(p2dEl.rpm.value), pointsPerRev: parseInt(p2dEl.res.value, 10), maxRange };
  }

  // ---------- scene + compute ----------
  function rebuildScene() {
    sceneObj = L.Scene.buildScene(readEnv());
  }

  function motionDistortionLabel(stats, envCfg) {
    if (!envCfg.movingEnabled) return "N/A (motion off)";
    if (!stats.movingParts) return "None (simultaneous)";
    const smear = envCfg.movingSpeed * stats.captureWindow;
    const m = smear.toFixed(2) + " m";
    if (smear < 0.03) return "None (" + m + ")";
    if (smear < 0.15) return "Slight (" + m + ")";
    if (smear < 0.5) return "Moderate (" + m + ")";
    return "Severe (" + m + ")";
  }

  function statRow(label, value, cls) {
    return "<dt>" + label + "</dt><dd" + (cls ? ' class="' + cls + '"' : "") + ">" + value + "</dd>";
  }
  function fmtFov(stats) { return stats.fovH.toFixed(0) + "° × " + stats.fovV.toFixed(0) + "°"; }

  function recomputeAndDraw() {
    if (!sceneObj) return;
    const envCfg = readEnv();
    const maxRange = parseFloat(sharedEl.maxRange.value);
    const colorMode = sharedEl.colorMode.value;

    const mechCfg = readMech(maxRange), ssCfg = readSS(maxRange), hybCfg = readHyb(maxRange), p2dCfg = readP2D(maxRange);
    const mech = L.Mechanical.simulate(sceneObj, mechCfg, simTime);
    const ss = L.SolidState.simulate(sceneObj, ssCfg, simTime);
    const hyb = L.Hybrid.simulate(sceneObj, hybCfg, simTime);
    const p2d = L.Planar2D.simulate(sceneObj, p2dCfg, simTime);

    viewports.mech.setPoints(mech.points, { colorMode, totalChannels: mechCfg.numChannels, size: 0.05 });
    viewports.ss.setPoints(ss.points, { colorMode, totalChannels: ssCfg.rasterH, size: 0.06 });
    viewports.hyb.setPoints(hyb.points, { colorMode, totalChannels: hybCfg.clusterH, size: 0.055 });
    viewports.p2d.setPoints(p2d.points, { colorMode, totalChannels: 1, size: 0.06 });

    const rows = [
      { key: "mech", label: "Mechanical", res: mech, cfg: mechCfg, el: statsEl.mech },
      { key: "ss", label: "Solid-State", res: ss, cfg: ssCfg, el: statsEl.ss },
      { key: "hyb", label: "Hybrid", res: hyb, cfg: hybCfg, el: statsEl.hyb },
      { key: "p2d", label: "2D", res: p2d, cfg: p2dCfg, el: statsEl.p2d },
    ];
    for (const r of rows) {
      const s = r.res.stats;
      r.el.innerHTML =
        statRow("FOV (H × V)", fmtFov(s)) +
        statRow("Refresh rate", s.refreshHz.toFixed(1) + " Hz") +
        statRow("Points now / scan", r.res.points.length + " / " + s.pointsPerFrame) +
        statRow("Moving parts", s.movingParts ? "Yes" : "No") +
        statRow("Motion distortion", motionDistortionLabel(s, envCfg));
    }

    compareBody.innerHTML = [
      ["FOV (H × V)", ...rows.map((r) => fmtFov(r.res.stats))],
      ["Refresh rate", ...rows.map((r) => r.res.stats.refreshHz.toFixed(1) + " Hz")],
      ["Points / scan", ...rows.map((r) => String(r.res.stats.pointsPerFrame))],
      ["Moving parts", ...rows.map((r) => (r.res.stats.movingParts ? "Yes" : "No"))],
      ["Motion distortion", ...rows.map((r) => motionDistortionLabel(r.res.stats, envCfg))],
    ].map((row) => "<tr><td>" + row.join("</td><td>") + "</td></tr>").join("");
  }

  // ---------- playback ----------
  function setSimTime(t) {
    simTime = ((t % SIM_TIME_WRAP) + SIM_TIME_WRAP) % SIM_TIME_WRAP;
    sharedEl.simTime.value = simTime;
    el("simTimeVal").textContent = simTime.toFixed(2);
  }

  (function loop(nowMs) {
    if (playing) {
      if (lastWallMs != null) {
        const dtWall = (nowMs - lastWallMs) / 1000;
        setSimTime(simTime + dtWall * parseFloat(sharedEl.speed.value));
        recomputeAndDraw();
      }
      lastWallMs = nowMs;
    } else {
      lastWallMs = null;
    }
    viewports.mech.render(); viewports.ss.render(); viewports.hyb.render(); viewports.p2d.render();
    requestAnimationFrame(loop);
  })();

  // ---------- wiring ----------
  function bindLiveLabel(input, labelEl, fmt) {
    input.addEventListener("input", () => { labelEl.textContent = fmt ? fmt(input.value) : input.value; });
  }
  bindLiveLabel(envEl.objectCount, el("objectCountVal"));
  bindLiveLabel(envEl.sensorHeight, el("sensorHeightVal"), (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(envEl.movingSpeed, el("movingSpeedVal"), (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(mechEl.fov, el("mechFovVal"));
  bindLiveLabel(mechEl.rpm, el("mechRpmVal"));
  bindLiveLabel(ssEl.fovH, el("ssFovHVal"));
  bindLiveLabel(ssEl.azimuth, el("ssAzimuthVal"));
  bindLiveLabel(hybEl.arc, el("hybArcVal"));
  bindLiveLabel(hybEl.osc, el("hybOscVal"), (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(p2dEl.rpm, el("p2dRpmVal"));
  bindLiveLabel(sharedEl.maxRange, el("maxRangeVal"));
  bindLiveLabel(sharedEl.speed, el("speedVal"), (v) => parseFloat(v).toFixed(2));
  function updateRadiusLabel() { el("radiusVal").textContent = envEl.minRadius.value + "–" + envEl.maxRadius.value; }
  envEl.minRadius.addEventListener("input", updateRadiusLabel);
  envEl.maxRadius.addEventListener("input", updateRadiusLabel);

  // Environment controls require a full scene rebuild (object placement,
  // the moving object's motion function). Everything else only changes
  // how the four sensors READ that same scene.
  Object.values(envEl).forEach((input) => {
    input.addEventListener("input", () => { rebuildScene(); recomputeAndDraw(); });
    input.addEventListener("change", () => { rebuildScene(); recomputeAndDraw(); });
  });
  [...Object.values(mechEl), ...Object.values(ssEl), ...Object.values(hybEl), ...Object.values(p2dEl),
    sharedEl.maxRange, sharedEl.colorMode].forEach((input) => {
    input.addEventListener("input", recomputeAndDraw);
    input.addEventListener("change", recomputeAndDraw);
  });

  sharedEl.simTime.addEventListener("input", () => {
    setSimTime(parseFloat(sharedEl.simTime.value));
    recomputeAndDraw();
  });

  buttons.play.addEventListener("click", () => {
    playing = !playing;
    buttons.play.textContent = playing ? "Pause ❚❚" : "Play ▸";
    buttons.play.classList.toggle("primary", !playing);
  });
  buttons.resetTime.addEventListener("click", () => { setSimTime(0); recomputeAndDraw(); });

  // boot
  rebuildScene();
  recomputeAndDraw();
})();
