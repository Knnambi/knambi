/*
 * bodyview.js — one Three.js viewport holding one or more labeled rigid
 * bodies, each a small procedural "robot" (chassis + sensor head + eyes
 * + antenna + wheels, built from primitives — no external model file,
 * keeping this app buildable with zero network access) plus an X/Y/Z
 * axis gizmo drawn in its current orientation. quat.js's [x,y,z,w]
 * layout matches THREE.Quaternion's exactly, so orientations are
 * assigned directly with no conversion. The robot's head/eyes face
 * local +X, the same "forward" convention motion.js uses, so which way
 * the body is facing is visually obvious even before reading the axes.
 *
 * Used two ways in this app: as the single "ground truth" viewport,
 * where the one body actually translates through space and leaves a
 * fading path trail (with the camera horizontally follow-tracking it —
 * see setFollowTarget — so it doesn't drive itself out of frame); and
 * as the "orientation comparison" viewport, where several bodies sit at
 * fixed positions side by side so only their rotation differs — see
 * main.js.
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
    const grid = new THREE.GridHelper(opts.gridSize || 10, opts.gridSize || 10, 0x2a3341, 0x1d2531);
    scene.add(grid);

    const bodies = new Map(); // name -> { group }
    let trail = null;
    let followName = null, lastFollowXZ = null;

    function axisLine(dir, color, length) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(dir[0] * length, dir[1] * length, dir[2] * length),
      ]);
      return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    }

    // A small procedural robot, forward = local +X (matches motion.js's
    // convention): a chassis, a front-mounted sensor head with two
    // emissive "eyes" facing forward, a rear antenna, and four wheels.
    function buildRobot(color) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: color || 0x6b7688, roughness: 0.7 });
      const accentMat = new THREE.MeshStandardMaterial({ color: 0x2a3341, roughness: 0.6 });
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x6fd4e0, emissive: 0x1a4a52, roughness: 0.4 });

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), bodyMat);
      group.add(chassis);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.16), bodyMat);
      head.position.set(0.18, 0.1, 0);
      group.add(head);

      const eyeGeom = new THREE.SphereGeometry(0.018, 8, 8);
      const eyeL = new THREE.Mesh(eyeGeom, eyeMat); eyeL.position.set(0.25, 0.1, 0.05);
      const eyeR = new THREE.Mesh(eyeGeom, eyeMat); eyeR.position.set(0.25, 0.1, -0.05);
      group.add(eyeL, eyeR);

      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), accentMat);
      antenna.position.set(-0.05, 0.18, 0);
      group.add(antenna);
      const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
      antennaTip.position.set(-0.05, 0.25, 0);
      group.add(antennaTip);

      const wheelGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14);
      for (const p of [[0.12, -0.08, 0.13], [0.12, -0.08, -0.13], [-0.12, -0.08, 0.13], [-0.12, -0.08, -0.13]]) {
        const wheel = new THREE.Mesh(wheelGeom, accentMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(p[0], p[1], p[2]);
        group.add(wheel);
      }
      return group;
    }

    function ensureBody(name, color) {
      if (bodies.has(name)) return bodies.get(name);
      const group = new THREE.Group();
      group.add(buildRobot(color));
      group.add(axisLine([1, 0, 0], 0xe2685a, 0.4));
      group.add(axisLine([0, 1, 0], 0x55c17b, 0.4));
      group.add(axisLine([0, 0, 1], 0x6fa3ec, 0.4));
      scene.add(group);
      const entry = { group };
      bodies.set(name, entry);
      return entry;
    }

    // Horizontal-only chase camera: keeps a named body centered in X/Z
    // as it moves, without also following vertical motion — so falling
    // (or any other real vertical displacement) still reads as motion
    // relative to a fixed ground plane instead of the body appearing to
    // hover in place forever.
    function setFollowTarget(name) { followName = name; lastFollowXZ = null; }

    // bodies: { name: { position:[x,y,z], quat:[x,y,z,w], color } }
    function setBodies(bodySpecs) {
      for (const name in bodySpecs) {
        const spec = bodySpecs[name];
        const entry = ensureBody(name, spec.color);
        entry.group.position.set(spec.position[0], spec.position[1], spec.position[2]);
        entry.group.quaternion.set(spec.quat[0], spec.quat[1], spec.quat[2], spec.quat[3]);
      }
      if (followName && bodySpecs[followName]) {
        const p = bodySpecs[followName].position;
        if (lastFollowXZ) {
          const dx = p[0] - lastFollowXZ[0], dz = p[2] - lastFollowXZ[1];
          controls.target.x += dx; controls.target.z += dz;
          camera.position.x += dx; camera.position.z += dz;
          grid.position.x += dx; grid.position.z += dz;
        } else {
          controls.target.x = p[0]; controls.target.z = p[2];
        }
        lastFollowXZ = [p[0], p[2]];
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

    return { setBodies, setTrail, setFollowTarget, render, controls, camera };
  }

  window.BodyView = { createViewport };
})();
