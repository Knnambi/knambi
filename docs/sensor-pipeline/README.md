# CCD vs CMOS — Image Sensor Pipeline Simulator

A small, dependency-free web app that runs the same synthetic (or uploaded)
scene through two side-by-side, simplified models of an image sensor
pipeline — one built like a **CCD**, one like a **CMOS** — so the
architectural differences that actually matter (readout speed, blooming,
rolling-shutter skew, fixed-pattern noise) are something you can *watch
happen* frame by frame, rather than just read about.

**This is a pedagogical model, not a physically exact sensor simulator.**
Every constant is chosen to make an effect visible and comparable, not to
match a datasheet. See "What's simplified" below before citing any number
out of this tool.

## Running it

There's no build step and no server required:

```
open index.html
```

(or double-click it, or drag it into a browser tab). Everything — including
the "uploaded image" feature — runs from `file://` with no network access
and no dependencies. If your browser blocks `file://` scripts for some
reason, any static file server works too, e.g. `python3 -m http.server`
from this directory.

## What the pipeline actually does

Both architectures run through the same five stages; only stages 2 and 3
differ between them.

1. **Photon capture** (`scene.js`) — a scene generator (or an uploaded
   image, resampled to the sensor's resolution) provides a 0–1 "how much
   light is hitting this photosite" value per pixel.
2. **Charge accumulation** (`capture.js`) — that light, multiplied by
   exposure time and a fixed quantum-efficiency constant, becomes an
   expected electron count. **Shot noise** (Poisson) is applied to the
   *total* of signal + dark current, since real charge is real charge
   once it's collected — the sensor can't tell a dark electron from a
   photoelectron. Anything past the **full well capacity** overflows.
   - **CCD only**: overflow charge bleeds into the photosite above and
     below it in the same column (`blooming.js`), iterated a few passes
     so it can cascade — this is why real CCD blooming looks like a
     vertical streak, not a blob. CMOS photosites are electrically
     isolated from each other and don't get this treatment.
3. **Readout** — the core architectural difference, and the reason this
   tool exists:
   - **CCD** (`readout-ccd.js`): a literal bucket brigade. The whole array
     shifts down one row into a horizontal shift register, then that row's
     charge packets shift out **one at a time** through a single output
     amplifier, before the next row is allowed in. Total time ≈
     `(rows + rows×cols) / pixelClock`.
   - **CMOS** (`readout-cmos.js`): every pixel already has its own
     amplifier, and a row of column-parallel ADCs converts an entire row
     **at once**. Total time ≈ `rows / pixelClock` — roughly `cols` times
     faster for the same clock, which is the real-world reason CMOS won
     high-frame-rate and low-power applications.
   - Shutter mode is decided one stage earlier, in how each row's photon
     capture samples the scene (`main.js`'s `rowTime` callback): **rolling
     shutter** samples row *r* at time `r / (rows−1)` across the frame, so
     a moving subject appears at a different position in each row — the
     classic shear/skew artifact, reproduced here with the "moving bar"
     scene. **Global shutter** samples every row at the same instant, so
     there's no skew, at the cost (modeled here as a fixed relative-power
     bump) of needing extra per-pixel storage to hold every pixel's charge
     while the rest of the frame is still being read out.
4. **Noise & conversion** (`fpn.js`, `adc.js`) — read noise (Gaussian,
   temporal — different every frame) and **fixed-pattern noise** (a
   gain/offset error that's a property of the physical chip, generated
   once and reused until you click "Reseed sensor") are added, then the
   result is quantized to the chosen ADC bit depth.
   - CCD's one shared amplifier chain means FPN is modeled as
     **per-column**.
   - CMOS's one-amplifier-per-pixel design means FPN is modeled as
     **per-pixel**.
5. **Comparison** (`stats.js`, `timing.js`) — readout time and a rough
   relative power estimate come from closed-form formulas (so they're
   accurate to the model regardless of animation speed); SNR and artifact
   detection are read back from the actual finished image.

## What's simplified (please read before trusting a number)

- **All the "electrons," "full well," and "quantum efficiency" units are
  an internal, self-consistent scale**, tuned so the *default* slider
  settings produce a clearly visible, non-saturated image with headroom
  to push into saturation. They are not calibrated against any real
  sensor's datasheet.
- **Poisson shot noise** is sampled exactly (Knuth's algorithm) for small
  electron counts and approximated with a Gaussian for large ones (a
  standard, well-known shortcut — exact Poisson sampling is too slow once
  a photosite holds thousands of electrons). See `rng.js`.
- **Dark current's temperature dependence** uses the commonly-cited "roughly
  doubles every ~7°C" rule of thumb, not a derived Arrhenius/bandgap model.
- **Readout timing** ignores second-order overhead that real sensors have
  — ADC conversion cycles, row/column select settling time, blanking
  intervals. The ~(columns)× CMOS speedup is the one number this model is
  built to get right; treat the absolute µs/ms values as illustrative.
- **Power draw is in made-up "relative units," not milliwatts.** It's a
  hand-picked formula meant to reflect the textbook direction of the
  tradeoff (CCD's high-voltage transfer clocks vs. CMOS's many small
  amplifiers, plus a bump for global shutter's extra storage), not a
  calibrated estimate.
- **SNR** is computed from the *finished digital image itself* (mean ÷
  stdev of the darker half of the pixel population, used as a proxy for a
  flat region of the scene) rather than from a noise-free reference frame.
  It folds shot noise, read noise, dark current and FPN into one number
  and is meant as a fair, comparable headline figure between the two
  pipelines on the same scene — not a rigorous photometric measurement.
- **CCD fixed-pattern noise is modeled as per-column**, matching the
  "single output amplifier" framing this tool uses. Real full-frame CCD
  FPN characteristics vary by sensor family; some effects real CCDs
  exhibit (e.g. per-column charge-transfer efficiency loss) are related
  but not identical to what's modeled here.
- **Blooming** is a simplified iterative bleed model (split overflow
  charge to the two vertical neighbors, clamp, repeat), not a simulation
  of the actual potential-well/channel-stop physics that causes it.
  It reliably produces the right *qualitative* look (vertical streaking
  from saturated highlights) rather than a quantitatively accurate spread.
- **Rolling-shutter skew** only models translation timing per row; it
  doesn't model exposure-time-dependent motion blur within a row, lens
  effects, or non-linear scan patterns.
- The grid is always **square** (resolution picker sets both width and
  height) purely to keep the UI and the animation timing simpler to
  reason about — nothing in the pipeline logic requires that.
- Resolution is capped at 64×64 so the readout animations — especially
  the CCD's one-pixel-at-a-time bucket brigade — stay legible and finish
  in a reasonable number of animation frames. A real CCD at even a modest
  1–2 MP resolution would take many seconds to read out at these pixel
  clock rates; the point here is the *shape* of that scaling, not
  simulating a full-resolution sensor.

## Code layout

Plain `<script>` tags (no bundler, no ES modules — deliberately, so the
app works by opening `index.html` directly with zero build step), each
file attaching its exports to a shared `window.Sensor` namespace:

| File | Responsibility |
|---|---|
| `js/rng.js` | Seeded PRNG, Gaussian and Poisson sampling |
| `js/scene.js` | Synthetic test scenes + uploaded-image → intensity grid |
| `js/capture.js` | Photon capture, shot noise, dark current, full-well clamp |
| `js/blooming.js` | CCD-only vertical charge bleed |
| `js/fpn.js` | Fixed-pattern noise generation (per-column / per-pixel) |
| `js/adc.js` | Read noise + bit-depth quantization |
| `js/timing.js` | Readout time and relative-power formulas |
| `js/readout-ccd.js` | The serial bucket-brigade readout state machine |
| `js/readout-cmos.js` | The row-parallel readout state machine |
| `js/stats.js` | SNR and artifact detection from the finished image |
| `js/render.js` | All canvas drawing (kept free of simulation logic) |
| `js/main.js` | DOM wiring, app state, the Step/Run animation loop |

Simulation code (everything except `render.js` and `main.js`) has no DOM
or canvas dependency, so it can be read (or reused, or tested) on its own.
