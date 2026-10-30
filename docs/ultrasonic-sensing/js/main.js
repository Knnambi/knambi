/*
 * main.js — wires controls to the ultrasonic module (and, for contrast,
 * the borrowed mechanical-LiDAR module) against one shared environment,
 * driven by the same "scene time" playback pattern as the lidar-scanning
 * app. State, wiring, and drawing calls only — the sensing math lives in
 * ultrasonic.js / mechanical.js / scene.js.
 */
(function () {
  "use strict";

  const U = window.Ultra;
  const SIM_TIME_WRAP = 20;
  const SEED = 0xBEEF01;

  const el = (id) => document.getElementById(id);
  const envEl = {
    objectCount: el("objectCount"), minRadius: el("minRadius"), maxRadius: el("maxRadius"),
    sensorHeight: el("sensorHeight"), surfaceMix: el("surfaceMix"),
    movingEnabled: el("movingEnabled"), movingSpeed: el("movingSpeed"),
  };
  const panelEl = { distance: el("panelDistance"), yaw: el("panelYaw"), surface: el("panelSurface") };
  const sensorEl = {
    beamAngle: el("beamAngle"), incidenceLimit: el("incidenceLimit"), minSense: el("minSense"),
    maxRange: el("maxRange"), pingRate: el("pingRate"), temp: el("temp"),
  };
  const layoutEl = { mode: el("arrayMode"), count: el("sensorCount"), crossTalk: el("crossTalk") };
  const sharedEl = { speed: el("speed"), simTime: el("simTime") };
  const buttons = { play: el("playBtn"), resetTime: el("resetTimeBtn") };

  const ultraStatsEl = el("ultraStats"), lidarStatsEl = el("lidarStats");
  const readoutRow = el("readoutRow");

  const ultraViewport = U.View3D.createViewport(el("ultraCanvas"));
  const lidarViewport = U.PointView.createViewport(el("lidarCanvas"));

  let sceneObj = null;
  let simTime = 0, playing = false, lastWallMs = null;

  // ---------- reading controls ----------
  function readSceneCfg() {
    const minR = parseFloat(envEl.minRadius.value);
    return {
      objectCount: parseInt(envEl.objectCount.value, 10),
      minRadius: minR,
      maxRadius: Math.max(minR + 1, parseFloat(envEl.maxRadius.value)),
      sensorHeight: parseFloat(envEl.sensorHeight.value),
      surfaceMix: envEl.surfaceMix.value,
      movingEnabled: envEl.movingEnabled.checked,
      movingSpeed: parseFloat(envEl.movingSpeed.value),
      panelDistance: parseFloat(panelEl.distance.value),
      panelYaw: parseFloat(panelEl.yaw.value),
      panelSurface: panelEl.surface.value,
      seed: SEED,
    };
  }

  function readSensorCfg() {
    const tempC = parseFloat(sensorEl.temp.value);
    const speedOfSound = 331.3 + 0.606 * tempC; // standard linear approximation
    return {
      beamAngleDeg: parseFloat(sensorEl.beamAngle.value),
      incidenceLimitDeg: parseFloat(sensorEl.incidenceLimit.value),
      minSenseDistance: parseFloat(sensorEl.minSense.value),
      maxRange: parseFloat(sensorEl.maxRange.value),
      pingRateHz: parseFloat(sensorEl.pingRate.value),
      absorptionRangeFactor: 0.4,
      speedOfSound,
      samplesAz: 9, samplesEl: 5,
    };
  }

  function buildSensors(sCfg) {
    if (layoutEl.mode.value === "single") {
      return [{ position: [0, 0, 0], azimuth: 0, elevation: 0, beamAngleDeg: sCfg.beamAngleDeg }];
    }
    const n = parseInt(layoutEl.count.value, 10);
    const bumperWidth = 1.8, fanSpreadDeg = 40;
    const sensors = [];
    for (let i = 0; i < n; i++) {
      const frac = n > 1 ? i / (n - 1) : 0.5;
      sensors.push({
        position: [-bumperWidth / 2 + frac * bumperWidth, 0, 0],
        azimuth: -fanSpreadDeg / 2 + frac * fanSpreadDeg,
        elevation: 0, beamAngleDeg: sCfg.beamAngleDeg,
      });
    }
    return sensors;
  }

  // ---------- scene + compute ----------
  function rebuildScene() {
    sceneObj = U.Scene.buildScene(readSceneCfg());
    ultraViewport.setEnvironment(sceneObj);
  }

  function statRow(label, value, cls) {
    return "<dt>" + label + "</dt><dd" + (cls ? ' class="' + cls + '"' : "") + ">" + value + "</dd>";
  }

  function renderReadouts(sensors, results) {
    readoutRow.innerHTML = results.map((r, i) => {
      const label = sensors.length > 1 ? "Sensor " + (i + 1) : "Sensor";
      let valueText, cls;
      if (r.status === "OK") { valueText = r.reportedRange.toFixed(2) + " m"; cls = "ok"; }
      else if (r.status === "TOO_CLOSE") { valueText = "TOO CLOSE"; cls = "blind"; }
      else { valueText = "NO ECHO"; cls = "warn"; }
      const crossTalkNote = r.crossTalkFrom !== undefined
        ? '<div class="crosstalk">picked up sensor ' + (r.crossTalkFrom + 1) + "'s pulse</div>" : "";
      return '<div class="readout-card"><div class="label">' + label + '</div><div class="value ' + cls + '">' + valueText + "</div>" + crossTalkNote + "</div>";
    }).join("");
  }

  function updateUltraStats(results, sCfg) {
    const avgFail = results.reduce((s, r) => s + r.stats.incidenceFailureRate, 0) / results.length;
    const okCount = results.filter((r) => r.status === "OK").length;
    ultraStatsEl.innerHTML =
      statRow("Detection range", sCfg.minSenseDistance.toFixed(2) + "–" + sCfg.maxRange.toFixed(1) + " m") +
      statRow("Beam angle", sCfg.beamAngleDeg.toFixed(0) + "° (no spatial resolution within cone)") +
      statRow("Refresh rate", sCfg.pingRateHz.toFixed(0) + " Hz") +
      statRow("Angle-of-incidence failure rate", (avgFail * 100).toFixed(0) + "%", avgFail > 0.3 ? "warn" : "ok") +
      statRow("Sensors reporting OK", okCount + " / " + results.length, okCount < results.length ? "warn" : "ok") +
      statRow("Relative cost / power / size", "Lowest of all sensors simulated");
  }

  function updateLidarStats(lidarResult, lidarCfg) {
    const s = lidarResult.stats;
    lidarStatsEl.innerHTML =
      statRow("FOV (H × V)", s.fovH.toFixed(0) + "° × " + s.fovV.toFixed(0) + "°") +
      statRow("Refresh rate", s.refreshHz.toFixed(1) + " Hz") +
      statRow("Points now / scan", lidarResult.points.length + " / " + s.pointsPerFrame) +
      statRow("Spatial resolution", "Per-point 3D position");
  }

  function recomputeAndDraw() {
    if (!sceneObj) return;
    const sCfg = readSensorCfg();
    const sensors = buildSensors(sCfg);
    let results = sensors.map((s) => U.Ultrasonic.simulate(s, sCfg, sceneObj, simTime));
    results = U.Ultrasonic.crossTalkApply(sensors, results, {
      crossTalkEnabled: layoutEl.crossTalk.checked, beamAngleDeg: sCfg.beamAngleDeg, pingRateHz: sCfg.pingRateHz,
    }, simTime);
    const visualStates = results.map((r) => U.Ultrasonic.computeVisualState(r, simTime));

    ultraViewport.setSensorMarkers(sensors);
    ultraViewport.setMovingObject(sceneObj.movingObjectAt(simTime));
    ultraViewport.setCones(sensors, visualStates);
    const hitPoints = results
      .map((r, i) => (visualStates[i].showHitMarker && r.hitPoint ? r.hitPoint : null))
      .filter(Boolean);
    ultraViewport.setHitMarkers(hitPoints);

    renderReadouts(sensors, results);
    updateUltraStats(results, sCfg);

    // LiDAR comparison — fixed, modest settings; the point is the
    // contrast in output shape, not tuning this secondary viewport.
    const lidarCfg = { numChannels: 16, elevMin: -15, elevMax: 15, rpm: 600, pointsPerRev: 360, maxRange: sCfg.maxRange * 2.5 };
    const lidarResult = U.Mechanical.simulate(sceneObj, lidarCfg, simTime);
    lidarViewport.setPoints(lidarResult.points, { colorMode: "distance", totalChannels: lidarCfg.numChannels, size: 0.05 });
    updateLidarStats(lidarResult, lidarCfg);
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
    ultraViewport.render();
    lidarViewport.render();
    requestAnimationFrame(loop);
  })();

  // ---------- wiring ----------
  function bindLiveLabel(input, labelEl, fmt) {
    input.addEventListener("input", () => { labelEl.textContent = fmt ? fmt(input.value) : input.value; });
  }
  bindLiveLabel(envEl.objectCount, el("objectCountVal"));
  bindLiveLabel(envEl.sensorHeight, el("sensorHeightVal"), (v) => parseFloat(v).toFixed(2));
  bindLiveLabel(envEl.movingSpeed, el("movingSpeedVal"), (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(panelEl.distance, el("panelDistanceVal"), (v) => parseFloat(v).toFixed(2));
  bindLiveLabel(panelEl.yaw, el("panelYawVal"));
  bindLiveLabel(sensorEl.beamAngle, el("beamAngleVal"));
  bindLiveLabel(sensorEl.incidenceLimit, el("incidenceLimitVal"));
  bindLiveLabel(sensorEl.minSense, el("minSenseVal"), (v) => parseFloat(v).toFixed(2));
  bindLiveLabel(sensorEl.maxRange, el("maxRangeVal"), (v) => parseFloat(v).toFixed(1));
  bindLiveLabel(sensorEl.pingRate, el("pingRateVal"));
  bindLiveLabel(layoutEl.count, el("sensorCountVal"));
  bindLiveLabel(sharedEl.speed, el("speedVal"), (v) => parseFloat(v).toFixed(2));
  function updateRadiusLabel() { el("radiusVal").textContent = envEl.minRadius.value + "–" + envEl.maxRadius.value; }
  envEl.minRadius.addEventListener("input", updateRadiusLabel);
  envEl.maxRadius.addEventListener("input", updateRadiusLabel);
  sensorEl.temp.addEventListener("input", () => {
    const tempC = parseFloat(sensorEl.temp.value);
    el("tempVal").textContent = tempC.toFixed(0);
    el("speedOfSoundVal").textContent = (331.3 + 0.606 * tempC).toFixed(0);
  });

  // Environment + panel controls need a full scene rebuild (geometry
  // and the moving object's motion function). Sensor/layout controls
  // only change how the sensors read that same scene.
  [...Object.values(envEl), ...Object.values(panelEl)].forEach((input) => {
    input.addEventListener("input", () => { rebuildScene(); recomputeAndDraw(); });
    input.addEventListener("change", () => { rebuildScene(); recomputeAndDraw(); });
  });
  [...Object.values(sensorEl), ...Object.values(layoutEl)].forEach((input) => {
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
