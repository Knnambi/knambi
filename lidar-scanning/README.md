# LiDAR Scanning: Mechanical vs Solid-State vs Hybrid vs 2D

A local, static, no-build-step web app that runs four scanning-LiDAR
architectures — mechanical, solid-state, hybrid solid-state, and 2D —
against the *same* synthetic 360-degree environment at once, so their
real coverage/density/motion-artifact tradeoffs show up as actual scan
patterns you can orbit around, not a spec sheet.

Open `index.html` directly in a browser. Nothing is built or uploaded —
plain HTML/CSS/JS, `<canvas>`, and a vendored copy of Three.js
(`js/vendor/`, fetched once and checked in rather than CDN-loaded, so the
app runs with zero network access).

## The shared environment (`js/scene.js`)

A sensor sits at the world origin. A ring of boxes and cylinders is
placed around it at varying radii and azimuths (not just in front — a
360-degree environment, unlike a forward-looking camera scene), plus an
infinite ground plane below. One additional box pivots back and forth
along a straight line directly in front of the sensor — the "moving test
object" every architecture is asked to scan identically.

Everything is a pure function of **scene time** `t`, in seconds: the
moving object's position is `basePos + velocity(t)`, and each sensor
independently asks "where was the scene at the *exact instant* I fired
this particular ray?" — which is the whole mechanism behind the motion
distortion described below, not a separate effect bolted on afterward.

**Simplified:** no per-surface reflectivity/material model this time
(that was the previous depth-sensing app's focus) — every object returns
a hit identically regardless of angle or distance beyond the shared max
range. Coloring is by distance or by channel, not by any simulated
return-signal strength.

## Timing: the one idea that drives everything

Every scan is computed as: given the *current* scene time, which rays in
this architecture's fixed schedule have already fired, and what did each
one see **at its own capture instant** (not "now")? A rotating sensor's
early rays and late rays in the same revolution sample the moving object
at genuinely different times — the schedule is precomputed once, then
"revealed" up to the current time, exactly like the depth-sensing app's
step-through reveal, generalized to real physical time instead of an
abstract 0–1 progress bar.

## 1. Mechanical scanning LiDAR (`js/mechanical.js`)

A vertical stack of fixed-elevation channels (16/32/64-line, configurable
vertical FOV), all firing together at each azimuth step as the head spins
a full 360 degrees at a configurable RPM. One revolution's full ray
schedule (every step's azimuth *and* exact capture time) is precomputed;
the point cloud builds up progressively as scene time advances through
that revolution, then a new revolution starts fresh — matching how a real
spinning LiDAR outputs one complete frame per rotation, not an
ever-growing accumulation.

Because different azimuth steps within one revolution really do fire at
different instants, a moving object gets caught at a different position
by each step that crosses it — verified directly (a fast-moving, sparse
test scene where the ring of hits from one revolution spans several
meters in X, far wider than the 1.2 m box that produced them) before
this was ever rendered. Turn ambient orbit + "Color by Channel" on to see
it directly: each elevation channel is a differently-colored ring, and
the moving object's hits fan out into a visible smear rather than sitting
in one place.

**Simplified:** channels fire simultaneously at each azimuth step (real
multi-line LiDARs fire each channel at a very slightly different instant
too — a second-order effect this app doesn't model); no return-intensity
falloff or dropout.

## 2. Solid-state LiDAR (`js/solidstate.js`)

A fixed electronically-steered raster within a limited forward field of
view (60–120° horizontal, configurable, plus a rotatable "which way is
forward" azimuth control so you can see the same fixed cone pointed at
different parts of the ring). Every ray in a frame samples the scene at
the *same* instant — there's no mirror, so there's nothing to smear.
Rotate the FOV control and watch objects that were visible vanish
entirely and previously-empty gaps fill in: outside the cone isn't noisy
or degraded data, it's just never sampled at all.

**Simplified:** "refresh rate" is a fixed configured number rather than
derived from real readout electronics timing; no partial-frame rolling
readout within the raster (real flash/OPA solid-state units are close to
this already, but not perfectly instantaneous).

## 3. Hybrid solid-state LiDAR (`js/hybrid.js`)

A mirror that oscillates back and forth (not a continuous rotation, since
its arc is under 360°) across a wide but limited horizontal arc
(120–270°, configurable), firing a small electronically-steered raster
"cluster" at each stopping point instead of one ray per channel. That's
the actual mechanism behind "wider than solid-state, denser/more
structured than pure mechanical": more angular coverage than a fixed
array, and a real elevation raster at every sweep position instead of one
ray per fixed channel. It still has a moving mirror, so it still smears a
moving object — just bounded to one sweep's capture window (half an
oscillation period) instead of a full 360-degree revolution, which is
visibly less severe at the same object speed.

**Simplified:** the oscillation is a plain triangle wave (constant
angular velocity, instant reversal at each end) rather than a real
galvo/MEMS mirror's actual velocity profile.

## 4. 2D LiDAR (`js/planar2d.js`)

Exactly mechanical scanning's revolution-and-reveal timing, but with a
single fixed-elevation channel (0 degrees) instead of a vertical stack —
deliberately sharing the sweep model rather than a hand-tuned "flatter"
one, since the point is showing what's *lost* by dropping to one plane,
not a different kind of sensor. Every hit lands at the same height; two
objects of very different heights at the same position and distance are
indistinguishable.

## Comparison view + shared scene time

All four viewports share one **scene time** control (a scrubber, plus
Play/Pause with an adjustable — and by default heavily slowed-down —
playback speed, since a real mechanical sweep at 600 RPM completes in a
tenth of a second). Scrub or play it and watch the four build-up patterns
directly: solid-state's cone fills in instantly and stays fixed; the
other three visibly sweep, at different rates and to different extents.
Orbit/zoom (drag / scroll) is independent per viewport and preserved
across every live control change — only the very first points a viewport
receives set its camera framing.

## Stats panel

Per architecture: field of view (H×V), refresh rate, points captured so
far vs. the full scan's total, whether it has moving parts, and a
motion-distortion estimate. That last one isn't a fixed label — it's
`moving object speed × this architecture's own capture window` (one full
revolution for mechanical/2D, one half-oscillation for hybrid, and a
fixed "None — simultaneous" for solid-state, which has no sweep window at
all), bucketed into None/Slight/Moderate/Severe. Same underlying number
that produces the visible smear above, not a separate qualitative guess.

## Tradeoffs at a glance

| | Mechanical | Solid-State | Hybrid Solid-State | 2D |
|---|---|---|---|---|
| Field of view | 360° × ~20–30° | Up to ~120° × ~25°, fixed direction | Up to 270° × ~20°, oscillating | 360° × single plane |
| Typical range | Long (automotive-grade, 100m+ real-world) | Short–medium (forward-looking) | Medium–long | Short (indoor/low-speed robotics) |
| Refresh rate | Moderate (RPM-limited) | Fast (electronic, no moving parts) | Moderate (oscillation-limited) | Fast (light rotating mass) |
| Moving parts | Yes — full spinning head | No | Yes — oscillating mirror only | Yes — light spinning head |
| Motion distortion | Visible, full-revolution window | None — simultaneous capture | Visible but bounded to one sweep | Visible, full-revolution window |
| Relative cost / durability | High cost, more to wear out | Low cost, most durable (solid-state) | Medium — one small moving part | Low cost, simple mechanism |
| Typical vehicle placement | Roof-mounted, full 360° surround | Corners / bumpers, forward-looking | Roof or corner, wide-but-not-360° middle ground | Low-cost robots (vacuum, delivery bot), short-range obstacle detection |

## Files

```
index.html               controls, layout, canvases
style.css                 dark technical UI
js/vendor/three.min.js       Three.js r128 (vendored, not CDN-loaded)
js/vendor/OrbitControls.js   Three.js's orbit/zoom camera controls
js/vec3.js                vector math
js/rng.js                 seeded PRNG (reproducible scene layout)
js/scene.js               primitives (box/cylinder/ground), ray intersection, 360° environment + moving object
js/mechanical.js          spinning multi-channel LiDAR
js/solidstate.js          fixed-FOV electronically-steered array
js/hybrid.js              oscillating mirror + micro-raster clusters
js/planar2d.js            single-plane 360° scanning LiDAR
js/lidarview.js           one reusable Three.js viewport (scene/camera/renderer/orbit controls)
js/main.js                wiring: controls -> scene + four scans -> shared scene-time playback
```

A note on performance: at maximum detail settings (64 channels, finest
angular resolution, 20 objects) one mechanical scan recomputation takes
roughly 80ms — fine for scrubbing, but Play may visibly stutter at that
combination since all four sensors recompute every animation frame.
Default settings recompute in well under 10ms.
