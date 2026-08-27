/*
 * scene.js — produces the "true scene" the sensor is pointed at: an
 * intensity field in [0,1] per photosite, plus (for the moving-bar scene)
 * a way to sample that field at an arbitrary point in *time* so a rolling
 * shutter can expose different rows at different moments.
 *
 * A scene is an object: { sample(x, y, w, h, t) -> [0,1] }
 *   x, y   — photosite column/row (0-based)
 *   w, h   — grid width/height, so patterns can scale to any resolution
 *   t      — time in [0,1] across the frame (0 = start of readout,
 *            1 = end). Static scenes ignore it; the moving bar uses it.
 */
(function () {
  "use strict";

  function gradientScene() {
    return {
      name: "Gradient",
      sample: function (x, y, w) {
        return w > 1 ? x / (w - 1) : 0.5;
      },
    };
  }

  function checkerboardScene() {
    return {
      name: "Checkerboard",
      sample: function (x, y) {
        const cell = 4; // photosites per checker square
        return ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) ? 0.9 : 0.08;
      },
    };
  }

  function radialScene() {
    return {
      name: "Radial",
      sample: function (x, y, w, h) {
        const cx = (w - 1) / 2, cy = (h - 1) / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy) || 1;
        const r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        return Math.max(0, 1 - r / maxR);
      },
    };
  }

  // A single bright vertical bar that sweeps left-to-right over the
  // exposure/readout window. With a rolling shutter, rows sampled later
  // (higher t) see the bar further to the right — that per-row time
  // offset is exactly what shears the bar in the final CMOS image.
  function movingBarScene(motionEnabled) {
    return {
      name: "Moving bar",
      sample: function (x, y, w, h, t) {
        const tt = motionEnabled ? t : 0; // frozen unless motion is on
        const barWidth = Math.max(1, Math.round(w * 0.08));
        const travel = w - barWidth; // bar sweeps fully across the frame
        const barX = travel * tt;
        const bg = 0.12;
        if (x >= barX && x < barX + barWidth) return 0.95;
        return bg;
      },
    };
  }

  // Wraps a decoded image (already resampled to the sensor's resolution)
  // as a static scene. Built once per upload via buildImageScene().
  function imageScene(intensityGrid, w, h) {
    return {
      name: "Uploaded image",
      sample: function (x, y) {
        return intensityGrid[y * w + x];
      },
    };
  }

  // Draws `imgEl` into an offscreen canvas at the sensor's resolution
  // (so the browser's own image smoothing does the downsampling/binning
  // a real lens+sensor would do), reads it back as grayscale luminance,
  // and returns a Float32Array intensity grid in [0,1].
  function buildImageScene(imgEl, w, h) {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d", { willReadFrequently: true });
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    // letterbox-fit the source image into the w x h grid, preserving aspect
    const srcAspect = imgEl.width / imgEl.height;
    const dstAspect = w / h;
    let dw = w, dh = h, dx = 0, dy = 0;
    if (srcAspect > dstAspect) {
      dh = w / srcAspect;
      dy = (h - dh) / 2;
    } else {
      dw = h * srcAspect;
      dx = (w - dw) / 2;
    }
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, w, h);
    octx.drawImage(imgEl, dx, dy, dw, dh);
    const data = octx.getImageData(0, 0, w, h).data;
    const grid = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      // Rec. 601 luma — a standard, simple grayscale weighting.
      grid[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return imageScene(grid, w, h);
  }

  window.Sensor = window.Sensor || {};
  window.Sensor.Scene = {
    gradientScene,
    checkerboardScene,
    radialScene,
    movingBarScene,
    buildImageScene,
  };
})();
