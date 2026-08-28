/*
 * bodyview.js — one Three.js viewport holding one or more labeled rigid
 * bodies, each a small elongated box (so its orientation is visually
 * unambiguous, unlike a cube) with an X/Y/Z axis gizmo drawn in its
 * current orientation — quat.js's [x,y,z,w] layout matches
 * THREE.Quaternion's exactly, so orientations are assigned directly
 * with no conversion.
 *
 * Used two ways in this app: as the single "ground truth" viewport,
 * where the one body actually translates through space and leaves a
 * fading path trail; and as the "orientation comparison" viewport,
 * where several bodies sit at fixed positions side by side so only
 * their rotation differs — see main.js.
 */
(function () {
  "use strict";

  function createViewport(canvas, opts) {
    opts = opts || {};
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(new THREE.Color(0x11 / 255, 0x15 / 255, 0x1c / 255), 1);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const camDist = opts.cameraDistance || 4;
    camera.position.set(camDist * 0.7, camDist * 0.55, camDist);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(3, 5, 2);
    scene.add(key);
    scene.add(new THREE.GridHelper(opts.gridSize || 10, opts.gridSize || 10, 0x2a3341, 0x1d2531));

    const bodies = new Map(); // name -> { group }
    let trail = null, trailPoints = [];

    function axisLine(dir, color, length) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(dir[0] * length, dir[1] * length, dir[2] * length),
      ]);
      return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    }

    function ensureBody(name, color) {
      if (bodies.has(name)) return bodies.get(name);
      const group = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 0.25),
        new THREE.MeshStandardMaterial({ color: color || 0x6b7688, roughness: 0.7 })
      );
      group.add(box);
      group.add(axisLine([1, 0, 0], 0xe2685a, 0.4));
      group.add(axisLine([0, 1, 0], 0x55c17b, 0.4));
      group.add(axisLine([0, 0, 1], 0x6fa3ec, 0.4));
      scene.add(group);
      const entry = { group };
      bodies.set(name, entry);
      return entry;
    }

    // bodies: { name: { position:[x,y,z], quat:[x,y,z,w], color } }
    function setBodies(bodySpecs) {
      for (const name in bodySpecs) {
        const spec = bodySpecs[name];
        const entry = ensureBody(name, spec.color);
        entry.group.position.set(spec.position[0], spec.position[1], spec.position[2]);
        entry.group.quaternion.set(spec.quat[0], spec.quat[1], spec.quat[2], spec.quat[3]);
      }
    }

    function setTrail(points) {
      if (trail) { scene.remove(trail); trail.geometry.dispose(); trail.material.dispose(); trail = null; }
      if (!points || points.length < 2) return;
      const geom = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      trail = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xe0a23e, transparent: true, opacity: 0.6 }));
      scene.add(trail);
    }

    function resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }
    function render() { resize(); controls.update(); renderer.render(scene, camera); }

    return { setBodies, setTrail, render, controls, camera };
  }

  window.BodyView = { createViewport };
})();
