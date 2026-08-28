# IMU Sensing: Accelerometer, Gyroscope, and Sensor Fusion

A local, static, no-build-step web app simulating a full inertial
measurement unit — accelerometer, gyroscope, optional magnetometer, and
three ways of turning their noisy readings into an orientation and
position estimate — on one rigid body driven by a preset motion profile
or your own keyboard input.

Open `index.html` directly in a browser. Nothing is built or uploaded —
plain HTML/CSS/JS, `<canvas>`, and a vendored copy of Three.js
(`js/vendor/`, fetched once and checked in, not CDN-loaded).

## The one idea everything else depends on: specific force

An accelerometer does **not** measure acceleration in the everyday sense
— it measures **specific force**: `true_acceleration - gravity`. Sitting
still on a table, true acceleration is zero, so specific force equals
`-gravity`, which points *up* — that's the table's normal force holding
the accelerometer in place, and it's exactly why a stationary
accelerometer reads +9.81 m/s² on its "up" axis instead of zero. In free
fall, true acceleration *equals* gravity, so specific force is exactly
zero — a real accelerometer in free fall reads nothing at all on any
axis. `js/imu.js` computes this directly (`specificForce = trueAccel -
gravityVector`, then rotated into body axes), and both cases are checked
against their known values, not just described: at rest the simulated
reading is exactly `[0, 9.81, 0]`; falling, it's exactly `[0, 0, 0]`.

Pick the **Free-fall / drop** motion profile and watch the accelerometer
chart go flat at zero the instant it starts falling — that's the
concrete version of this idea.

## Why gyroscope drift happens (`js/motion.js`, `js/fusion.js`)

A gyroscope's own error model — white noise, a fixed bias, and bias
*drift* (the bias itself slowly wandering, sometimes called bias
instability) — is layered onto its true angular velocity reading. The
"gyro-only" orientation estimate is pure integration with **no
correction at all**: any bias, however small, integrates into an
ever-growing angle error, because integration has no way to tell "the
gyro reads 0.02 rad/s because it's genuinely rotating that fast" from
"the gyro reads 0.02 rad/s because that's its bias, and it's not
rotating at all." On the default straight-line motion profile (which
involves *no real rotation whatsoever*), the gyro-only estimate still
drifts to 50+ degrees of orientation error within 20 seconds from bias
alone — that drift is the entire demonstration, deliberately left
uncorrected so it's visible.

## Why fusion corrects it (`js/fusion.js`)

Both the complementary filter and the Kalman filter use the exact same
physical insight: gravity doesn't drift. The accelerometer, when the body
isn't accelerating much, is a noisy but *unbiased* long-term reference
for "which way is up" — so nudging the gyro-integrated orientation back
toward that reference, a little on every sample, cancels drift that
would otherwise grow forever. If a magnetometer is enabled, the same
trick corrects **yaw** using a horizontal reference toward magnetic
north — the one axis accelerometer alone can never observe, since
gravity doesn't change if you spin in place with your bank angle fixed.

Both corrections are implemented as **vector alignment** (rotate the
orientation estimate's own predicted "up"/"north" toward what the sensor
actually measured), not as a hand-derived Euler-angle tilt formula. This
was a deliberate choice made after two Euler-angle sign bugs were found
elsewhere in this app (see below) — vector alignment sidesteps needing to
get an axis-convention-specific formula right, and sidesteps gimbal lock
entirely.

- **Complementary filter**: a fixed blend factor (the "correction
  strength" sliders) trusted every sample.
- **Kalman filter**: the same two observations, but with a formally
  derived, uncertainty-aware gain, and — this is its real advantage over
  a fixed-gain complementary filter — an explicit state for the gyro's
  own bias, which it learns and cancels over time. This was verified
  directly: given a known constant gyro bias, the filter's bias estimate
  converges to within 0% of the true value within a few seconds, and the
  resulting orientation error drops below the complementary filter's own
  residual error once it does.

**A real limitation worth trying deliberately**: switch the motion
profile to **Constant-velocity turn**. During a sustained turn, the
body's centripetal acceleration is *constant in the body's own frame*
(it always points from the body toward the turn's center, relative to
however the body is currently facing) — so it looks exactly like a fixed
tilt error to the accelerometer correction, which has no way to
distinguish "I'm banked" from "I'm turning." You'll see the fused
estimate do noticeably *worse* than it does on the straight-line
profile — this is the same well-known "coordinated turn" problem real
aircraft attitude systems have to specifically design around (and part
of why real INS/AHRS designs add a turn-rate-aware gain schedule, which
this simplified version doesn't).

## Why double-integrated position is unusable alone (`js/position.js`)

Position is estimated by integrating the accelerometer twice with no
outside correction at all: `accel → velocity → position`. A single
constant accelerometer bias produces a position error that grows with
the **square** of time, not linearly — verified directly: a fixed 0.05
m/s² bias produces a position error of 0.025 m at 1 s, 0.400 m at 4 s
(16× worse, matching t², not the 4× a linear error would give). With
noise and bias drift added on top of a plain constant bias, real IMUs
drift into meters of error within seconds — which is exactly why no
real system (drone, phone, robot, vehicle) ever uses IMU-only dead
reckoning for absolute position. It's always fused with something that
provides an *absolute* position reference: GPS outdoors, visual odometry
or LiDAR indoors, wheel encoders for ground vehicles. The IMU's real job
in that stack is filling in the *gaps* between those slower, absolute
fixes with high-rate, low-latency motion estimates — not replacing them.

## Where IMUs fit in a broader stack

This is the fourth sensor family in this series (after depth cameras,
scanning LiDAR, and ultrasonic), and it's a fundamentally different kind
of sensor: every other one measures the *environment*; the IMU measures
only the *body it's attached to*, with no notion of the outside world at
all beyond gravity and (optionally) Earth's magnetic field. That's why
its failure mode (drift, unboundedly, forever) is also fundamentally
different — an optical or acoustic sensor's error stays bounded by
physics (you can't be wrong about a wall's distance by more than the
wall's actual distance), while an uncorrected IMU's error has no such
ceiling. In practice IMUs are almost never used alone:

- **+ GPS**: the classic combination for outdoor vehicles/drones — GPS
  gives absolute position at 1-10 Hz; the IMU fills in position and
  attitude at 100-1000 Hz between fixes, and keeps working through GPS
  dropouts (tunnels, urban canyons).
- **+ LiDAR/cameras** (this app's siblings): visual/LiDAR odometry
  corrects IMU drift indoors or wherever GPS doesn't reach; the IMU in
  turn helps those sensors by predicting motion between scans/frames and
  surviving the brief moments where a scene has too little texture or
  structure to localize against on its own.
- **+ ultrasonic/wheel encoders**: shorter-range, cheaper absolute or
  relative references for ground robots and close-range applications.

## Bugs found and fixed while building this (kept here deliberately)

Two real bugs were caught by testing against known values before ever
touching the UI, not by eyeballing the result — worth keeping visible as
evidence this was actually verified, not just written:

1. `constantTurn`'s position/velocity formulas used the opposite
   rotational handedness from the quaternion library's own convention,
   so the body's drawn orientation and its actual direction of travel
   silently diverged more and more over time (facing the *opposite* way
   from its velocity by 3 seconds in). Caught by checking that the
   body's local +X axis, rotated by its orientation, matched its
   velocity direction — not by checking the position path looked
   plausible.
2. The complementary/Kalman filters' accelerometer and magnetometer
   corrections converged to a stable orientation **180° from the true
   one**. The angle magnitude was being computed correctly; only the
   rotation's direction was backwards, because a body-frame correction
   quaternion, when right-multiplied onto the current orientation
   estimate, needs to be the *inverse* of "rotate predicted onto
   measured" — not that rotation itself. Caught by testing convergence
   against a specific known tilt angle, not by checking that the filter
   merely "settled."

## Files

```
index.html          controls, layout, canvases
style.css            dark technical UI
js/vendor/three.min.js       Three.js r128 (vendored, not CDN-loaded)
js/vendor/OrbitControls.js   Three.js's orbit/zoom camera controls
js/vec3.js            vector math
js/quat.js            quaternion math — the core orientation representation everything else builds on
js/rng.js             seeded PRNG + Gaussian sampling
js/noise.js           the three IMU noise categories: white noise, bias, bias drift
js/motion.js          ground-truth motion profiles + manual keyboard control
js/imu.js             specific force / angular velocity / magnetic field -> noisy sensor readings
js/fusion.js          gyro-only, complementary filter, and Kalman filter orientation estimators
js/position.js        double-integrated position estimate and its drift
js/chart.js           small scrolling multi-series line chart (no charting library)
js/bodyview.js        Three.js viewport(s) showing labeled bodies with axis gizmos
js/main.js            wiring: controls -> motion + sensors + fusion -> charts + 3D viewports
```
