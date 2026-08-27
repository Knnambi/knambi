/*
 * pcview.js — one reusable Three.js viewport: a scene, camera, renderer,
 * and orbit controls, holding one or more named point-cloud "layers"
 * (e.g. a sensor's own points plus an optional ground-truth overlay, or
 * — in the combined viewport — all three sensors at once).
 *
 * Camera framing is only ever set automatically once, right after a
 * viewport's first points arrive. Every later update (a slider moved,
 * a new capture with the same layout) only swaps point geometry/color —
 * it never touches the camera — so a user's orbit/zoom survives exactly
 * the live parameter changes this tool exists to make watchable.
 *
 * Confidence is shown by blending each point's color toward the
 * viewport's background: a low-confidence point visually recedes into
 * the background exactly like a lowered alpha would, without needing a
 * custom shader for genuine per-vertex transparency.
 */
(function () {
  "use strict";

  const BG_COLOR = [0x11 / 255, 0x15 / 255, 0x1c / 255]; // matches --bg

  function lerp(a, b, t) { return a + (b - a) * t; }

  // depth (or any 0..1-normalized scalar) -> [r,g,b] 0..1, warm-near/cool-far
  const NEAR = [240 / 255, 176 / 255, 82 / 255];
  const FAR = [32 / 255, 54 / 255, 110 / 255];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    return [lerp(NEAR[0], FAR[0], t), lerp(NEAR[1], FAR[1], t), lerp(NEAR[2], FAR[2], t)];
  }
  // confidence 0..1 -> red (bad) .. green (good), matching --bad/--good
  const BAD = [0xe2 / 255, 0x68 / 255, 0x5a / 255];
  const GOOD = [0x55 / 255, 0xc1 / 255, 0x7b / 255];
  function confidenceColor(c) {
    c = Math.max(0, Math.min(1, c));
    return [lerp(BAD[0], GOOD[0], c), lerp(BAD[1], GOOD[1], c), lerp(BAD[2], GOOD[2], c)];
  }

  function createViewport(canvas) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(new THREE.Color(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]), 1);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // A faint grid on the "ground" (the scene's XZ-ish plane isn't
    // physically meaningful here, but a fixed reference grid gives the
    // eye a stable frame to judge orbit/zoom by across all 4 viewports).
    const grid = new THREE.GridHelper(20, 20, 0x2a3341, 0x1d2531);
    grid.position.set(0, -2, 5);
    scene.add(grid);

    const layers = new Map(); // name -> THREE.Points
    let framed = false;

    function resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }

    function colorFor(point, mode, tint) {
      const base = tint || (mode === "confidence" ? confidenceColor(point.c) : rampColor(Math.min(1, point.range / 14)));
      // Blend toward background by (1 - confidence) — see file header.
      const k = 0.25 + 0.75 * Math.max(0, Math.min(1, point.c));
      return [lerp(BG_COLOR[0], base[0], k), lerp(BG_COLOR[1], base[1], k), lerp(BG_COLOR[2], base[2], k)];
    }

    function setLayer(name, points, opts) {
      opts = opts || {};
      let obj = layers.get(name);
      if (obj) { scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
      if (!points || points.length === 0) { layers.delete(name); return; }

      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const col = colorFor(p, opts.colorMode, opts.tint);
        colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: opts.size || 0.06, vertexColors: true, sizeAttenuation: true,
        transparent: true, opacity: opts.opacity != null ? opts.opacity : 1,
      });
      obj = new THREE.Points(geom, mat);
      layers.set(name, obj);
      scene.add(obj);

      if (!framed && name === opts.frameOn) {
        frameOn(points);
        framed = true;
      }
    }

    function frameOn(points) {
      if (!points.length) return;
      let cx = 0, cy = 0, cz = 0;
      for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
      cx /= points.length; cy /= points.length; cz /= points.length;
      let radius = 1;
      for (const p of points) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy, p.z - cz));
      controls.target.set(cx, cy, cz);
      camera.position.set(cx + radius * 0.9, cy + radius * 0.7, cz - radius * 1.6);
      camera.lookAt(cx, cy, cz);
      controls.update();
    }

    function render() {
      resize();
      controls.update();
      renderer.render(scene, camera);
    }

    return { setLayer, render, controls, camera, resize };
  }

  window.Depth = window.Depth || {};
  window.Depth.PCView = { createViewport, rampColor, confidenceColor };
})();
