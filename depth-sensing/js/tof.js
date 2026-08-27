/*
 * tof.js — time-of-flight depth sensing. An IR point source co-located
 * with the sensor (a real ToF module's emitter and receiver sit right
 * next to each other) lights every photosite's line of sight; the
 * "sensor" measures how long the round trip took and converts that to
 * distance with depth = c * time / 2.
 *
 * Because the light source travels with the receiver, backscatter
 * strength depends only on how squarely a surface faces the sensor and
 * how far away it is (inverse-square falloff) — NOT on the scene's
 * ambient light level. That's deliberate: real ToF sensors are largely
 * ambient-light-robust, which is one of their real advantages over
 * structured light. See README.md.
 *
 * Two limitations are modeled explicitly, per the brief:
 *   - dark/absorptive surfaces return a weak signal -> noisier depth
 *     (and, at the extreme, outright dropouts)
 *   - the "concave corner" layout lets a primary ray's surface bounce
 *     diffusely to the *other* wall and back — a second, longer light
 *     path arriving at roughly the same instant, which a simple ToF
 *     pixel can't separate from the primary return. Blending the two
 *     biases the reported depth outward near the corner, which is
 *     exactly the visual signature of real multipath interference.
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;
  const Scene = window.Depth.Scene;
  const Camera = window.Depth.Camera;
  const RNG = window.Depth.RNG;

  const C_LIGHT = 3e8; // m/s
  const BASE_JITTER_NS = 0.05; // sensor's noise floor, regardless of signal
  const NOISE_SCALE_NS = 0.02; // grows as returned signal weakens
  const DROPOUT_SIGNAL_THRESHOLD = 0.0015;

  /**
   * @param cam         Camera (also acts as the co-located IR emitter)
   * @param primitives  scene from Scene.buildScene()
   * @param opts        { jitterMultiplier, rng }
   * @returns per-pixel Float32Arrays: trueDepth, measuredDepth, plus
   *          Uint8Arrays: valid (0/1) and multipath (0/1, for highlighting)
   */
  function simulateToF(cam, primitives, opts) {
    const w = cam.width, h = cam.height;
    const n = w * h;
    const trueDepth = new Float32Array(n);
    const measuredDepth = new Float32Array(n);
    const valid = new Uint8Array(n);
    const multipath = new Uint8Array(n);
    // Per-pixel confidence (0..1), for the point cloud: a direct readout
    // of the same returned-signal strength that already drives this
    // pixel's noise and dropout above, not a separate invented number.
    const confidence = new Float32Array(n);
    // Signal strength at which we call the return "fully confident" —
    // several times the dropout threshold, so confidence falls off well
    // before a pixel is actually at risk of dropping out.
    const CONFIDENT_SIGNAL = DROPOUT_SIGNAL_THRESHOLD * 3;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const ray = Camera.pixelRay(cam, x, y);
        const hit = Scene.intersectScene(ray.origin, ray.dir, primitives);
        if (!hit) { valid[idx] = 0; trueDepth[idx] = NaN; continue; }

        trueDepth[idx] = hit.t;
        const albedo = Scene.ALBEDO[hit.primitive.surface];
        const specChance = Scene.SPECULAR_RETURN_CHANCE[hit.primitive.surface];
        const backscatter = Math.max(0, V.dot(hit.normal, V.scale(ray.dir, -1)));
        const signalPrimary = (albedo * backscatter * specChance) / (hit.t * hit.t + 0.01);

        // Multipath: only possible where a wall knows its paired wall
        // (the concave-corner layout wires this up in scene.js).
        let apparentDist = hit.t;
        let signalTotal = signalPrimary;
        if (hit.primitive.other) {
          const otherWall = hit.primitive.other;
          const bouncePoint = Scene.closestPointOnQuad(otherWall, hit.point);
          const d1 = V.length(V.sub(hit.point, bouncePoint));
          const d2 = V.length(V.sub(bouncePoint, cam.position));
          const otherAlbedo = Scene.ALBEDO[otherWall.surface];
          const reflBoost = (hit.primitive.surface === "reflective" || otherWall.surface === "reflective") ? 6 : 1;
          const signalSecondary = (0.35 * albedo * otherAlbedo * reflBoost) / (d1 * d1 + 0.05);
          const secondaryPathLen = hit.t + d1 + d2; // camera -> wallA -> wallB -> camera
          const secondaryApparentDepth = secondaryPathLen / 2;

          apparentDist = (signalPrimary * hit.t + signalSecondary * secondaryApparentDepth) / (signalPrimary + signalSecondary);
          signalTotal = signalPrimary + signalSecondary;
          if (signalSecondary > 0.15 * signalPrimary) multipath[idx] = 1;
        }

        const jitterNs = (BASE_JITTER_NS + NOISE_SCALE_NS / Math.sqrt(signalTotal + 0.0005)) * opts.jitterMultiplier;
        const trueTimeNs = (2 * apparentDist / C_LIGHT) * 1e9;
        const measuredTimeNs = Math.max(0, RNG.gaussian(opts.rng, trueTimeNs, jitterNs));
        measuredDepth[idx] = (C_LIGHT * measuredTimeNs * 1e-9) / 2;

        const dropoutChance = Math.max(0, 1 - signalTotal / DROPOUT_SIGNAL_THRESHOLD) * 0.6;
        valid[idx] = opts.rng() < dropoutChance ? 0 : 1;
        confidence[idx] = valid[idx] ? Math.max(0, Math.min(1, signalTotal / CONFIDENT_SIGNAL)) : 0;
      }
    }
    return { w: w, h: h, trueDepth: trueDepth, measuredDepth: measuredDepth, valid: valid, multipath: multipath, confidence: confidence };
  }

  window.Depth = window.Depth || {};
  window.Depth.ToF = { simulateToF };
})();
