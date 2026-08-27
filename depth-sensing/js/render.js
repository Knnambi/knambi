/*
 * render.js — turns a ray-scene hit into a *visible-light brightness*
 * value (0..1). This is only used by things that see with ambient/room
 * light, the way a passive camera does: the stereo pair and the plain
 * "what a camera sees" reference view.
 *
 * ToF and structured light are ACTIVE sensors — they bring their own IR
 * illumination — so this shading model (and its ambient/texture
 * controls) deliberately has no effect on tof.js or structured-light.js.
 * That asymmetry is one of the real, teachable differences between
 * active and passive depth sensing, so it's a design choice, not an
 * oversight.
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;
  const ALBEDO = window.Depth.Scene.ALBEDO;

  // A fixed key light, roughly over the camera's shoulder — direction
  // points FROM a surface point TOWARD the light.
  const LIGHT_DIR = V.normalize([-0.35, 0.55, -0.55]);

  // A smooth, position-based pseudo-random value in [-1,1]. Built from
  // the 3D hit point (not screen space), so the same physical spot on a
  // surface gets the same texture value from both stereo cameras —
  // essential, since block matching only works if the two views actually
  // agree on where the texture is.
  // Frequency is a deliberate compromise: fine enough to give nearby
  // surfaces real texture for block matching, coarse enough that it
  // doesn't alias (repeat faster than ~1 cycle per few pixels) on the
  // distant background, where each pixel covers much more world space.
  function texturePattern(point) {
    return Math.sin(point[0] * 2.2) * Math.sin(point[1] * 2.5) * Math.sin(point[2] * 1.9 + 1.3);
  }

  /**
   * @param hit             a Scene.intersectScene() result
   * @param viewOrigin      the observing camera's position (for specular)
   * @param opts            { ambient: 0..1, textureDensity: 0..1 }
   * @returns brightness 0..1
   */
  function shade(hit, viewOrigin, opts) {
    const surface = hit.primitive.surface;
    const albedo = ALBEDO[surface];
    const lambert = Math.max(0, V.dot(hit.normal, LIGHT_DIR));

    if (surface === "reflective") {
      // Mostly dark except for a small mirror-like glint — the same
      // property that makes mirrors hard for both stereo and ToF.
      const reflectDir = V.sub(V.scale(hit.normal, 2 * V.dot(hit.normal, LIGHT_DIR)), LIGHT_DIR);
      const viewDir = V.normalize(V.sub(viewOrigin, hit.point));
      const spec = Math.pow(Math.max(0, V.dot(reflectDir, viewDir)), 40);
      return Math.min(1, opts.ambient * albedo * 0.15 + spec * 0.95);
    }

    let base = opts.ambient * albedo * 0.6 + lambert * albedo * 0.6;
    if (surface === "matte") {
      const pattern = texturePattern(hit.point);
      base *= 1 + opts.textureDensity * 0.55 * pattern;
    }
    return Math.max(0, Math.min(1, base));
  }

  // Renders one camera view as a brightness grid (Float32Array, w*h).
  function renderView(cam, primitives, opts) {
    const Camera = window.Depth.Camera;
    const Scene = window.Depth.Scene;
    const out = new Float32Array(cam.width * cam.height);
    for (let y = 0; y < cam.height; y++) {
      for (let x = 0; x < cam.width; x++) {
        const ray = Camera.pixelRay(cam, x, y);
        const hit = Scene.intersectScene(ray.origin, ray.dir, primitives);
        out[y * cam.width + x] = hit ? shade(hit, cam.position, opts) : 0.02;
      }
    }
    return out;
  }

  window.Depth = window.Depth || {};
  window.Depth.Render = { shade, renderView, texturePattern, LIGHT_DIR };
})();
