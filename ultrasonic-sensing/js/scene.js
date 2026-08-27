/*
 * scene.js — the shared 360-degree environment, extended from the
 * lidar-scanning project with two things ultrasonic specifically needs:
 *   - a `surface` tag per object ("hard" or "soft") so absorption can be
 *     modeled per-object rather than as one global switch
 *   - a dedicated tiltable flat panel, placed directly ahead of the
 *     primary sensor, so the angle-of-incidence cutoff can be
 *     demonstrated on demand rather than hoping the ring's incidental
 *     box/cylinder geometry happens to produce a glancing hit
 *
 * Same conventions as lidar-scanning: Y up, azimuth 0 = +Z, sweeping
 * toward +X, elevation from horizontal.
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
          break;
        }
      }
    }
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

  function intersectGround(origin, dir, prim) {
    if (dir[1] >= -EPS) return null;
    const t = (prim.y - origin[1]) / dir[1];
    if (t < EPS) return null;
    return { t, point: V.add(origin, V.scale(dir, t)), normal: [0, 1, 0] };
  }

  // Finite oriented rectangle: `center`, `width` (horizontal extent),
  // `height` (vertical extent), and `yawDeg` — 0 means the panel faces
  // straight back along -Z (i.e. squarely toward a sensor at the origin
  // if the panel sits somewhere along +Z); increasing yaw tilts it, and
  // at 90 degrees it's edge-on and (correctly) nearly unhittable.
  function intersectPanel(origin, dir, prim) {
    const yaw = prim.yawDeg * Math.PI / 180;
    const normal = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const tangent = [Math.cos(yaw), 0, Math.sin(yaw)];
    const denom = V.dot(normal, dir);
    if (Math.abs(denom) < EPS) return null;
    const t = V.dot(V.sub(prim.center, origin), normal) / denom;
    if (t < EPS) return null;
    const point = V.add(origin, V.scale(dir, t));
    const rel = V.sub(point, prim.center);
    const u = V.dot(rel, tangent), v = rel[1];
    if (Math.abs(u) > prim.width / 2 || Math.abs(v) > prim.height / 2) return null;
    let n = normal;
    if (V.dot(n, dir) > 0) n = V.scale(n, -1);
    return { t, point, normal: n };
  }

  function intersectOne(origin, dir, prim) {
    if (prim.type === "box") return intersectBox(origin, dir, prim);
    if (prim.type === "cylinder") return intersectCylinder(origin, dir, prim);
    if (prim.type === "ground") return intersectGround(origin, dir, prim);
    if (prim.type === "panel") return intersectPanel(origin, dir, prim);
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

  function rayDirection(azimuthDeg, elevationDeg) {
    const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  }

  // ---------- scene construction ----------
  // cfg: { objectCount, minRadius, maxRadius, sensorHeight, movingSpeed,
  //        movingEnabled, surfaceMix ("hard"|"soft"|"mixed"),
  //        panelDistance, panelYaw, panelSurface, seed }
  function buildScene(cfg) {
    const rng = window.RNG.makeRng(cfg.seed >>> 0);
    const groundY = -cfg.sensorHeight;
    const ground = { type: "ground", y: groundY, role: "ground" };

    function surfaceFor(i) {
      if (cfg.surfaceMix === "soft") return "soft";
      if (cfg.surfaceMix === "mixed") return i % 3 === 0 ? "soft" : "hard";
      return "hard";
    }

    const staticPrimitives = [];
    const n = cfg.objectCount;
    for (let i = 0; i < n; i++) {
      const azimuth = (i / n) * 360 + (rng() - 0.5) * (360 / n) * 0.5;
      const radius = cfg.minRadius + rng() * (cfg.maxRadius - cfg.minRadius);
      const az = azimuth * Math.PI / 180;
      const x = Math.sin(az) * radius, z = Math.cos(az) * radius;
      const height = 1.0 + rng() * 2.2;
      const surface = surfaceFor(i);
      if (i % 2 === 0) {
        const halfW = 0.4 + rng() * 0.35;
        staticPrimitives.push({
          type: "box",
          min: [x - halfW, groundY, z - halfW],
          max: [x + halfW, groundY + height, z + halfW],
          role: "object", surface,
        });
      } else {
        staticPrimitives.push({
          type: "cylinder",
          center: [x, groundY, z],
          radius: 0.35 + rng() * 0.3,
          height,
          role: "object", surface,
        });
      }
    }

    // The dedicated angle-of-incidence test panel: directly ahead of the
    // primary sensor (azimuth 0), at a configurable distance and tilt.
    // Centered at y=0 — the sensor mount's own height, by convention,
    // regardless of sensorHeight/groundY — so a horizontal beam always
    // lines up with it and tilt is the only variable under test.
    const panel = {
      type: "panel",
      center: [0, 0, cfg.panelDistance],
      width: 1.4, height: 1.6,
      yawDeg: cfg.panelYaw,
      role: "panel", surface: cfg.panelSurface,
    };

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
        role: "moving", surface: "hard",
      };
    }

    function primitivesAt(t) {
      const list = staticPrimitives.concat([ground, panel]);
      const mo = movingObjectAt(t);
      if (mo) list.push(mo);
      return list;
    }

    return { staticPrimitives, ground, panel, groundY, movingObjectAt, primitivesAt };
  }

  window.Ultra = window.Ultra || {};
  window.Ultra.Scene = { intersectScene, rayDirection, buildScene };
})();
