/*
 * lidarview.js — one reusable Three.js viewport: scene, camera,
 * renderer, and orbit controls, holding one point-cloud layer. Camera
 * framing happens once, the first time a viewport receives points, so a
 * user's orbit/zoom survives every later live update.
 */
(function () {
  "use strict";

  const BG_COLOR = [0x11 / 255, 0x15 / 255, 0x1c / 255];
  function lerp(a, b, t) { return a + (b - a) * t; }

  const NEAR = [240 / 255, 176 / 255, 82 / 255], FAR = [32 / 255, 54 / 255, 110 / 255];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    return [lerp(NEAR[0], FAR[0], t), lerp(NEAR[1], FAR[1], t), lerp(NEAR[2], FAR[2], t)];
  }
  // Categorical hue cycle for "color by channel" — deliberately stops
  // short of 360 so the last channel doesn't wrap back to the first
  // channel's color.
  function channelColor(channel, totalChannels) {
    const hue = totalChannels > 1 ? (channel / (totalChannels - 1)) * 300 : 40;
    const c = new THREE.Color();
    c.setHSL(hue / 360, 0.65, 0.6);
    return [c.r, c.g, c.b];
  }

  function createViewport(canvas) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(new THREE.Color(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]), 1);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    camera.position.set(14, 12, 14);
    controls.update();

    const grid = new THREE.GridHelper(40, 20, 0x2a3341, 0x1d2531);
    scene.add(grid);
    // A small marker at the sensor's own position — every viewport
    // shares this one fixed point, unlike the scene content around it.
    const sensorDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xe0a23e })
    );
    scene.add(sensorDot);

    let cloudObj = null;
    let framed = false;

    function resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }

    function colorFor(p, mode, totalChannels) {
      return mode === "channel" ? channelColor(p.channel, totalChannels) : rampColor(Math.min(1, p.range / 20));
    }

    function setPoints(points, opts) {
      opts = opts || {};
      if (cloudObj) { scene.remove(cloudObj); cloudObj.geometry.dispose(); cloudObj.material.dispose(); cloudObj = null; }
      if (!points || points.length === 0) return;

      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      const totalChannels = opts.totalChannels || 1;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const col = colorFor(p, opts.colorMode, totalChannels);
        colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({ size: opts.size || 0.05, vertexColors: true, sizeAttenuation: true });
      cloudObj = new THREE.Points(geom, mat);
      scene.add(cloudObj);

      if (!framed) {
        controls.target.set(0, 0, 0);
        camera.position.set(16, 13, 16);
        camera.lookAt(0, 0, 0);
        controls.update();
        framed = true;
      }
    }

    function render() {
      resize();
      controls.update();
      renderer.render(scene, camera);
    }

    return { setPoints, render, controls, camera };
  }

  window.Ultra = window.Ultra || {};
  window.Ultra.PointView = { createViewport, rampColor, channelColor };
})();
