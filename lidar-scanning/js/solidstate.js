/*
 * solidstate.js — a fixed electronically-steered emitter array: every
 * ray in one frame is cast at the SAME instant (no mirror, no sweep, so
 * no rolling-shutter-style motion smear), but only within a limited
 * forward field of view. Everything outside that cone is simply never
 * sampled — there's no "dropout" to model, it's an honest gap.
 */
(function () {
  "use strict";

  const Scene = window.Lidar.Scene;
  const SENSOR_ORIGIN = [0, 0, 0];

  /**
   * @param scene   from Scene.buildScene()
   * @param cfg     { fovH, fovV, rasterW, rasterH, refreshHz, centerAzimuth, maxRange }
   * @param simTime current scene time, seconds — every ray shares it
   */
  function simulate(scene, cfg, simTime) {
    const primitives = scene.primitivesAt(simTime); // one snapshot, whole frame
    const points = [];
    for (let j = 0; j < cfg.rasterH; j++) {
      const elevation = cfg.rasterH > 1
        ? -cfg.fovV / 2 + (j / (cfg.rasterH - 1)) * cfg.fovV
        : 0;
      for (let i = 0; i < cfg.rasterW; i++) {
        const azimuth = cfg.centerAzimuth + (cfg.rasterW > 1 ? -cfg.fovH / 2 + (i / (cfg.rasterW - 1)) * cfg.fovH : 0);
        const dir = Scene.rayDirection(azimuth, elevation);
        const hit = Scene.intersectScene(SENSOR_ORIGIN, dir, primitives, cfg.maxRange);
        if (hit) points.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], channel: j, t: simTime, range: hit.t });
      }
    }

    return {
      points,
      stats: {
        fovH: cfg.fovH, fovV: cfg.fovV,
        refreshHz: cfg.refreshHz,
        pointsPerFrame: cfg.rasterW * cfg.rasterH,
        movingParts: false,
        captureWindow: 1 / cfg.refreshHz, // still finite — a real sensor has SOME integration time
      },
    };
  }

  window.Lidar = window.Lidar || {};
  window.Lidar.SolidState = { simulate };
})();
