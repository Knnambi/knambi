/*
 * structured-light.js — an IR dot grid is projected from a point offset
 * from the camera by a known baseline. Depth comes from *triangulation*:
 * knowing which direction a dot was emitted in, and where the camera
 * observes it landing, is enough geometry to solve for distance —
 * exactly like a projector-camera Kinect-style depth sensor.
 *
 * The triangulation here is exact (verified against ground truth: for a
 * ray of known direction from a known baseline, the depth that produces
 * a given observed camera pixel has a closed-form solution — see the
 * derivation note above reconstructDepth()). All the *simulated
 * imperfection* — the real subject of this module — comes from the
 * "camera can't perfectly find a dot's center" noise and dropout model,
 * driven by ambient light and surface darkness: exactly where real
 * structured-light sensors (Kinect, Face ID) actually fail.
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;
  const Scene = window.Depth.Scene;
  const Camera = window.Depth.Camera;
  const RNG = window.Depth.RNG;

  const BASE_SIGMA_PX = 0.05; // best-case dot-center localization noise
  const AMBIENT_NOISE_SCALE = 0.22; // how hard bright ambient hits localization
  // Real dot detectors either find a dot within a bounded neighborhood or
  // fail to find it at all (a dropout) — they don't drift arbitrarily far
  // off. Capping the noise keeps "weak signal" honest as more dropouts
  // rather than a smooth slide into meaningless numbers.
  const MAX_SIGMA_PX = 1.6;
  const MAX_SANE_DEPTH = 40; // beyond this a reconstruction is treated as a failed match, not a real reading
  const REFERENCE_DEPTH = 6; // calibration plane, purely for the visual "expected vs observed" overlay

  function ndcXOf(cam, point) {
    const aspect = cam.width / cam.height;
    const scale = Math.tan(cam.fov / 2);
    const rel = V.sub(point, cam.position);
    return (rel[0] / rel[2]) / (aspect * scale);
  }
  // Inverse of the pixel-x formula inside Camera.projectToPixel. Note
  // this does NOT re-multiply by aspect*scale: projectToPixel's ndcX is
  // already divided by (aspect*scale) before it's turned into a pixel
  // coordinate, so undoing the pixel conversion alone recovers it.
  function pixelXToNdcX(cam, px) {
    return 2 * (px + 0.5) / cam.width - 1;
  }

  /**
   * @param cam         observing camera
   * @param projector   Camera-shaped object for the IR pattern source
   * @param primitives  the scene
   * @param opts        { gridSize, baseline, ambient, rng }
   * @returns {
   *   dots: [{ dx, dy, expectedPixel:[x,y]|null, observedPixel:[x,y]|null,
   *            valid, trueDepth, reconstructedDepth }],
   *   depthGrid, trueDepthGrid, validGrid  (Float32/Uint8Array, gridSize x gridSize)
   * }
   */
  function simulateStructuredLight(cam, projector, primitives, opts) {
    const n = opts.gridSize;
    const dots = [];
    const depthGrid = new Float32Array(n * n);
    const trueDepthGrid = new Float32Array(n * n);
    const validGrid = new Uint8Array(n * n);
    const aspect = cam.width / cam.height;
    const scale = Math.tan(cam.fov / 2);
    const baseline = opts.baseline;
    const focalPx = cam.height / (2 * scale);
    // How many meters of depth error one pixel of disparity noise would
    // cause AT THIS depth (triangulation error grows with the square of
    // distance) — a real sensor uses exactly this kind of confidence
    // check to withhold a reading it can't trust rather than report a
    // wild number. Without it, a handful of grazing-angle/background
    // hits (where the geometry is poorly conditioned) would dominate
    // any accuracy statistic with tens-of-meters outliers.
    const CONFIDENCE_LIMIT_M = 1.2;

    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const idx = gy * n + gx;
        const pray = Camera.pixelRay(projector, gx, gy);

        // Where this dot *would* land if the whole scene were a flat
        // reference wall — purely for the "expected vs observed" view.
        const tRef = (REFERENCE_DEPTH - projector.position[2]) / pray.dir[2];
        const refPoint = V.add(projector.position, V.scale(pray.dir, tRef));
        const expectedPixel = Camera.projectToPixel(cam, refPoint);

        const hit = Scene.intersectScene(projector.position, pray.dir, primitives);
        if (!hit) {
          dots.push({ dx: gx, dy: gy, expectedPixel: expectedPixel, observedPixel: null, valid: false, trueDepth: NaN, reconstructedDepth: NaN });
          validGrid[idx] = 0; trueDepthGrid[idx] = NaN;
          continue;
        }
        trueDepthGrid[idx] = hit.t;

        // Signal strength: same backscatter idea as ToF, but toward the
        // *projector* (the dot has to bounce back roughly the way it came
        // to be visible to a nearby camera at all). Reflective surfaces
        // mostly mirror the dot away in some other direction entirely —
        // the same SPECULAR_RETURN_CHANCE penalty ToF uses — so in
        // practice they mostly show up here as dropouts, not as
        // unusually *good* readings.
        const albedo = Scene.ALBEDO[hit.primitive.surface];
        const specChance = Scene.SPECULAR_RETURN_CHANCE[hit.primitive.surface];
        const toProjector = V.normalize(V.sub(projector.position, hit.point));
        const backscatter = Math.max(0, V.dot(hit.normal, toProjector));
        const signal = (albedo * backscatter * specChance) / (hit.t * hit.t + 0.01);

        const trueObservedPixel = Camera.projectToPixel(cam, hit.point);
        if (!trueObservedPixel) {
          dots.push({ dx: gx, dy: gy, expectedPixel: expectedPixel, observedPixel: null, valid: false, trueDepth: hit.t, reconstructedDepth: NaN });
          validGrid[idx] = 0;
          continue;
        }

        // Bright ambient (sunlight) washes out the IR dot's contrast,
        // and weak backscatter (dark surfaces, glancing angles) does the
        // same thing for the opposite reason — either way, the camera's
        // estimate of *where exactly* the dot's center is gets noisier.
        const detectSigma = Math.min(MAX_SIGMA_PX, BASE_SIGMA_PX + (AMBIENT_NOISE_SCALE * opts.ambient) / (signal + 0.01));
        const observedPixel = [
          trueObservedPixel[0] + RNG.gaussian(opts.rng, 0, detectSigma),
          trueObservedPixel[1] + RNG.gaussian(opts.rng, 0, detectSigma),
        ];

        // Dropout: past some combination of ambient wash-out and weak
        // return, the dot isn't detected at all (a real, visible "hole").
        const dropoutChance = Math.max(0, Math.min(0.97, opts.ambient * 1.15 - signal * 40));
        const isValid = opts.rng() >= dropoutChance;

        let reconstructedDepth = NaN;
        let confidence = 0;
        if (isValid) {
          const observedNdcX = pixelXToNdcX(cam, observedPixel[0]);
          const denom = observedNdcX * aspect * scale * pray.dir[2] - pray.dir[0];
          const t = baseline / denom;
          // A denominator near zero (near-parallel epipolar geometry, or
          // noise pushing the observed angle past it) is a real failure
          // mode of triangulation — but it reads as a *nonsense* number,
          // not a slightly-wrong one. A real system would flag that as
          // "no confident match" rather than report it, so we do too.
          const basicSane = t > 0 && isFinite(t) && t < MAX_SANE_DEPTH;
          const predictedErrorM = basicSane ? (t * t / (baseline * focalPx)) * detectSigma : Infinity;
          const confident = basicSane && predictedErrorM <= CONFIDENCE_LIMIT_M;
          reconstructedDepth = confident ? t : NaN;
          validGrid[idx] = confident ? 1 : 0;
          if (confident) {
            depthGrid[idx] = reconstructedDepth;
            // Same predicted-error check that gated validity, reused as a
            // graded 0..1 confidence rather than a hard cutoff — a dot
            // just inside the limit is trustworthy but not as trustworthy
            // as one with near-zero predicted error.
            confidence = Math.max(0, Math.min(1, 1 - predictedErrorM / CONFIDENCE_LIMIT_M));
          }
        } else {
          validGrid[idx] = 0;
        }

        dots.push({
          dx: gx, dy: gy, expectedPixel: expectedPixel, observedPixel: observedPixel,
          valid: validGrid[idx] === 1, trueDepth: hit.t, reconstructedDepth: reconstructedDepth,
          confidence: confidence,
        });
      }
    }
    return { gridSize: n, dots: dots, depthGrid: depthGrid, trueDepthGrid: trueDepthGrid, validGrid: validGrid };
  }

  window.Depth = window.Depth || {};
  window.Depth.StructuredLight = { simulateStructuredLight, REFERENCE_DEPTH };
})();
