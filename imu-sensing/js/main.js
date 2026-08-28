/*
 * main.js — wires controls to motion.js/imu.js/fusion.js/position.js and
 * drives the live charts + 3D viewports. State, wiring, and drawing
 * calls only; the physics lives in the modules it calls.
 */
(function () {
  "use strict";

  const V = window.Vec3, Q = window.Quat;
  const GRAVITY = 9.81;
  const MAG_FIELD_WORLD = [0, -20, 45]; // arbitrary but fixed mid-latitude-ish field, uT

  const el = (id) => document.getElementById(id);
  const profileEl = el("profile"), manualHint = el("manualHint"), resetBtn = el("resetBtn");
  const accelEl = { white: el("accelWhite"), bias: el("accelBias"), drift: el("accelDrift") };
  const gyroEl = { white: el("gyroWhite"), bias: el("gyroBias"), drift: el("gyroDrift") };
  const magEnabledEl = el("magEnabled"), magInterferenceEl = el("magInterference");
  const fusionModeEl = el("fusionMode"), accelGainEl = el("accelGain"), magGainEl = el("magGain");
  const positionStatsEl = el("positionStats");

  // Each profile loops its KINEMATIC sample over a bounded period so the
  // fixed-camera ground-truth viewport doesn't need the body to fly off
  // to infinity — but the noise/drift/charts still use the real,
  // ever-increasing elapsed time, so drift keeps accumulating across
  // loops exactly as it should.
  const PROFILE_CFG = {
    straightLine: { cfg: { accel: 1.2 }, loopPeriod: 3.0 },
    constantTurn: { cfg: { speed: 2.5, radius: 3 }, loopPeriod: 2 * Math.PI * 3 / 2.5 },
    figureEight: { cfg: { amplitude: 3, omega: 0.8 }, loopPeriod: 2 * Math.PI / 0.8 },
    freeFall: { cfg: { g: GRAVITY }, loopPeriod: 2.2 },
    shake: { cfg: { amplitude: 0.15, frequency: 6 }, loopPeriod: 1 / 6 },
  };

  const rng = window.RNG.makeRng(0xABCDEF);
  let imu = window.IMU.createIMU({
    gravity: GRAVITY,
    accel: { bias: 0.05, driftRate: 0.005, whiteNoiseStd: 0.05 },
    gyro: { bias: 0.02, driftRate: 0.002, whiteNoiseStd: 0.01 },
    mag: { bias: 0.5, driftRate: 0.05, whiteNoiseStd: 0.4 },
  }, rng);
  const interference = { enabled: false, offset: [0, 0, 0], strength: 6, rng };

  let t = 0, lastWallMs = null;
  let manualState = window.Motion.createManualState();
  const heldKeys = new Set();
  let gyroOnlyQ = Q.identity(), complementaryQ = Q.identity();
  let kalmanQ = Q.identity(), kalmanState = window.Fusion.createKalmanState();
  let posState = window.PositionEstimate.createState();
  let truthTrail = [];

  const truthView = window.BodyView.createViewport(el("truthCanvas"), { cameraDistance: 6, gridSize: 20 });
  truthView.setFollowTarget("truth");
  const compareView = window.BodyView.createViewport(el("compareCanvas"), { cameraDistance: 2.4, gridSize: 4 });

  const accelChart = window.Chart.createChart(el("accelChart"), [
    { label: "x", color: "#e2685a" }, { label: "y", color: "#55c17b" }, { label: "z", color: "#6fa3ec" },
  ], { windowSeconds: 6 });
  const gyroChart = window.Chart.createChart(el("gyroChart"), [
    { label: "x", color: "#e2685a" }, { label: "y", color: "#55c17b" }, { label: "z", color: "#6fa3ec" },
  ], { windowSeconds: 6 });
  const orientErrChart = window.Chart.createChart(el("orientErrChart"), [
    { label: "gyro-only", color: "#e2685a" }, { label: "fused", color: "#55c17b" },
  ], { windowSeconds: 20 });
  const headingChart = window.Chart.createChart(el("headingChart"), [
    { label: "true", color: "#8b97a7" }, { label: "raw sensed", color: "#e0a23e" },
  ], { windowSeconds: 10, yRange: [-190, 190] });
  const positionChart = window.Chart.createChart(el("positionChart"), [
    { label: "position error (m)", color: "#e2685a" },
  ], { windowSeconds: 20 });

  function angleBetweenQuats(qa, qb) {
    const rel = Q.multiply(Q.conjugate(qa), qb);
    const w = Math.max(-1, Math.min(1, rel[3]));
    return 2 * Math.acos(Math.abs(w)) * 180 / Math.PI;
  }

  function applyNoiseConfig() {
    const setAxes = (channels, white, bias, drift) => {
      for (const ch of channels) { ch.whiteNoiseStd = white; ch.bias = bias; ch.driftRate = drift; }
    };
    setAxes(imu.accelChannels, parseFloat(accelEl.white.value), parseFloat(accelEl.bias.value), parseFloat(accelEl.drift.value));
    setAxes(imu.gyroChannels, parseFloat(gyroEl.white.value), parseFloat(gyroEl.bias.value), parseFloat(gyroEl.drift.value));
  }

  function reset() {
    t = 0; lastWallMs = null;
    manualState = window.Motion.createManualState();
    gyroOnlyQ = Q.identity(); complementaryQ = Q.identity();
    kalmanQ = Q.identity(); kalmanState = window.Fusion.createKalmanState();
    posState = window.PositionEstimate.createState();
    truthTrail = [];
    interference.offset = [0, 0, 0];
    window.IMU.resetDrift(imu);
    for (const c of [accelChart, gyroChart, orientErrChart, headingChart, positionChart]) c.clear();
  }

  function groundTruthAt(profileName, tGlobal, dt) {
    if (profileName === "manual") {
      const accelBody = [
        (heldKeys.has("KeyD") ? 1 : 0) - (heldKeys.has("KeyA") ? 1 : 0),
        (heldKeys.has("KeyR") ? 1 : 0) - (heldKeys.has("KeyF") ? 1 : 0),
        (heldKeys.has("KeyW") ? 1 : 0) - (heldKeys.has("KeyS") ? 1 : 0),
      ].map((v) => v * 3);
      const angularVelocityBody = [
        (heldKeys.has("ArrowUp") ? 1 : 0) - (heldKeys.has("ArrowDown") ? 1 : 0),
        (heldKeys.has("ArrowLeft") ? 1 : 0) - (heldKeys.has("ArrowRight") ? 1 : 0),
        (heldKeys.has("KeyQ") ? 1 : 0) - (heldKeys.has("KeyE") ? 1 : 0),
      ].map((v) => v * 1.2);
      manualState = window.Motion.stepManual(manualState, { accelBody, angularVelocityBody }, dt);
      return manualState;
    }
    const p = PROFILE_CFG[profileName];
    const tMotion = tGlobal % p.loopPeriod;
    return window.Motion.sampleProfile(profileName, p.cfg, tMotion);
  }

  function step(dt) {
    t += dt;
    const profileName = profileEl.value;
    const groundTruth = groundTruthAt(profileName, t, dt);

    const accelMeasured = window.IMU.sampleAccelerometer(imu, groundTruth, dt);
    const gyroMeasured = window.IMU.sampleGyroscope(imu, groundTruth, dt);
    const magOn = magEnabledEl.checked;
    interference.enabled = magInterferenceEl.checked;
    const magMeasured = magOn ? window.IMU.sampleMagnetometer(imu, groundTruth, dt, MAG_FIELD_WORLD, interference) : null;

    const fusionCfg = { accelGain: parseFloat(accelGainEl.value), magGain: parseFloat(magGainEl.value) };
    gyroOnlyQ = window.Fusion.gyroOnlyStep(gyroOnlyQ, gyroMeasured, dt);
    complementaryQ = window.Fusion.complementaryStep(complementaryQ, gyroMeasured, accelMeasured, magMeasured, MAG_FIELD_WORLD, dt, fusionCfg);
    kalmanQ = window.Fusion.kalmanStep(kalmanQ, kalmanState, gyroMeasured, accelMeasured, magMeasured, MAG_FIELD_WORLD, dt, {
      processNoise: { angle: 0.002, bias: 0.00002 }, measurementNoise: 0.03,
    });

    const fusedMap = { gyroOnly: gyroOnlyQ, complementary: complementaryQ, kalman: kalmanQ };
    const fusedQ = fusedMap[fusionModeEl.value];

    posState = window.PositionEstimate.step(posState, accelMeasured, fusedQ, GRAVITY, dt);

    truthTrail.push(groundTruth.position.slice());
    if (truthTrail.length > 400) truthTrail.shift();

    // ---------- charts ----------
    accelChart.addSample(t, accelMeasured);
    gyroChart.addSample(t, gyroMeasured);
    orientErrChart.addSample(t, [angleBetweenQuats(gyroOnlyQ, groundTruth.orientation), angleBetweenQuats(fusedQ, groundTruth.orientation)]);
    if (magOn) {
      const trueYawDeg = Q.toEulerZYX(groundTruth.orientation).yaw * 180 / Math.PI;
      const rawHeadingDeg = Math.atan2(magMeasured[0], magMeasured[2]) * 180 / Math.PI;
      headingChart.addSample(t, [trueYawDeg, rawHeadingDeg]);
    }
    const positionError = V.length(V.sub(posState.position, groundTruth.position));
    positionChart.addSample(t, [positionError]);
    positionStatsEl.innerHTML =
      "<dt>Estimated position</dt><dd>[" + posState.position.map((v) => v.toFixed(2)).join(", ") + "] m</dd>" +
      "<dt>True position</dt><dd>[" + groundTruth.position.map((v) => v.toFixed(2)).join(", ") + "] m</dd>" +
      '<dt>Position error</dt><dd class="' + (positionError > 1 ? "warn" : "ok") + '">' + positionError.toFixed(3) + " m</dd>";

    // ---------- 3D viewports ----------
    truthView.setBodies({ truth: { position: groundTruth.position, quat: groundTruth.orientation, color: 0xe0a23e } });
    truthView.setTrail(truthTrail);
    compareView.setBodies({
      truth: { position: [0, 0, -0.7], quat: groundTruth.orientation, color: 0x8b97a7 },
      gyroOnly: { position: [0, 0, 0], quat: gyroOnlyQ, color: 0xe2685a },
      fused: { position: [0, 0, 0.7], quat: fusedQ, color: 0x55c17b },
    });
  }

  (function loop(nowMs) {
    if (lastWallMs != null) {
      const dt = Math.min(0.05, Math.max(0, (nowMs - lastWallMs) / 1000));
      if (dt > 0) step(dt);
    }
    lastWallMs = nowMs;
    truthView.render();
    compareView.render();
    accelChart.render(); gyroChart.render(); orientErrChart.render(); headingChart.render(); positionChart.render();
    requestAnimationFrame(loop);
  })();

  // ---------- wiring ----------
  function bindLiveLabel(input, labelEl) {
    input.addEventListener("input", () => { labelEl.textContent = input.value; });
  }
  bindLiveLabel(accelEl.white, el("accelWhiteVal"));
  bindLiveLabel(accelEl.bias, el("accelBiasVal"));
  bindLiveLabel(accelEl.drift, el("accelDriftVal"));
  bindLiveLabel(gyroEl.white, el("gyroWhiteVal"));
  bindLiveLabel(gyroEl.bias, el("gyroBiasVal"));
  bindLiveLabel(gyroEl.drift, el("gyroDriftVal"));
  bindLiveLabel(accelGainEl, el("accelGainVal"));
  bindLiveLabel(magGainEl, el("magGainVal"));

  [accelEl.white, accelEl.bias, accelEl.drift, gyroEl.white, gyroEl.bias, gyroEl.drift].forEach((input) => {
    input.addEventListener("input", applyNoiseConfig);
  });

  profileEl.addEventListener("change", () => {
    manualHint.style.display = profileEl.value === "manual" ? "" : "none";
    reset();
  });
  manualHint.style.display = profileEl.value === "manual" ? "" : "none";

  resetBtn.addEventListener("click", reset);

  // Keydown is bound on window, so without this check, using arrow
  // keys/Enter to operate the profile <select> (or any other control)
  // gets captured as movement input too — and since manual control has
  // no input beyond direct key state, a single stray keystroke while
  // picking "Manual control" from the dropdown was enough to push a
  // permanent velocity into the body, which then drifted off with
  // nothing to stop it. Caught by simulating real keyboard-driven
  // dropdown selection (arrow keys, not a scripted value set) and
  // checking position moved with no movement key ever deliberately held.
  function isFormControlFocused() {
    const t = document.activeElement;
    return !!t && (t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  }
  window.addEventListener("keydown", (e) => { if (profileEl.value === "manual" && !isFormControlFocused()) heldKeys.add(e.code); });
  window.addEventListener("keyup", (e) => heldKeys.delete(e.code));
  window.addEventListener("blur", () => heldKeys.clear());

  // boot
  applyNoiseConfig();
})();
