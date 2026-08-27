# Depth Sensing: ToF vs Structured Light vs Stereo

A local, static, no-build-step web app that runs three depth-sensing
architectures — time-of-flight, structured light, and stereo vision —
against the *same* synthetic 3D scene at once, so their real tradeoffs
(range, ambient-light sensitivity, surface dependence) show up as
something you watch happen rather than read about. Alongside the 2D depth
maps, each sensor's reconstruction is also back-projected into a live,
orbitable 3D point cloud (Three.js), so the same noise/dropout/distortion
is visible as actual 3D structure, not just per-pixel color.

Open `index.html` directly in a browser. Nothing is built or uploaded —
it's plain HTML/CSS/JS and `<canvas>`, loaded as a handful of `<script>`
tags. Three.js itself is the one exception to "nothing is built": rather
than pull it from a CDN at runtime, a copy is vendored into
`js/vendor/` (fetched once, checked into the repo) so the app still opens
and runs with zero network access.

## The shared scene

One scene, one fixed camera rig, ray-cast per pixel with analytic
sphere/box/quad intersection (`js/scene.js`). Every object carries a
`surface` type — matte, reflective, or dark/absorptive — that feeds into
each sensor's math differently (see below). A "concave corner" layout is
included specifically to demonstrate ToF multipath: two angled panels
meeting at a hinge, close enough that a ray can plausibly bounce off one
panel onto the other before returning.

Controls: sensor resolution (16×16 – 64×64, kept low so the grid stays
legible), object count/layout/distance, surface type, ambient light,
texture density (stereo only), baseline (structured light + stereo), and
ToF timing jitter. A shared "acquisition progress" scrubber drives a
step-through animation across all three panels at once — each panel
reveals its own way (true-distance order for ToF, raster order for
structured light and stereo) so pressing **Step** shows the actual
per-pixel acquisition process instead of jumping straight to a finished
depth map.

## 1. Time-of-flight (`js/tof.js`)

For each pixel, ray-casts to the scene and computes round-trip distance,
converted to time-of-flight via `c = 3×10⁸ m/s`. Timing jitter is modeled
as Gaussian noise that grows as the returned signal weakens (dark
surfaces → less light back → noisier depth). The wavefront ring drawn
during step-through is illustrative — actual per-pixel reveal timing is
driven by true distance, not by the ring's radius.

**Multipath** is modeled directly on the concave-corner layout: when a
primary ray hits one panel near the hinge, a plausible second-bounce path
onto the other panel is computed, and the reported depth becomes a
signal-weighted blend of the primary and secondary path lengths — the
same mechanism (light returning from more than one path, summed by a
sensor that can't tell them apart) that corrupts real ToF depth near
concave corners.

**Simplified:** a single point emitter co-located with the sensor (real
ToF cameras have a small but nonzero baseline between emitter and
sensor); one full-frame exposure rather than per-pixel phase
measurement; multipath modeled as a two-path blend rather than a full
light-transport simulation.

## 2. Structured light (`js/structured-light.js`)

A synthetic IR dot grid is projected from a projector offset from the
camera by the configurable baseline. Each dot's *expected* position (were
it landing on a flat reference plane) is compared against its *observed*
position after landing on the actual scene geometry — the shift between
the two, plus the known projector-camera baseline and angle, triangulates
depth by inverting the projection geometry directly (closed-form, not
iterative).

**Ambient light is this sensor's real weak point**, and it's modeled as
such: brighter ambient light raises the noise floor on dot detection,
directly increasing position-detection error and dot dropout. A
confidence gate (predicted triangulation error vs. a fixed limit) rejects
dots whose position is too uncertain to trust, rather than reporting a
falsely precise number — so "valid dot" percentage visibly collapses as
ambient light rises.

**Simplified:** a sparse dot grid rather than a dense pattern or
multi-frame Gray code; one shot rather than a temporal sequence; ambient
robustness modeled as a single noise/dropout curve rather than a full
sensor SNR model.

## 3. Stereo vision (`js/stereo.js`)

Two ordinary passive cameras, offset along X by the baseline, both
rendered with the same ambient/texture-dependent shading used for the
plain reference view. Because both cameras share orientation and differ
only in X position, epipolar lines are already horizontal, so block
matching (SSD over a small window) searches directly along image rows —
real stereo rigs need calibration and rectification to reach that
starting point; this app assumes it's already done.

Best-match disparity is refined to sub-pixel precision by fitting a
parabola to the SSD cost curve around the best integer match — standard
practice in real stereo pipelines, and necessary here too: at this
sensor's deliberately low resolution, whole-pixel-only disparity
quantizes depth in steps that get large at range (a background 10+ m out
can shift under three pixels between the two cameras, so missing by a
single whole pixel is a multi-meter error that has nothing to do with the
scene and everything to do with the search granularity).

**Textureless surfaces are this sensor's real weak point**, and it's
modeled as such: a local-variance pre-filter rejects any block with too
little brightness content to match *at all* (a flat wall's SSD cost curve
can look deceptively "confident" from noise alone — checking the block's
actual content catches that directly), and a cost-contrast check rejects
matches where every candidate disparity fits about equally well. Drop the
texture-density slider to zero and stereo's valid-match rate drops to
essentially nothing, while ToF and structured light — which bring their
own light and don't care about surface texture — are unaffected.

**Simplified:** already-rectified, perfectly aligned cameras; SSD block
matching rather than a modern learned or semi-global matcher; no
sub-pixel interpolation of the images themselves (only of the resulting
disparity); accuracy naturally degrades roughly with the square of
distance (a real, textbook stereo characteristic — depth precision is
proportional to `baseline × focal_length / disparity²`) rather than being
uniform across range.

## Comparison view

The comparison table (and the `<details>` reference table beneath it)
update live as any scene variable changes, so the same one-variable
change — ambient light, surface type, distance — can be watched moving
all three depth maps and all three stat rows at once. That side-by-side
reaction, not any single number, is the actual point of the tool.

## 3D point clouds (`js/pointcloud.js`, `js/pcview.js`)

Every sensor's depth reconstruction is back-projected into a 3D point
cloud in one shared world frame — the scene's own coordinate system,
since every camera in this app sits somewhere along X, looking down +Z,
with no rotation (see `js/scene.js`). The requested pinhole formula is

```
X = (u - cx) * depth / fx
Y = (v - cy) * depth / fy
Z = depth
```

which assumes `depth` is the camera-space **Z** (perpendicular distance
to the image plane) — the convention a stereo/RGBD camera actually
reports, and exactly what `js/stereo.js`'s `depth = baseline*focal/disparity`
produces. ToF and structured light instead measure **range** (straight-
line distance along the line of sight) — the physically correct quantity
for a round-trip light pulse, and what `js/tof.js` and
`js/structured-light.js` already compute. Applying the Z-formula to a
range value unmodified would silently warp those two clouds outward
toward the frame edges, so `pointcloud.js` uses the equivalent,
range-aware form of the same formula: `Camera.pixelRay` already returns
the exact unit ray direction for every pixel — `((u-cx)/fx, (v-cy)/fy, 1)`
normalized — so

- a **range** reading `r` along unit ray `dir`: `point = origin + dir * r`
  (this already *is* the pinhole formula above, just solved directly for
  a unit direction instead of re-deriving X/Y from a separate Z)
- a **Z-depth** reading `z` along unit ray `dir`: `t = z / dir.z; point = origin + dir * t`

Both reduce to precisely the stated equations for a pixel on the optical
axis, and generalize correctly off-axis. This was verified directly
(`node` scripts constructing a known 3D point, feeding its true range or
Z through each path, and checking the reconstructed point matches to
floating-point precision) before wiring it into the browser.

**Confidence**, not a separate invented number, drives what each cloud
looks like: ToF's returned-signal strength, structured light's predicted
triangulation error, and stereo's match-cost contrast — the same
quantities each sensor's own noise/dropout model already uses — are
carried straight through as a 0..1 confidence per point. A pixel a sensor
couldn't get a reading for at all is dropped from that sensor's cloud
entirely (a real hole, not a guess); a point the sensor *did* report but
isn't sure about is kept but rendered dim, blended toward the viewport's
background color — the visual equivalent of low alpha without needing a
custom shader for genuine per-vertex transparency.

**Ground truth** is the scene's own exact geometry: `intersectScene`'s
hit point *is* the true 3D position already, no back-projection needed.
It's shown as a dim gray reference layer, toggleable per capture, in all
four viewports.

**Reading the four viewports:** drag to orbit, scroll to zoom, in each.
- **Per-sensor viewports** (ToF / Structured Light / Stereo): a "good"
  cloud hugs the gray ground-truth surface closely and densely; a
  "degraded" one is either sparse (holes = dropped low-confidence pixels)
  or visibly offset/thickened from the gray reference (present but
  wrong — e.g. ToF's cloud bulging outward right at the hinge in the
  concave-corner layout, which is multipath literally reshaping the
  reconstructed surface).
- **Overlay viewport**: all three sensors at once, each in its own color
  (matching the comparison table's column colors) plus the gray
  reference. Where the colored clouds sit on top of each other and on
  the gray surface, the sensors agree; visible splitting between colors,
  or one color thinning out while the others stay dense, is exactly the
  disagreement/failure-mode story the 2D stats already describe, now
  visible as literal 3D structure.
- **Point count / dropout rate / mean & RMS error to truth** (below each
  per-sensor viewport) are the numeric version of the same story — the
  mean/RMS figures compare each valid point against the exact truth along
  that same ray (mathematically equivalent to distance-to-the-reference-
  cloud for a reference dense enough to include that exact ray, computed
  directly rather than by nearest-neighbor search).

Any sensor's current cloud can be exported as `.ply` or `.xyz` (points
only; `.ply` also carries confidence baked in as grayscale vertex color)
for inspection in MeshLab, CloudCompare, or similar.

## Tradeoffs at a glance

| | Time-of-Flight | Structured Light | Stereo |
|---|---|---|---|
| Typical range | 0.5 – 10 m+ | 0.2 – 2 m | 0.3 m – 50 m+ |
| Accuracy at range | Good, roughly flat with distance | Very good up close, degrades fast beyond ~1–2 m | Degrades with distance² (baseline-limited) |
| Bright sunlight | Robust (fast, gated return pulse) | Fails (IR pattern washed out) | Fine — passive, needs ambient light anyway |
| Dark / absorptive surfaces | Degrades (weak return signal) | Degrades (weak return signal) | Degrades (needs contrast, not brightness) |
| Textureless surfaces | Unaffected (active, geometric) | Unaffected (active, geometric) | Fails (no feature to match) |
| Relative power draw | Medium (pulsed emitter) | Medium (continuous pattern projector) | Low (no emitter at all) |
| Relative compute cost | Low (direct per-pixel calc) | Medium (triangulation + detection) | High (search per pixel) |
| Classic use case | Automotive LiDAR-adjacent sensing, robotics | Face ID, close-range hand/face tracking | Outdoor / long-range robotics, autonomous vehicles |

## Files

```
index.html              controls, layout, canvases
style.css                dark technical UI
js/vendor/three.min.js       Three.js r128 (vendored, not CDN-loaded)
js/vendor/OrbitControls.js   Three.js's orbit/zoom camera controls
js/vec3.js               vector math
js/rng.js                seeded PRNG + Gaussian sampling (reproducible noise)
js/scene.js              primitives, ray intersection, scene construction
js/camera.js             perspective camera, ray generation, projection
js/render.js             ambient/texture shading for the passive views
js/tof.js                time-of-flight simulation
js/structured-light.js   structured-light simulation
js/stereo.js             stereo vision simulation
js/depthview.js          2D canvas drawing shared by all three panels
js/pointcloud.js         depth-map -> 3D point cloud back-projection, accuracy stats, .ply/.xyz export
js/pcview.js             one reusable Three.js viewport (scene/camera/renderer/orbit controls)
js/main.js               wiring: controls -> capture -> 2D render + 3D point clouds
```
