# Depth Sensing: ToF vs Structured Light vs Stereo

A local, static, no-build-step web app that runs three depth-sensing
architectures — time-of-flight, structured light, and stereo vision —
against the *same* synthetic 3D scene at once, so their real tradeoffs
(range, ambient-light sensitivity, surface dependence) show up as
something you watch happen rather than read about.

Open `index.html` directly in a browser. Nothing is built, bundled, or
uploaded — it's plain HTML/CSS/JS and `<canvas>`, loaded as a handful of
`<script>` tags.

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
js/vec3.js               vector math
js/rng.js                seeded PRNG + Gaussian sampling (reproducible noise)
js/scene.js              primitives, ray intersection, scene construction
js/camera.js             perspective camera, ray generation, projection
js/render.js             ambient/texture shading for the passive views
js/tof.js                time-of-flight simulation
js/structured-light.js   structured-light simulation
js/stereo.js             stereo vision simulation
js/depthview.js          canvas drawing shared by all three panels
js/main.js               wiring: controls -> capture -> render loop
```
