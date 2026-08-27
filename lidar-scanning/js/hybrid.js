/*
 * hybrid.js — a mirror that oscillates back and forth across a wide (but
 * not full 360) arc, like mechanical scanning, but at each stopping
 * point it fires a small electronically-steered raster "cluster"
 * instead of one ray per channel — the solid-state half of "hybrid
 * solid-state." That gives denser, more structured clusters per sweep
 * position than pure mechanical, across a wider FOV than pure
 * solid-state, while still keeping a moving mirror (and therefore still
 * showing motion smear, just bounded to one sweep's capture window
 * instead of a full 360-degree revolution).
 */
(function () {
  "use strict";

  const Scene = window.Lidar.Scene;
  const SENSOR_ORIGIN = [0, 0, 0];

  /**
   * @param scene  from Scene.buildScene()
   * @param cfg    { arcDeg, elevMin, elevMax, oscHz, stepsPerArc,
   *                 clusterW, clusterH, maxRange }
   * @param simTime current scene time, seconds
   */
  function simulate(scene, cfg, simTime) {
    const halfPeriod = 1 / (2 * cfg.oscHz); // time for one one-way sweep
    const sweepIndex = Math.floor(simTime / halfPeriod);
    const forward = sweepIndex % 2 === 0;
    const sweepStart = sweepIndex * halfPeriod;
    const stepAngle = cfg.arcDeg / cfg.stepsPerArc;

    const points = [];
    for (let k = 0; k < cfg.stepsPerArc; k++) {
      const frac = k / cfg.stepsPerArc;
      const captureTime = sweepStart + frac * halfPeriod;
      if (captureTime > simTime) break;
      const centerAz = forward ? (-cfg.arcDeg / 2 + frac * cfg.arcDeg) : (cfg.arcDeg / 2 - frac * cfg.arcDeg);

      const primitives = scene.primitivesAt(captureTime); // once per mirror step
      for (let jy = 0; jy < cfg.clusterH; jy++) {
        const elevation = cfg.clusterH > 1
          ? cfg.elevMin + (jy / (cfg.clusterH - 1)) * (cfg.elevMax - cfg.elevMin)
          : (cfg.elevMin + cfg.elevMax) / 2;
        for (let jx = 0; jx < cfg.clusterW; jx++) {
          // Spread the cluster across this step's angular slot so
          // consecutive steps tile into a continuous dense band, rather
          // than clumping every point at the exact same azimuth.
          const azOffset = cfg.clusterW > 1 ? (jx / (cfg.clusterW - 1) - 0.5) * stepAngle : 0;
          const dir = Scene.rayDirection(centerAz + azOffset, elevation);
          const hit = Scene.intersectScene(SENSOR_ORIGIN, dir, primitives, cfg.maxRange);
          if (hit) points.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], channel: jy, t: captureTime, range: hit.t });
        }
      }
    }

    return {
      points,
      stats: {
        fovH: cfg.arcDeg, fovV: cfg.elevMax - cfg.elevMin,
        refreshHz: 1 / halfPeriod,
        pointsPerFrame: cfg.stepsPerArc * cfg.clusterW * cfg.clusterH,
        movingParts: true,
        captureWindow: halfPeriod,
      },
    };
  }

  window.Lidar = window.Lidar || {};
  window.Lidar.Hybrid = { simulate };
})();
