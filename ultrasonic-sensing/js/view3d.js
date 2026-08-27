/*
 * view3d.js — Three.js viewport(s) for the ultrasonic app.
 *
 * Two different things get drawn here, for a reason: ultrasonic itself
 * produces no spatial output at all (one number per ping), so its
 * viewports render the scene's REAL geometry directly (actual boxes,
 * cylinders, the test panel) rather than a derived point cloud — there
 * is no sensor-derived point cloud to show. The one comparison viewport
 * that DOES draw a point cloud (reusing mechanical.js) exists precisely
 * to make that contrast — dense spatial detail vs. one scalar — visible
 * side by side.
 */
(function () {
  "use strict";

  const BG_COLOR = [0x11 / 255, 0x15 / 255, 0x1c / 255];
  const HARD_COLOR = 0x6b7688, SOFT_COLOR = 0xc98a4b, PANEL_COLOR = 0x8b97a7, MOVING_COLOR = 0xe0a23e;
  const PHASE_COLOR = {
    "in-flight": 0x6fd4e0,
    "echo-returned": 0x55c17b,
    "no-echo": 0x5a6472,
    "too-close": 0xe2685a,
  };

  function createViewport(canvas) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(new THREE.Color(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]), 1);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    camera.position.set(9, 8, 9);
    controls.update();

    scene.add(new THREE.GridHelper(30, 20, 0x2a3341, 0x1d2531));
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(4, 8, 3);
    scene.add(key);

    let envGroup = new THREE.Group();
    scene.add(envGroup);
    let sensorMarkers = new THREE.Group();
    scene.add(sensorMarkers);
    let conesGroup = new THREE.Group();
    scene.add(conesGroup);

    function resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }

    function disposeGroup(group) {
      for (const child of group.children.slice()) {
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    // Rebuilds the STATIC part of the environment (ring objects, ground,
    // panel) — call only when scene config changes, not every frame.
    function setEnvironment(sceneObj) {
      disposeGroup(envGroup);
      const groundGeom = new THREE.PlaneGeometry(60, 60);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a212c, side: THREE.DoubleSide });
      const groundMesh = new THREE.Mesh(groundGeom, groundMat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = sceneObj.groundY;
      envGroup.add(groundMesh);

      for (const prim of sceneObj.staticPrimitives) {
        const color = prim.surface === "soft" ? SOFT_COLOR : HARD_COLOR;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
        let mesh;
        if (prim.type === "box") {
          const size = [prim.max[0] - prim.min[0], prim.max[1] - prim.min[1], prim.max[2] - prim.min[2]];
          mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
          mesh.position.set((prim.min[0] + prim.max[0]) / 2, (prim.min[1] + prim.max[1]) / 2, (prim.min[2] + prim.max[2]) / 2);
        } else {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.height, 20), mat);
          mesh.position.set(prim.center[0], prim.center[1] + prim.height / 2, prim.center[2]);
        }
        envGroup.add(mesh);
      }

      const panel = sceneObj.panel;
      const panelMat = new THREE.MeshStandardMaterial({
        color: panel.surface === "soft" ? SOFT_COLOR : PANEL_COLOR, side: THREE.DoubleSide, roughness: 0.7,
      });
      const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(panel.width, panel.height), panelMat);
      panelMesh.position.set(panel.center[0], panel.center[1], panel.center[2]);
      panelMesh.rotation.y = -panel.yawDeg * Math.PI / 180;
      envGroup.add(panelMesh);
    }

    let movingMesh = null;
    function setMovingObject(box) {
      if (!box) {
        if (movingMesh) { envGroup.remove(movingMesh); movingMesh.geometry.dispose(); movingMesh.material.dispose(); movingMesh = null; }
        return;
      }
      const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
      const center = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
      if (!movingMesh) {
        movingMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: MOVING_COLOR }));
        envGroup.add(movingMesh);
      }
      movingMesh.scale.set(size[0], size[1], size[2]);
      movingMesh.position.set(center[0], center[1], center[2]);
    }

    function setSensorMarkers(sensors) {
      disposeGroup(sensorMarkers);
      for (const s of sensors) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshBasicMaterial({ color: 0xe0a23e }));
        dot.position.set(s.position[0], s.position[1], s.position[2]);
        sensorMarkers.add(dot);
      }
    }

    // Redraws every sensor's cone + hit marker fresh each frame (cheap:
    // a handful of sensors, low-poly cones) — see file header for why
    // the inbound leg is a marker, not a shrinking wavefront.
    function setCones(sensors, visualStates) {
      disposeGroup(conesGroup);
      for (let i = 0; i < sensors.length; i++) {
        const s = sensors[i], vs = visualStates[i];
        if (vs.coneLength <= 0.01) continue;
        const halfBeamRad = (s.beamAngleDeg / 2) * Math.PI / 180;
        const radius = vs.coneLength * Math.tan(halfBeamRad);
        const geom = new THREE.ConeGeometry(radius, vs.coneLength, 24, 1, true);
        geom.translate(0, -vs.coneLength / 2, 0); // apex to local origin
        const color = PHASE_COLOR[vs.phase] || 0xffffff;
        const opacity = vs.phase === "no-echo" ? 0.12 : 0.28;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(s.position[0], s.position[1], s.position[2]);
        // Cone's local +Y is its axis; rotate it to point along the
        // sensor's (azimuth, elevation) direction.
        const dir = new THREE.Vector3(
          Math.sin(s.azimuth * Math.PI / 180) * Math.cos(s.elevation * Math.PI / 180),
          Math.sin(s.elevation * Math.PI / 180),
          Math.cos(s.azimuth * Math.PI / 180) * Math.cos(s.elevation * Math.PI / 180)
        );
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        conesGroup.add(mesh);
      }
    }

    function setHitMarkers(points) {
      for (const p of points) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshBasicMaterial({ color: PHASE_COLOR["echo-returned"] }));
        dot.position.set(p[0], p[1], p[2]);
        conesGroup.add(dot);
      }
    }

    function render() {
      resize();
      controls.update();
      renderer.render(scene, camera);
    }

    return { setEnvironment, setMovingObject, setSensorMarkers, setCones, setHitMarkers, render, controls, camera };
  }

  window.Ultra = window.Ultra || {};
  window.Ultra.View3D = { createViewport };
})();
