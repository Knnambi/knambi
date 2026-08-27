/*
 * scene.js — the shared 360-degree "surroundings" environment: a sensor
 * at the origin, a ring of static boxes/cylinders around it at varying
 * radii and angles, a ground plane, and one moving box that all four
 * scanners look at identically (each just samples it at whatever instant
 * its own timing model calls for — see each sensor file).
 *
 * Convention: Y is up. Azimuth 0 points down +Z; azimuth increases
 * toward +X (so a full sweep is azimuth 0..360). Elevation is measured
 * from the horizontal plane, positive = up.
 */
(function () {
  "use strict";

  const V = window.Vec3;
  const EPS = 1e-6;

  // ---------- intersections ----------
  function intersectBox(origin, dir, prim) {
    let tmin = -Infinity, tmax = Infinity, hitAxis = -1, hitSign = 1;
    for (let axis = 0; axis < 3; axis++) {
      const d = dir[axis], o = origin[axis];
      const lo = prim.min[axis], hi = prim.max[axis];
      if (Math.abs(d) < EPS) { if (o < lo || o > hi) return null; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d, sign = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
      if (t1 > tmin) { tmin = t1; hitAxis = axis; hitSign = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    const t = tmin > EPS ? tmin : tmax;
    if (t < EPS) return null;
    const point = V.add(origin, V.scale(dir, t));
    const normal = [0, 0, 0];
    normal[hitAxis === -1 ? 2 : hitAxis] = hitAxis === -1 ? 1 : hitSign;
    return { t, point, normal };
  }

  // Finite vertical cylinder: axis parallel to Y, base center (cx,y0,cz),
  // extending to y1 = y0 + height. Side surface plus both end caps.
  function intersectCylinder(origin, dir, prim) {
    const cx = prim.center[0], cz = prim.center[2];
    const y0 = prim.center[1], y1 = y0 + prim.height, r = prim.radius;
    const ox = origin[0] - cx, oz = origin[2] - cz;
    const dx = dir[0], dz = dir[2];
    let best = null;

    const a = dx * dx + dz * dz;
    if (a > EPS) {
      const b = 2 * (ox * dx + oz * dz);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
          if (t < EPS) continue;
          const y = origin[1] + t * dir[1];
          if (y < y0 || y > y1) continue;
          if (!best || t < best.t) {
            const point = V.add(origin, V.scale(dir, t));
            const normal = V.normalize([point[0] - cx, 0, point[2] - cz]);
            best = { t, point, normal };
          }
          break; // nearest valid side root is always the first in-range one
        }
      }
    }
    // End caps.
    if (Math.abs(dir[1]) > EPS) {
      for (const capY of [y0, y1]) {
        const t = (capY - origin[1]) / dir[1];
        if (t < EPS || (best && t >= best.t)) continue;
        const px = origin[0] + t * dir[0], pz = origin[2] + t * dir[2];
        if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) <= r * r) {
          best = { t, point: [px, capY, pz], normal: [0, capY === y1 ? 1 : -1, 0] };
        }
      }
    }
    if (!best) return null;
    if (V.dot(best.normal, dir) > 0) best.normal = V.scale(best.normal, -1);
    return best;
  }

  // Ground: an infinite horizontal plane at y = groundY, only intersected
  // looking downward. Range-limited the same way every other primitive
  // is, via intersectScene's maxRange cutoff.
  function intersectGround(origin, dir, prim) {
    if (dir[1] >= -EPS) return null;
    const t = (prim.y - origin[1]) / dir[1];
    if (t < EPS) return null;
    return { t, point: V.add(origin, V.scale(dir, t)), normal: [0, 1, 0] };
  }

  function intersectOne(origin, dir, prim) {
    if (prim.type === "box") return intersectBox(origin, dir, prim);
    if (prim.type === "cylinder") return intersectCylinder(origin, dir, prim);
    if (prim.type === "ground") return intersectGround(origin, dir, prim);
    return null;
  }

  function intersectScene(origin, dir, primitives, maxRange) {
    let best = null;
    for (let i = 0; i < primitives.length; i++) {
      const hit = intersectOne(origin, dir, primitives[i]);
      if (hit && hit.t <= maxRange && (!best || hit.t < best.t)) { hit.primitive = primitives[i]; best = hit; }
    }
    return best;
  }

  // Azimuth 0 = +Z, sweeping toward +X as azimuth grows. Elevation tilts
  // toward +Y. Both in degrees.
  function rayDirection(azimuthDeg, elevationDeg) {
    const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  }

  // ---------- scene construction ----------
  // cfg: { objectCount, minRadius, maxRadius, sensorHeight, movingSpeed,
  //        movingEnabled, seed }
  function buildScene(cfg) {
    const rng = window.RNG.makeRng(cfg.seed >>> 0);
    const groundY = -cfg.sensorHeight;
    const ground = { type: "ground", y: groundY, role: "ground" };

    const staticPrimitives = [];
    const n = cfg.objectCount;
    for (let i = 0; i < n; i++) {
      const azimuth = (i / n) * 360 + (rng() - 0.5) * (360 / n) * 0.5;
      const radius = cfg.minRadius + rng() * (cfg.maxRadius - cfg.minRadius);
      const az = azimuth * Math.PI / 180;
      const x = Math.sin(az) * radius, z = Math.cos(az) * radius;
      const height = 1.0 + rng() * 2.2;
      if (i % 2 === 0) {
        const halfW = 0.4 + rng() * 0.35;
        staticPrimitives.push({
          type: "box",
          min: [x - halfW, groundY, z - halfW],
          max: [x + halfW, groundY + height, z + halfW],
          role: "object",
        });
      } else {
        staticPrimitives.push({
          type: "cylinder",
          center: [x, groundY, z],
          radius: 0.35 + rng() * 0.3,
          height,
          role: "object",
        });
      }
    }

    // The moving object: a box ping-ponging along X at a fixed Z/radius,
    // directly in front of the sensor, so every architecture's sweep
    // crosses it. Position is a pure function of time so every sensor
    // can sample "where was it at MY capture instant" independently.
    const movingZ = (cfg.minRadius + cfg.maxRadius) / 2;
    const movingSpan = Math.max(4, cfg.maxRadius);
    const movingHalfW = 0.6, movingHeight = 1.4;
    function movingObjectAt(t) {
      if (!cfg.movingEnabled) return null;
      const period = (2 * movingSpan) / Math.max(0.05, cfg.movingSpeed);
      const phase = ((t % period) + period) % period;
      const dist = phase < movingSpan ? phase : 2 * movingSpan - phase;
      const x = -movingSpan / 2 + dist;
      return {
        type: "box",
        min: [x - movingHalfW, groundY, movingZ - movingHalfW],
        max: [x + movingHalfW, groundY + movingHeight, movingZ + movingHalfW],
        role: "moving",
      };
    }

    function primitivesAt(t) {
      const list = staticPrimitives.concat([ground]);
      const mo = movingObjectAt(t);
      if (mo) list.push(mo);
      return list;
    }

    return { staticPrimitives, ground, groundY, movingObjectAt, primitivesAt };
  }

  window.Lidar = window.Lidar || {};
  window.Lidar.Scene = { intersectScene, rayDirection, buildScene };
})();
