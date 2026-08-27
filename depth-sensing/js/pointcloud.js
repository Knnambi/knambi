/*
 * pointcloud.js — turns each sensor's 2D depth reconstruction into a 3D
 * point cloud, all expressed in one shared world frame (the scene's own
 * coordinate system: every camera in this app sits somewhere along X,
 * looking down +Z, with no rotation — see scene.js).
 *
 * The pinhole back-projection asked for is:
 *   X = (u - cx) * depth / fx
 *   Y = (v - cy) * depth / fy
 *   Z = depth
 * which assumes "depth" is the camera-space Z (perpendicular distance to
 * the image plane) — the convention a stereo/RGBD camera actually
 * reports. This app's ToF and structured-light sensors instead measure
 * RANGE (straight-line distance along the line of sight) — the physically
 * correct quantity for a round-trip light pulse — so applying that
 * formula to them unmodified would silently warp their clouds outward
 * near the frame edges. Camera.pixelRay already gives the exact unit
 * ray direction for every pixel, i.e. ((u-cx)/fx, (v-cy)/fy, 1) after
 * normalizing, so:
 *   - RANGE depth r along a unit ray `dir`: point = origin + dir * r
 *     (this already IS the shared formula above, just solved for a unit
 *     direction instead of re-deriving X/Y from Z)
 *   - Z depth z along a unit ray `dir`: t = z / dir.z; point = origin + dir * t
 * Both reduce to exactly the stated pinhole equations for a pixel on the
 * optical axis, and generalize correctly off-axis — see README.md.
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;
  const Camera = window.Depth.Camera;

  function pointFromRange(origin, dir, range) {
    return V.add(origin, V.scale(dir, range));
  }
  function pointFromZDepth(origin, dir, z) {
    const t = z / dir[2];
    return V.add(origin, V.scale(dir, t));
  }

  // Ground truth: the scene's own exact geometry, no sensor noise at
  // all — intersectScene's hit.point is already the exact 3D point, so
  // no back-projection formula is even needed here.
  function buildGroundTruthCloud(cam, primitives) {
    const Scene = window.Depth.Scene;
    const points = [];
    for (let y = 0; y < cam.height; y++) {
      for (let x = 0; x < cam.width; x++) {
        const ray = Camera.pixelRay(cam, x, y);
        const hit = Scene.intersectScene(ray.origin, ray.dir, primitives);
        if (!hit) continue;
        points.push({ x: hit.point[0], y: hit.point[1], z: hit.point[2], c: 1, range: hit.t });
      }
    }
    return points;
  }

  function buildToFCloud(cam, tof) {
    const points = [];
    for (let y = 0; y < cam.height; y++) {
      for (let x = 0; x < cam.width; x++) {
        const idx = y * cam.width + x;
        if (!tof.valid[idx]) continue;
        const ray = Camera.pixelRay(cam, x, y);
        const p = pointFromRange(cam.position, ray.dir, tof.measuredDepth[idx]);
        points.push({ x: p[0], y: p[1], z: p[2], c: tof.confidence[idx], range: tof.measuredDepth[idx] });
      }
    }
    return { points: points, attempted: cam.width * cam.height };
  }

  function buildStructuredLightCloud(projector, sl) {
    const points = [];
    for (const d of sl.dots) {
      if (!d.valid) continue;
      const ray = Camera.pixelRay(projector, d.dx, d.dy);
      const p = pointFromRange(projector.position, ray.dir, d.reconstructedDepth);
      points.push({ x: p[0], y: p[1], z: p[2], c: d.confidence, range: d.reconstructedDepth });
    }
    return { points: points, attempted: sl.dots.length };
  }

  function buildStereoCloud(cam, stereo) {
    const points = [];
    for (let y = 0; y < cam.height; y++) {
      for (let x = 0; x < cam.width; x++) {
        const idx = y * cam.width + x;
        if (!stereo.valid[idx]) continue;
        const ray = Camera.pixelRay(cam, x, y);
        const p = pointFromZDepth(cam.position, ray.dir, stereo.depth[idx]);
        points.push({ x: p[0], y: p[1], z: p[2], c: stereo.confidence[idx], range: V.length(V.sub(p, cam.position)) });
      }
    }
    return { points: points, attempted: cam.width * cam.height };
  }

  // Mean and RMS distance between each valid measurement and the exact
  // truth along that SAME ray — i.e. "distance to the reference cloud"
  // for a ray dense enough to include that exact sample, computed
  // directly instead of by nearest-neighbor search. Because the true and
  // measured points here share one ray, the 3D distance is just the
  // depth error scaled by 1/dir.z (off-axis rays travel slightly more
  // world-space distance per unit of depth) — a small, honest geometric
  // correction on top of the depth-error numbers already shown in 2D.
  function accuracyStats(errors) {
    let n = 0, sum = 0, sumSq = 0;
    for (const e of errors) {
      if (!isFinite(e)) continue;
      sum += Math.abs(e); sumSq += e * e; n++;
    }
    return { mean: n ? sum / n : NaN, rms: n ? Math.sqrt(sumSq / n) : NaN, n: n };
  }

  function tofAccuracy(cam, tof) {
    const errs = [];
    for (let i = 0; i < tof.valid.length; i++) {
      if (!tof.valid[i] || !isFinite(tof.trueDepth[i])) continue;
      const x = i % cam.width, y = (i - x) / cam.width;
      const dir = Camera.pixelRay(cam, x, y).dir;
      errs.push((tof.measuredDepth[i] - tof.trueDepth[i]) / dir[2]);
    }
    return accuracyStats(errs);
  }
  function slAccuracy(sl) {
    const errs = [];
    for (const d of sl.dots) {
      if (!d.valid || !isFinite(d.trueDepth)) continue;
      errs.push(d.reconstructedDepth - d.trueDepth); // already along the projector ray
    }
    return accuracyStats(errs);
  }
  function stereoAccuracy(cam, stereo, groundTruthRange) {
    const errs = [];
    for (let i = 0; i < stereo.valid.length; i++) {
      if (!stereo.valid[i] || !isFinite(groundTruthRange[i])) continue;
      const x = i % cam.width, y = (i - x) / cam.width;
      const dir = Camera.pixelRay(cam, x, y).dir;
      const trueZ = groundTruthRange[i] * dir[2]; // range -> camera-space Z
      errs.push(stereo.depth[i] - trueZ);
    }
    return accuracyStats(errs);
  }

  // ---------- export ----------
  function toPLY(points) {
    const header =
      "ply\nformat ascii 1.0\n" +
      "element vertex " + points.length + "\n" +
      "property float x\nproperty float y\nproperty float z\n" +
      "property uchar red\nproperty uchar green\nproperty uchar blue\n" +
      "end_header\n";
    let body = "";
    for (const p of points) {
      const g = Math.round(Math.max(0, Math.min(1, p.c)) * 255);
      body += p.x.toFixed(5) + " " + p.y.toFixed(5) + " " + p.z.toFixed(5) + " " + g + " " + g + " " + g + "\n";
    }
    return header + body;
  }
  function toXYZ(points) {
    let body = "";
    for (const p of points) body += p.x.toFixed(5) + " " + p.y.toFixed(5) + " " + p.z.toFixed(5) + " " + p.c.toFixed(3) + "\n";
    return body;
  }
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.Depth = window.Depth || {};
  window.Depth.PointCloud = {
    buildGroundTruthCloud, buildToFCloud, buildStructuredLightCloud, buildStereoCloud,
    tofAccuracy, slAccuracy, stereoAccuracy,
    toPLY, toXYZ, downloadText,
  };
})();
