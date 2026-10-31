# YouTube Shorts animation generator

Write a short JSON script → get a vertical **1080×1920 MP4** ready to upload as a YouTube Short.

Each video gets an animated gradient background with floating bubbles, pop-in titles, word-by-word captions (the current word is highlighted), numbered fact badges, slide transitions, a progress bar, your channel handle, and a generated music track with whoosh/pop sound effects.

## Requirements
- Python 3.9+ with `pip install pillow numpy`
- `ffmpeg` on your PATH

## Usage
```bash
python3 shorts/make_short.py shorts/examples/octopus.json -o octopus.mp4
python3 shorts/make_short.py my_script.json --preview   # quick 540x960 draft
```

## Script format
```json
{
  "handle": "@yourchannel",
  "fps": 30,
  "theme": { "background": ["#0b1d51", "#8a2be2"], "accent": "#ffd60a", "text": "#ffffff",
             "font": "/path/to/optional-font.ttf" },
  "audio": { "music": true, "bpm": 118 },
  "scenes": [
    { "type": "title",   "duration": 2.6, "text": "3 Wild Octopus Facts", "sub": "#3 sounds made up" },
    { "type": "fact",    "duration": 3.4, "number": 1, "label": "Hearts", "text": "An octopus has three hearts" },
    { "type": "caption", "duration": 3.0, "text": "Any line of text, revealed word by word", "words_per_sec": 3.2 },
    { "type": "outro",   "duration": 2.8, "text": "Follow for more facts!", "button": "SUBSCRIBE" }
  ]
}
```

| Scene type | What it shows |
|---|---|
| `title`   | Big wobbling title that pops in, optional `sub` line |
| `fact`    | Spinning number badge, optional `label`, word-by-word caption |
| `caption` | Word-by-word caption centered on screen (`size`, `words_per_sec` optional) |
| `outro`   | Call to action plus a pulsing button |

Audio: set `"audio": {"file": "voiceover.wav"}` to use your own voiceover/music instead of the generated track, or `"music": false` to keep only the sound effects.

Tips: keep Shorts under 60 seconds (15–30s works best), and pace captions at roughly 3 words per second.
