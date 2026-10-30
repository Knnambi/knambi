# Ultrasonic Sensing: Wide-Beam Range vs. LiDAR Point Cloud

A local, static, no-build-step web app simulating a wide-beam ultrasonic
(sonar-style) range sensor against the same kind of 360-degree
environment used in the `lidar-scanning` project, with a LiDAR point
cloud rendered on the exact same scene alongside it — so the defining
tradeoff (near-zero spatial detail, one scalar per ping, but genuinely
different failure modes than any optical sensor) is visible directly
rather than read off a spec sheet.

Open `index.html` directly in a browser. Nothing is built or uploaded —
plain HTML/CSS/JS, `<canvas>`, and a vendored copy of Three.js
(`js/vendor/`, fetched once and checked in, not CDN-loaded).

## Why this is its own project, not a fifth tab bolted onto lidar-scanning

The `lidar-scanning` app's four viewports are all built around the same
shape of output — a point cloud, on a shared grid of cameras/mirrors.
Ultrasonic's real output is a single number per ping, which doesn't fit
that grid without either faking spatial detail it doesn't have or
awkwardly repurposing the point-cloud viewport for something it isn't.
Instead, this app borrows `lidar-scanning`'s mechanical-LiDAR module
directly (`js/mechanical.js`, unchanged except its namespace) and runs
it against the *same* scene as a second viewport, so the point-cloud vs.
single-scalar contrast the original spec asked for is still front and
center — just as an honest two-viewport comparison instead of a
retrofitted fifth grid cell.

## The shared environment (`js/scene.js`)

Extends the `lidar-scanning` environment (a ring of boxes/cylinders
around a sensor at the origin, a ground plane, one back-and-forth moving
test object) with two things ultrasonic specifically needs:

- **A `surface` tag per object** ("hard" or "soft"), configurable as
  all-hard, all-soft, or mixed, driving the absorption model below.
- **A dedicated tiltable test panel**, always directly ahead of the
  sensor, with its own distance/tilt/surface controls — so the
  angle-of-incidence cutoff can be demonstrated on demand by dragging one
  slider, rather than hoping the ring's incidental box/cylinder geometry
  happens to produce a glancing hit at some particular moment. It's
  centered at the sensor's own height by construction, so tilt is the
  only variable in that demo — verified directly (a straight-on ray's
  measured incidence angle matched the configured tilt to within
  floating-point precision, at 0°, 45°, and past the panel's edge).

## The physics (`js/ultrasonic.js`)

**The beam** is modeled as a small grid of sample rays spanning the
cone's solid angle (a circular, not square, sampling pattern) rather
than a full acoustic wave simulation — an explainable simplification
("many narrow rays, take the closest usable return") that's cheap enough
to run every ping and still produces the sensor's one defining behavior:
multiple objects within the cone collapse into a single nearest-echo
reading, with zero information about which one, or where in the cone, it
came from. `distance = speed_of_sound × round_trip_time / 2`, using a
configurable speed of sound derived from an air-temperature slider
(`331.3 + 0.606 × °C`, the standard linear approximation).

**Three independent, real failure modes** can each reject an
otherwise-valid physical hit before it's allowed to become "the"
reading — verified individually with a fixed test scene before ever
being wired into the UI:

- **Angle of incidence.** If the angle between the sensor and a
  surface's true normal exceeds a configurable limit, that sample is
  specularly reflected away and rejected — *even though an object is
  physically present*. This is modeled from the actual geometric hit
  normal, not a fudge factor, which is exactly why the dedicated test
  panel above is worth having: tilt it past the limit and the reading
  flips from a clean distance to `NO ECHO` at a threshold you set
  yourself.
- **Absorption.** A "soft" surface's echo is modeled as a *shorter
  effective range* rather than a flat always/never — the same physical
  object detected fine up close can simply stop being detectable once
  far enough away, while an identical hard object at the same distance
  keeps reporting normally. Verified: a soft panel beyond its reduced
  effective range reports `NO ECHO`; the identical hard panel at the same
  raw distance reports `OK`; the same soft panel moved closer, back
  within its effective range, reports `OK` again.
- **The blind zone.** Anything closer than a configurable minimum
  distance reports `TOO CLOSE` rather than a number — a real transducer
  genuinely cannot distinguish its own outgoing ring-down from an echo of
  something that close.

**Timing.** Each sensor only updates at its own configurable ping rate
(10–20 Hz is realistic); the scene is sampled once at the start of each
ping cycle and that ping's result — including its status and travel
distance — is held until the next cycle, exactly like a real sensor's
output register, not recomputed continuously.

## Visualizing one ping (`js/ultrasonic.js`'s `computeVisualState`, drawn by `js/view3d.js`)

The outbound cone grows from zero to its travel distance over the
pulse's own round-trip time (physically tiny — a few milliseconds — so,
like `lidar-scanning`, playback speed defaults to a heavy slowdown so
it's actually watchable), colored cyan while in flight. Once the round
trip completes, it holds in a final state: green ("echo returned," with
a marker at the exact hit point), gray ("no echo" — the cone reached its
own max range and found nothing to reflect off), or flashes red ("too
close").

**Simplified:** the inbound leg isn't separately animated as a shrinking
wavefront. Physically the echo is a single point-like return, not a
cone-shaped one — trying to animate a "cone shrinking back" would imply
spatial information the sensor never actually has. Showing a marker at
the hit point once the round trip completes is the honest version of
"the echo came back."

## Array mode + cross-talk

Switching to "Bumper array" places 4–6 sensors along a simple bumper
width, fanned slightly outward at the ends (so the whole array's
coverage is wider than any one cone) — exactly why the demo scene's
panel, sitting dead ahead, shows up clearly on the center sensors but
drops to `NO ECHO` on the outermost ones once their fan angle carries
them past it. **Cross-talk**, when enabled, is deterministic rather than
a rare random glitch specifically so it's reliably observable: on a
fixed, staggered schedule, a sensor whose cone overlaps a neighbor's (by
azimuth separation, not just array position) reports that neighbor's
true reading instead of its own, flagged visibly in its readout card.

## Stats panel

Detection range (min/max), beam angle (explicitly labeled "no spatial
resolution within cone" — the point isn't a number, it's the absence of
one), refresh rate, an angle-of-incidence failure rate computed from the
*current* scene's actual surface angles (not a fixed constant — tilt the
panel or add ring objects and watch it move), and a fixed relative
cost/power/size note, since ultrasonic is genuinely the cheapest and
lowest-power sensor in this whole sensor-comparison series.

## Where ultrasonic fits in the overall comparison

| | Ultrasonic | Time-of-Flight / Structured Light / Stereo (optical) | LiDAR (scanning) |
|---|---|---|---|
| Output shape | One scalar per ping | Depth map / point cloud | Dense point cloud |
| Typical range | Short (0.02–5 m) | Short–medium | Medium–long |
| Angular resolution | None within the beam | Per-pixel | Per-channel/per-beam |
| Cost / power | Lowest | Low–medium | Medium–high |
| **Fog / dust / smoke** | **Unaffected** | Degrades (optical scattering) | Degrades (optical scattering) |
| **Bright sunlight / darkness** | **Unaffected** (not light-based at all) | Degrades (esp. structured light) / unaffected (ToF) | Mostly unaffected |
| Angled/thin targets | Fails past incidence limit (missed curbs, thin poles) | Generally more robust | Generally more robust |
| Soft/absorptive surfaces | Reduced range | Reduced signal, sensor-dependent | Reduced signal, sensor-dependent |
| Classic use case | Parking assist, close-range obstacle detection | Face ID, indoor robotics, automotive-adjacent | Automotive/robotics surround sensing |

The one line worth pulling out on its own: **ultrasonic doesn't degrade
in the lighting or airborne-particulate conditions that hurt every
optical sensor in this series** (fog, dust, smoke, direct sun glare,
total darkness) because it isn't measuring light at all — that's its
real advantage despite the crude, single-scalar spatial output, and part
of why it survives as a cheap complement to cameras/LiDAR on real
vehicles rather than being made obsolete by them.

## Files

```
index.html               controls, layout, canvases
style.css                 dark technical UI
js/vendor/three.min.js       Three.js r128 (vendored, not CDN-loaded)
js/vendor/OrbitControls.js   Three.js's orbit/zoom camera controls
js/vec3.js                vector math
js/rng.js                 seeded PRNG (reproducible scene layout)
js/scene.js               primitives (box/cylinder/ground/tiltable panel), ray intersection, environment + moving object
js/ultrasonic.js          wide-beam cone sampling, failure modes, ping timing, cross-talk
js/mechanical.js          spinning multi-channel LiDAR (borrowed from lidar-scanning, for contrast only)
js/view3d.js              the ultrasonic viewport — real scene geometry + animated cone(s)
js/lidarview.js           the LiDAR comparison viewport — point cloud rendering (borrowed from lidar-scanning)
js/main.js                wiring: controls -> scene + sensors -> shared scene-time playback
```
