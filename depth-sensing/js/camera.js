/*
 * camera.js — turns a pixel coordinate into a ray, for any camera (or
 * projector — same math) positioned somewhere along X and looking down
 * +Z. Every sensor module uses this: the main camera, the stereo pair
 * (offset +-baseline/2 along X), and the structured-light projector
 * (offset by baseline along X).
 */
(function () {
  "use strict";

  const V = window.Depth.Vec3;

  function makeCamera(position, fovRadians, width, height) {
    return { position: position, fov: fovRadians, width: width, height: height };
  }

  // Ray for pixel (px, py), px in [0,width), py in [0,height), py=0 at top.
  function pixelRay(cam, px, py) {
    const aspect = cam.width / cam.height;
    const scale = Math.tan(cam.fov / 2);
    const ndcX = (2 * (px + 0.5) / cam.width - 1) * aspect * scale;
    const ndcY = (1 - 2 * (py + 0.5) / cam.height) * scale;
    const dir = V.normalize([ndcX, ndcY, 1]);
    return { origin: cam.position, dir: dir };
  }

  // Inverse of pixelRay: given a 3D point, where does it land in this
  // camera's pixel space? Used by structured-light.js to reproject a
  // dot's true 3D landing point back into the observing camera's image.
  // Returns null if the point is behind the camera.
  function projectToPixel(cam, point) {
    const rel = V.sub(point, cam.position);
    if (rel[2] <= 1e-6) return null;
    const aspect = cam.width / cam.height;
    const scale = Math.tan(cam.fov / 2);
    const ndcX = rel[0] / rel[2] / (aspect * scale);
    const ndcY = rel[1] / rel[2] / scale;
    const px = ((ndcX + 1) / 2) * cam.width - 0.5;
    const py = ((1 - ndcY) / 2) * cam.height - 0.5;
    return [px, py];
  }

  window.Depth = window.Depth || {};
  window.Depth.Camera = { makeCamera, pixelRay, projectToPixel };
})();
