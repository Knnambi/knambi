/*
 * scene.js — the one 3D world all three sensors look at. Camera sits at
 * the origin looking down +Z (X = right, Y = up, Z = into the scene).
 *
 * Three primitive types, each with an analytic ray intersection:
 *   sphere — center + radius
 *   box    — axis-aligned min/max corners
 *   quad   — a finite oriented rectangle (origin + two edge vectors).
 *            Used for the background wall AND for the two angled panels
 *            of the "concave corner" layout, which is deliberately built
 *            from two quads meeting at a shared far edge so a primary
 *            ray hitting one panel can plausibly bounce to the other —
 *            that's the geometry real ToF multipath artifacts come from.
 *
 * Every primitive carries a `surface` type (matte / reflective / dark)
 * that each sensor module interprets differently — see README.md.
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;
  const EPS = 1e-6;

  // ---------- intersections ----------
  // Each returns { t, point, normal } or null. `normal` always faces
  // back toward the ray origin (flipped if necessary).
  function intersectSphere(origin, dir, prim) {
    const oc = V.sub(origin, prim.center);
    const b = V.dot(oc, dir);
    const c = V.dot(oc, oc) - prim.radius * prim.radius;
    const disc = b * b - c; // dir is unit length, so a=1
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < EPS) t = -b + sq;
    if (t < EPS) return null;
    const point = V.add(origin, V.scale(dir, t));
    let normal = V.normalize(V.sub(point, prim.center));
    if (V.dot(normal, dir) > 0) normal = V.scale(normal, -1);
    return { t: t, point: point, normal: normal };
  }

  function intersectBox(origin, dir, prim) {
    let tmin = -Infinity, tmax = Infinity, hitAxis = -1, hitSign = 1;
    for (let axis = 0; axis < 3; axis++) {
      const d = dir[axis];
      const o = origin[axis];
      const lo = prim.min[axis], hi = prim.max[axis];
      if (Math.abs(d) < EPS) {
        if (o < lo || o > hi) return null;
        continue;
      }
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
    return { t: t, point: point, normal: normal };
  }

  function intersectQuad(origin, dir, prim) {
    const normal = prim._normal || (prim._normal = V.normalize(V.cross(prim.edgeU, prim.edgeV)));
    const denom = V.dot(normal, dir);
    if (Math.abs(denom) < EPS) return null;
    const t = V.dot(V.sub(prim.origin, origin), normal) / denom;
    if (t < EPS) return null;
    const point = V.add(origin, V.scale(dir, t));
    const rel = V.sub(point, prim.origin);
    const u = V.dot(rel, prim.edgeU) / V.dot(prim.edgeU, prim.edgeU);
    const v = V.dot(rel, prim.edgeV) / V.dot(prim.edgeV, prim.edgeV);
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    let n = normal;
    if (V.dot(n, dir) > 0) n = V.scale(n, -1);
    return { t: t, point: point, normal: n, u: u, v: v };
  }

  function intersectOne(origin, dir, prim) {
    if (prim.type === "sphere") return intersectSphere(origin, dir, prim);
    if (prim.type === "box") return intersectBox(origin, dir, prim);
    if (prim.type === "quad") return intersectQuad(origin, dir, prim);
    return null;
  }

  // Casts one ray against the whole scene, returns the nearest hit
  // (with `.primitive` attached) or null.
  function intersectScene(origin, dir, primitives) {
    let best = null;
    for (let i = 0; i < primitives.length; i++) {
      const hit = intersectOne(origin, dir, primitives[i]);
      if (hit && (!best || hit.t < best.t)) {
        hit.primitive = primitives[i];
        best = hit;
      }
    }
    return best;
  }

  // Closest point on a finite quad to an arbitrary 3D point — used by
  // tof.js to find the plausible second-bounce point when modeling
  // multipath off the concave-corner layout.
  function closestPointOnQuad(prim, point) {
    const rel = V.sub(point, prim.origin);
    let u = V.dot(rel, prim.edgeU) / V.dot(prim.edgeU, prim.edgeU);
    let v = V.dot(rel, prim.edgeV) / V.dot(prim.edgeV, prim.edgeV);
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));
    return V.add(prim.origin, V.add(V.scale(prim.edgeU, u), V.scale(prim.edgeV, v)));
  }

  // ---------- albedo per surface type ----------
  // How much of the light hitting a surface makes it back to a sensor,
  // in a rough 0..1 sense. Real numbers, not meant to be photometric —
  // just ordered correctly and different enough to matter. See README.
  const ALBEDO = { matte: 0.55, reflective: 0.85, dark: 0.06 };
  // Reflective surfaces bounce specularly rather than diffusing evenly,
  // so *most* viewing angles catch very little of that light back —
  // modeled as extra variance/attenuation rather than a fixed number.
  const SPECULAR_RETURN_CHANCE = { matte: 1.0, reflective: 0.25, dark: 1.0 };

  // ---------- scene construction ----------
  // `cfg`: { objectDistance, objectCount, layout, surfaceType }
  function buildScene(cfg) {
    const prims = [];
    const backZ = Math.max(cfg.objectDistance + 6, 10);

    // Background wall, always matte — it's context, not an experiment.
    // Sized generously relative to its own distance so it always fills
    // every camera's field of view (up to a wide ~90 degrees) no matter
    // how far back objectDistance has pushed it — otherwise rays near
    // the frame edges miss the scene entirely at long distances.
    const half = backZ * 1.3;
    prims.push({
      type: "quad",
      origin: [-half, -half, backZ],
      edgeU: [2 * half, 0, 0],
      edgeV: [0, 2 * half, 0],
      surface: "matte",
      role: "background",
    });

    if (cfg.layout === "concave-corner") {
      const hinge = [0, -1.5, cfg.objectDistance + 1.6];
      const wallA = {
        type: "quad", origin: hinge.slice(),
        edgeU: [-2.2, 0, -1.6], edgeV: [0, 3, 0],
        surface: cfg.surfaceType, role: "cornerA",
      };
      const wallB = {
        type: "quad", origin: hinge.slice(),
        edgeU: [2.2, 0, -1.6], edgeV: [0, 3, 0],
        surface: cfg.surfaceType, role: "cornerB",
      };
      wallA.other = wallB;
      wallB.other = wallA;
      prims.push(wallA, wallB);
    } else {
      const n = Math.max(1, Math.min(5, cfg.objectCount));
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1..1
        let x, z;
        if (cfg.layout === "cluster") {
          x = spread * 1.1;
          z = cfg.objectDistance + (i % 2 === 0 ? -0.4 : 0.4);
        } else { // "row"
          x = spread * 2.6;
          z = cfg.objectDistance;
        }
        if (i % 2 === 0) {
          prims.push({ type: "sphere", center: [x, 0, z], radius: 0.55, surface: cfg.surfaceType, role: "object" });
        } else {
          prims.push({
            type: "box",
            min: [x - 0.5, -0.6, z - 0.5],
            max: [x + 0.5, 0.6, z + 0.5],
            surface: cfg.surfaceType, role: "object",
          });
        }
      }
    }
    return prims;
  }

  window.Depth = window.Depth || {};
  window.Depth.Scene = { intersectScene, closestPointOnQuad, buildScene, ALBEDO, SPECULAR_RETURN_CHANCE };
})();
