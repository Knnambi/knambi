/*
 * planar2d.js — a Roomba/Hokuyo-style 2D scanning LiDAR: a single fixed
 * horizontal beam, spun a full 360 degrees. Same revolution-and-reveal
 * timing as mechanical.js, but with exactly one elevation (0 degrees) —
 * the point is showing what's LOST, not what's gained, so it deliberately
 * shares the sweep model rather than a hand-tuned "flatter" one.
 */
(function () {
  "use strict";

  const Scene = window.Lidar.Scene;
  const SENSOR_ORIGIN = [0, 0, 0];

  /**
   * @param scene  from Scene.buildScene()
   * @param cfg    { rpm, pointsPerRev, maxRange }
   * @param simTime current scene time, seconds
   */
  function simulate(scene, cfg, simTime) {
    const period = 60 / cfg.rpm;
    const revIndex = Math.floor(simTime / period);
    const revStart = revIndex * period;

    const points = [];
    for (let k = 0; k < cfg.pointsPerRev; k++) {
      const captureTime = revStart + (k / cfg.pointsPerRev) * period;
      if (captureTime > simTime) break;
      const azimuth = (k / cfg.pointsPerRev) * 360;
      const primitives = scene.primitivesAt(captureTime);
      const dir = Scene.rayDirection(azimuth, 0);
      const hit = Scene.intersectScene(SENSOR_ORIGIN, dir, primitives, cfg.maxRange);
      if (hit) points.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], channel: 0, t: captureTime, range: hit.t });
    }

    return {
      points,
      revolutionProgress: (simTime - revStart) / period,
      stats: {
        fovH: 360, fovV: 0,
        refreshHz: cfg.rpm / 60,
        pointsPerFrame: cfg.pointsPerRev,
        movingParts: true,
        captureWindow: period,
      },
    };
  }

  window.Lidar = window.Lidar || {};
  window.Lidar.Planar2D = { simulate };
})();
