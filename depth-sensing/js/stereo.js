/*
 * stereo.js — two ordinary cameras, offset by a known baseline along X,
 * both rendered with render.js's passive/ambient shading (this is the
 * one sensor of the three that's *passive*: it brings no light of its
 * own, so ambient level and surface texture — appearance, not IR
 * behavior — are what matter here).
 *
 * Because both cameras share the same orientation and only differ in X
 * position, the epipolar lines are already horizontal — block matching
 * can search along image rows directly with no separate rectification
 * step. That's a real simplification (real stereo rigs need calibration
 * and rectification to get here), not a shortcut in the matching math
 * itself.
 *
 * depth = (baseline * focalLengthPixels) / disparity — the classic
 * stereo triangulation formula, used as-is once a disparity is found.
 */
(function () {
  "use strict";

  const Render = window.Depth.Render;

  const WINDOW = 2; // block half-size: (2*WINDOW+1)^2 SSD window
  const READ_NOISE = 0.01; // small per-pixel brightness noise, independent per camera
  // Minimum required (worst-best)/worst cost contrast across the
  // disparity search to accept a match. Below this, the surface is
  // treated as too textureless to trust (a hole), not a guess.
  const MIN_CONTRAST = 0.5;
  // Minimum brightness variance a left-image block needs before a match
  // is even attempted — see localVariance() below.
  const MIN_VARIANCE = 0.0009;

  function addReadNoise(img, rng) {
    const RNG = window.Depth.RNG;
    const out = new Float32Array(img.length);
    for (let i = 0; i < img.length; i++) out[i] = Math.max(0, Math.min(1, img[i] + RNG.gaussian(rng, 0, READ_NOISE)));
    return out;
  }

  // How much actual content is in this block of the left image — the
  // real, principled way stereo algorithms detect a textureless patch
  // (a flat wall's SSD curve can still look "confident" purely from
  // noise; its *content* is unambiguously flat, which this catches
  // directly instead of trying to infer it from matching behavior).
  function localVariance(img, w, h, cx, cy) {
    let sum = 0, sumSq = 0, n = 0;
    for (let dy = -WINDOW; dy <= WINDOW; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= w) continue;
        const v = img[y * w + x];
        sum += v; sumSq += v * v; n++;
      }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  }

  function ssd(left, right, w, h, lx, ly, rx, ry) {
    let sum = 0;
    for (let dy = -WINDOW; dy <= WINDOW; dy++) {
      const ySrc = ly + dy, yDst = ry + dy;
      if (ySrc < 0 || ySrc >= h || yDst < 0 || yDst >= h) return Infinity;
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const xSrc = lx + dx, xDst = rx + dx;
        if (xSrc < 0 || xSrc >= w || xDst < 0 || xDst >= w) return Infinity;
        const diff = left[ySrc * w + xSrc] - right[yDst * w + xDst];
        sum += diff * diff;
      }
    }
    return sum;
  }

  /**
   * @param leftCam, rightCam  Camera objects, offset along X by `baseline`
   * @param primitives         the scene
   * @param opts  { ambient, textureDensity, baseline, maxDisparity, rng }
   * @returns { w, h, leftImage, rightImage, disparity (Float32Array, NaN
   *            where no confident match), depth (Float32Array), valid }
   */
  function simulateStereo(leftCam, rightCam, primitives, opts) {
    const w = leftCam.width, h = leftCam.height;
    const focalPx = h / (2 * Math.tan(leftCam.fov / 2));

    const leftRaw = Render.renderView(leftCam, primitives, opts);
    const rightRaw = Render.renderView(rightCam, primitives, opts);
    const left = addReadNoise(leftRaw, opts.rng);
    const right = addReadNoise(rightRaw, opts.rng);

    const disparity = new Float32Array(w * h).fill(NaN);
    const depth = new Float32Array(w * h).fill(NaN);
    const valid = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (localVariance(left, w, h, x, y) < MIN_VARIANCE) continue; // no content to match at all

        // The right camera sits to the +X side, so a point's image
        // shifts to smaller x in the right view as it gets closer —
        // search leftward (decreasing x) for the matching block.
        let best = Infinity, bestD = 0, worst = -Infinity;
        for (let d = 0; d <= opts.maxDisparity; d++) {
          const cost = ssd(left, right, w, h, x, y, x - d, y);
          if (!isFinite(cost)) continue;
          if (cost < best) { best = cost; bestD = d; }
          if (cost > worst) worst = cost;
        }
        // A real match stands out: cost should rise sharply away from
        // the true disparity. On a flat/textureless surface, EVERY
        // disparity looks about equally (mis)matched — best and worst
        // both stay tiny and close together — which is exactly the
        // "ambiguous match" failure a textureless wall produces on a
        // real stereo rig. Requiring the best cost to be a small
        // *fraction* of the worst catches that even though the raw SSD
        // values themselves are noise-scale small.
        const contrast = worst > 1e-9 ? 1 - best / worst : 0;
        const ambiguous = !isFinite(best) || contrast < MIN_CONTRAST;
        if (bestD > 0 && isFinite(best) && !ambiguous) {
          // Real stereo rigs don't stop at whole-pixel disparity: the SSD
          // cost curve around the best integer match is fit with a
          // parabola to estimate where the *true* minimum falls between
          // pixels. Without this, integer-only search quantizes depth in
          // steps that get huge at range (a background 10+ m away can
          // shift under 3px between cameras, so missing by one whole
          // pixel is a multi-meter error) — an artifact of the search,
          // not of the sensor, and this refinement removes most of it.
          let subD = bestD;
          if (bestD > 0 && bestD < opts.maxDisparity) {
            const cm1 = ssd(left, right, w, h, x, y, x - (bestD - 1), y);
            const cp1 = ssd(left, right, w, h, x, y, x - (bestD + 1), y);
            const denom = cm1 - 2 * best + cp1;
            if (isFinite(cm1) && isFinite(cp1) && denom > 1e-9) {
              const delta = 0.5 * (cm1 - cp1) / denom;
              subD = bestD + Math.max(-0.5, Math.min(0.5, delta));
            }
          }
          disparity[y * w + x] = subD;
          depth[y * w + x] = (opts.baseline * focalPx) / subD;
          valid[y * w + x] = 1;
        }
      }
    }
    return { w: w, h: h, leftImage: left, rightImage: right, disparity: disparity, depth: depth, valid: valid };
  }

  window.Depth = window.Depth || {};
  window.Depth.Stereo = { simulateStereo };
})();
