/*
 * mechanical.js — a spinning multi-channel LiDAR (Velodyne-style): a
 * vertical stack of fixed-elevation lasers, all firing together at each
 * azimuth step as a mirror/head rotates a full 360 degrees.
 *
 * The whole revolution's ray schedule (every step's exact azimuth AND
 * capture time) is precomputed up front, then "revealed" up to the
 * current simTime — exactly why a moving object comes out sheared: an
 * early step in the revolution samples the object's position at an
 * earlier instant than a later step does, and the reveal keeps each
 * point's own true capture time rather than pretending they're
 * simultaneous.
 */
(function () {
  "use strict";

  const Scene = window.Lidar.Scene;
  const SENSOR_ORIGIN = [0, 0, 0];

  /**
   * @param scene   from Scene.buildScene()
   * @param cfg     { numChannels, elevMin, elevMax, rpm, pointsPerRev, maxRange }
   * @param simTime current scene time, seconds
   */
  function simulate(scene, cfg, simTime) {
    const period = 60 / cfg.rpm; // seconds per revolution
    const revIndex = Math.floor(simTime / period);
    const revStart = revIndex * period;

    const points = [];
    for (let k = 0; k < cfg.pointsPerRev; k++) {
      const captureTime = revStart + (k / cfg.pointsPerRev) * period;
      if (captureTime > simTime) break; // not swept past yet this revolution
      const azimuth = (k / cfg.pointsPerRev) * 360;

      // All channels fire together at this azimuth step — computed once
      // per step, not per channel, so the moving object's AABB (the only
      // time-varying part of the scene) isn't rebuilt N times over.
      const primitives = scene.primitivesAt(captureTime);

      for (let c = 0; c < cfg.numChannels; c++) {
        const elevation = cfg.numChannels > 1
          ? cfg.elevMin + (c / (cfg.numChannels - 1)) * (cfg.elevMax - cfg.elevMin)
          : (cfg.elevMin + cfg.elevMax) / 2;
        const dir = Scene.rayDirection(azimuth, elevation);
        const hit = Scene.intersectScene(SENSOR_ORIGIN, dir, primitives, cfg.maxRange);
        if (hit) points.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], channel: c, t: captureTime, range: hit.t });
      }
    }

    return {
      points,
      revolutionProgress: (simTime - revStart) / period,
      stats: {
        fovH: 360, fovV: cfg.elevMax - cfg.elevMin,
        refreshHz: cfg.rpm / 60,
        pointsPerFrame: cfg.numChannels * cfg.pointsPerRev,
        movingParts: true,
        captureWindow: period, // used for the motion-distortion estimate
      },
    };
  }

  window.Lidar = window.Lidar || {};
  window.Lidar.Mechanical = { simulate };
})();
