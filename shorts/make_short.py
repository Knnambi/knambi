#!/usr/bin/env python3
"""YouTube Shorts animation generator.

Turns a simple JSON script into a vertical 1080x1920 MP4 with animated
backgrounds, pop-in titles, word-by-word captions, numbered fact cards,
a progress bar, and a generated music + sound-effect track.

Usage:
    python3 shorts/make_short.py shorts/examples/octopus.json -o out.mp4
    python3 shorts/make_short.py script.json --preview   # fast low-res draft

Requires: Python 3.9+, Pillow, numpy, ffmpeg on PATH.
"""
import argparse, json, math, os, random, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FONT_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]

# ---------------------------------------------------------------- helpers
def load_font(size, path=None):
    for p in ([path] if path else []) + FONT_BOLD:
        if p and os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def lerp(a, b, t):
    return a + (b - a) * t

def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))

def ease_out_back(t, s=1.7):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1

def ease_out_cubic(t):
    return 1 - (1 - clamp(t)) ** 3

def ease_in_out(t):
    t = clamp(t)
    return 3 * t * t - 2 * t * t * t

def wrap(text, font, max_w, draw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= max_w or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def text_sprite(text, font, fill, max_w, stroke=8, stroke_fill=(0, 0, 0), align="center", spacing=1.15):
    """Render multi-line text to a transparent RGBA sprite."""
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    lines = wrap(text, font, max_w, tmp)
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * spacing)
    w = int(max(tmp.textlength(l, font=font) for l in lines)) + stroke * 2 + 4
    h = lh * len(lines) + stroke * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        lw = d.textlength(l, font=font)
        x = (w - lw) / 2 if align == "center" else stroke
        d.text((x, stroke + i * lh), l, font=font, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return img

def paste_center(base, sprite, cx, cy, scale=1.0, alpha=1.0, angle=0.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    s = sprite
    if abs(scale - 1) > 1e-3:
        s = s.resize((max(1, int(s.width * scale)), max(1, int(s.height * scale))), Image.BICUBIC)
    if angle:
        s = s.rotate(angle, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        a = s.getchannel("A").point(lambda v: int(v * alpha))
        s = s.copy()
        s.putalpha(a)
    base.alpha_composite(s, (int(cx - s.width / 2), int(cy - s.height / 2)))

# ---------------------------------------------------------------- background
class Background:
    def __init__(self, colors, seed=7, n=26):
        self.c1, self.c2 = hex2rgb(colors[0]), hex2rgb(colors[1])
        rnd = random.Random(seed)
        self.blobs = [dict(x=rnd.uniform(0, W), y=rnd.uniform(0, H), r=rnd.uniform(20, 120),
                           sp=rnd.uniform(20, 90), ph=rnd.uniform(0, 6.28), a=rnd.randint(25, 70))
                      for _ in range(n)]
        y = np.linspace(0, 1, H)[:, None]
        self.grad_y = np.repeat(y, W, axis=1)
        x = np.linspace(0, 1, W)[None, :]
        self.grad_x = np.repeat(x, H, axis=0)

    def render(self, t):
        # slowly rotating diagonal gradient
        ang = 0.25 * math.sin(t * 0.4)
        g = clamp_arr(self.grad_y * math.cos(ang) + (self.grad_x - 0.5) * math.sin(ang))
        c1, c2 = np.array(self.c1, float), np.array(self.c2, float)
        arr = (c1[None, None, :] * (1 - g[..., None]) + c2[None, None, :] * g[..., None]).astype(np.uint8)
        img = Image.fromarray(arr, "RGB").convert("RGBA")
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for b in self.blobs:
            y = (b["y"] - t * b["sp"]) % (H + 300) - 150
            x = b["x"] + 40 * math.sin(t * 0.8 + b["ph"])
            r = b["r"]
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, b["a"]))
        img.alpha_composite(layer)
        return img

def clamp_arr(a):
    return np.clip(a, 0, 1)

# ---------------------------------------------------------------- scenes
class Scene:
    def __init__(self, spec, theme, idx):
        self.spec, self.theme, self.idx = spec, theme, idx
        self.dur = float(spec.get("duration", 3))
        self.accent = hex2rgb(theme.get("accent", "#ffd60a"))
        self.fg = hex2rgb(theme.get("text", "#ffffff"))
        self.font_path = theme.get("font")

    def render(self, img, lt):
        """lt = local time in seconds within the scene."""
        kind = self.spec.get("type", "caption")
        getattr(self, "r_" + kind, self.r_caption)(img, lt)

    # Big title with pop-in, wobble and subtitle
    def r_title(self, img, lt):
        if not hasattr(self, "_t"):
            self._t = text_sprite(self.spec["text"].upper(), load_font(130, self.font_path), self.fg, 940, stroke=10)
            sub = self.spec.get("sub")
            self._s = text_sprite(sub, load_font(64, self.font_path), self.accent, 900, stroke=6) if sub else None
        sc = ease_out_back(lt / 0.6) * (1 + 0.03 * math.sin(lt * 4))
        paste_center(img, self._t, W / 2, H * 0.42, sc, clamp(lt / 0.2), angle=2 * math.sin(lt * 2.5))
        if self._s:
            p = ease_out_cubic((lt - 0.5) / 0.5)
            paste_center(img, self._s, W / 2, lerp(H * 0.75, H * 0.62, p), 1, p)

    # Numbered fact: spinning badge + word-by-word caption
    def r_fact(self, img, lt):
        if not hasattr(self, "_badge"):
            r = 150
            b = Image.new("RGBA", (r * 2 + 20, r * 2 + 20), (0, 0, 0, 0))
            d = ImageDraw.Draw(b)
            d.ellipse((10, 18, r * 2 + 10, r * 2 + 18), fill=(0, 0, 0, 90))
            d.ellipse((10, 10, r * 2 + 10, r * 2 + 10), fill=self.accent + (255,), outline=(255, 255, 255, 255), width=10)
            f = load_font(170, self.font_path)
            n = str(self.spec.get("number", self.idx))
            tw = d.textlength(n, font=f)
            asc, desc = f.getmetrics()
            d.text((r + 10 - tw / 2, r + 10 - (asc + desc) / 2 + 10), n, font=f, fill=(20, 20, 30))
            self._badge = b
            if self.spec.get("label"):
                self._label = text_sprite(self.spec["label"].upper(), load_font(60, self.font_path), self.accent, 900, stroke=6)
        p = ease_out_back(lt / 0.5)
        paste_center(img, self._badge, W / 2, H * 0.27 + 10 * math.sin(lt * 3), p, 1, angle=(1 - clamp(lt / 0.5)) * -180)
        if hasattr(self, "_label"):
            paste_center(img, self._label, W / 2, H * 0.40, 1, ease_out_cubic((lt - 0.3) / 0.4))
        self.captions(img, lt - 0.4, H * 0.62)

    # Plain caption scene
    def r_caption(self, img, lt):
        self.captions(img, lt, H * 0.5)

    # Outro / call to action with pulsing button
    def r_outro(self, img, lt):
        if not hasattr(self, "_o"):
            self._o = text_sprite(self.spec["text"].upper(), load_font(110, self.font_path), self.fg, 940, stroke=10)
            btn_txt = self.spec.get("button", "SUBSCRIBE")
            f = load_font(72, self.font_path)
            tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
            tw = tmp.textlength(btn_txt, font=f)
            bw, bh = int(tw + 140), 150
            b = Image.new("RGBA", (bw + 20, bh + 20), (0, 0, 0, 0))
            d = ImageDraw.Draw(b)
            d.rounded_rectangle((10, 18, bw + 10, bh + 18), 40, fill=(0, 0, 0, 100))
            d.rounded_rectangle((10, 10, bw + 10, bh + 10), 40, fill=(230, 33, 23, 255))
            asc, desc = f.getmetrics()
            d.text((10 + (bw - tw) / 2, 10 + (bh - asc - desc) / 2), btn_txt, font=f, fill=(255, 255, 255))
            self._btn = b
        paste_center(img, self._o, W / 2, H * 0.40, ease_out_back(lt / 0.6), 1)
        p = ease_out_back((lt - 0.4) / 0.5)
        pulse = 1 + 0.06 * max(0, math.sin((lt - 0.9) * 6)) if lt > 0.9 else 1
        paste_center(img, self._btn, W / 2, H * 0.62, p * pulse, 1)

    # Word-by-word captions, current word highlighted & popped
    def captions(self, img, lt, cy):
        text = self.spec.get("text", "").upper()
        if not text:
            return
        if not hasattr(self, "_cap"):
            f = load_font(int(self.spec.get("size", 92)), self.font_path)
            tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
            lines = wrap(text, f, 860, tmp)
            asc, desc = f.getmetrics()
            lh = int((asc + desc) * 1.2)
            words, y0 = [], cy - lh * len(lines) / 2
            for li, line in enumerate(lines):
                lw = tmp.textlength(line, font=f) + 16 * len(line.split())
                x = W / 2 - lw / 2
                for w in line.split():
                    ww = tmp.textlength(w, font=f) + 16  # room for stroke
                    words.append((w, x + ww / 2, y0 + li * lh + lh / 2))
                    x += ww + tmp.textlength(" ", font=f)
            self._cap = (f, words)
        f, words = self._cap
        wps = float(self.spec.get("words_per_sec", 3.2))
        for i, (w, x, y) in enumerate(words):
            wt = lt - i / wps
            if wt < 0:
                break
            current = wt < 1 / wps
            col = self.accent if current else self.fg
            key = (w, current)
            cache = self.__dict__.setdefault("_wc", {})
            if key not in cache:
                cache[key] = text_sprite(w, f, col, 2000, stroke=8)
            sc = ease_out_back(wt / 0.25) * (1.12 if current else 1.0)
            paste_center(img, cache[key], x, y, sc, clamp(wt / 0.1))

# ---------------------------------------------------------------- audio
def synth_audio(scenes, total, path, sr=44100, bpm=120, music=True):
    n = int(total * sr)
    out = np.zeros(n)
    t = np.arange(n) / sr
    if music:
        beat = 60 / bpm
        # chord pad (Am - F - C - G)
        prog = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]]
        bar = beat * 4
        for k in range(int(total / bar) + 1):
            s, e = int(k * bar * sr), min(n, int((k + 1) * bar * sr))
            if s >= n:
                break
            tt = t[s:e] - k * bar
            env = np.minimum(1, tt / 0.3) * np.minimum(1, (bar - tt) / 0.3)
            for fr in prog[k % 4]:
                out[s:e] += 0.035 * env * np.sin(2 * np.pi * fr * tt) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * tt))
        # kick + hat
        for k in range(int(total / beat) + 1):
            s = int(k * beat * sr)
            L = min(int(0.25 * sr), n - s)
            if L <= 0:
                break
            tt = np.arange(L) / sr
            out[s:s + L] += 0.35 * np.sin(2 * np.pi * (50 + 90 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 12)
            hs = int((k + 0.5) * beat * sr)
            HL = min(int(0.05 * sr), n - hs)
            if HL > 0:
                out[hs:hs + HL] += 0.05 * np.random.randn(HL) * np.exp(-np.arange(HL) / sr * 80)
    # whoosh + pop at each scene start
    start = 0.0
    for sc in scenes:
        s = int(start * sr)
        L = min(int(0.35 * sr), n - s)
        if L > 0:
            tt = np.arange(L) / sr
            noise = np.convolve(np.random.randn(L), np.ones(30) / 30, mode="same")
            out[s:s + L] += 0.5 * noise * np.sin(np.pi * tt / 0.35)
            out[s:s + L] += 0.25 * np.sin(2 * np.pi * (600 + 900 * tt) * tt) * np.exp(-tt * 18)
        start += sc.dur
    out = out / max(1e-6, np.abs(out).max()) * 0.85
    fade = int(0.5 * sr)
    out[-fade:] *= np.linspace(1, 0, fade)
    pcm = (out * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())

# ---------------------------------------------------------------- main
def render(script, out_path, preview=False):
    global W, H
    fps = int(script.get("fps", 30))
    if preview:
        fps = 15
    theme = script.get("theme", {})
    scenes = [Scene(s, theme, i + 1) for i, s in enumerate(script["scenes"])]
    total = sum(s.dur for s in scenes)
    bg = Background(theme.get("background", ["#1a1a40", "#7a0bc0"]))
    out_w, out_h = (540, 960) if preview else (W, H)

    tmpdir = tempfile.mkdtemp()
    wav = os.path.join(tmpdir, "audio.wav")
    audio = script.get("audio", {})
    if audio.get("file"):
        wav = audio["file"]
    else:
        synth_audio(scenes, total, wav, bpm=audio.get("bpm", 120), music=audio.get("music", True))

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{out_w}x{out_h}", "-r", str(fps), "-i", "-", "-i", wav,
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest",
           "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    nframes = int(total * fps)
    bar_col = hex2rgb(theme.get("accent", "#ffd60a"))
    TR = 0.35  # transition seconds
    for fi in range(nframes):
        t = fi / fps
        frame = bg.render(t)
        # locate scene
        acc = 0.0
        for si, sc in enumerate(scenes):
            if t < acc + sc.dur or si == len(scenes) - 1:
                break
            acc += sc.dur
        lt = t - acc
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sc.render(layer, lt)
        # exit transition: slide up + fade at scene end (not last scene)
        remaining = sc.dur - lt
        if remaining < TR and si < len(scenes) - 1:
            p = ease_in_out(1 - remaining / TR)
            layer = layer.transform(layer.size, Image.AFFINE, (1, 0, 0, 0, 1, p * 400), Image.BILINEAR)
            a = layer.getchannel("A").point(lambda v: int(v * (1 - p)))
            layer.putalpha(a)
        frame.alpha_composite(layer)
        # progress bar
        d = ImageDraw.Draw(frame)
        d.rectangle((0, 0, W, 14), fill=(0, 0, 0, 120))
        d.rectangle((0, 0, int(W * t / total), 14), fill=bar_col + (255,))
        # watermark / handle
        if script.get("handle"):
            if not hasattr(render, "_h"):
                render._h = text_sprite(script["handle"], load_font(44), (255, 255, 255, 200), 900, stroke=4)
            paste_center(frame, render._h, W / 2, H - 230, 1, 0.85)
        rgb = frame.convert("RGB")
        if preview:
            rgb = rgb.resize((out_w, out_h), Image.BILINEAR)
        proc.stdin.write(rgb.tobytes())
        if fi % fps == 0:
            print(f"\rrendering {fi}/{nframes} frames", end="", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"\rdone -> {out_path} ({total:.1f}s, {nframes} frames @ {fps}fps)")
    if proc.returncode:
        sys.exit("ffmpeg failed")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", help="JSON script file")
    ap.add_argument("-o", "--out", default=None, help="output .mp4 (default: <script>.mp4)")
    ap.add_argument("--preview", action="store_true", help="fast 540x960 @15fps draft")
    a = ap.parse_args()
    with open(a.script) as f:
        script = json.load(f)
    out = a.out or os.path.splitext(os.path.basename(a.script))[0] + ".mp4"
    render(script, out, a.preview)

if __name__ == "__main__":
    main()
