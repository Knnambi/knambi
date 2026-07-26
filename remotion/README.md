# The Continental Blockade — a Remotion animation

A short animated history video, built programmatically with
[Remotion](https://www.remotion.dev) (real MP4 video from React).

It tells the story of **Napoleon's Continental Blockade of Britain (1806)**:

- a real political map of Europe as the stage,
- Napoleon (Jacques‑Louis David's portrait) planted on the French side,
- a huge fortified **barricade** that draws itself around the British Isles,
- **ships** that sail from continental ports toward Britain and are turned
  back at the blockade line,
- narration captions and a closing "reckoning".

## Run it

```bash
cd remotion
npm install

# interactive preview (Remotion Studio)
npm run dev

# render the MP4 (writes out/napoleon-blockade.mp4)
npm run render

# render a single still poster
npm run render:still
```

Composition: `NapoleonBlockade` — 1920×1080, 30fps, ~23.5s.

## How it's put together

| File | Role |
| --- | --- |
| `src/Root.tsx` | Registers the `NapoleonBlockade` composition. |
| `src/NapoleonBlockade.tsx` | Sequences the title card → the map story. |
| `src/scenes/TitleCard.tsx` | Opening title with a framed Napoleon portrait. |
| `src/scenes/BlockadeMap.tsx` | The main scene: map camera, Napoleon, barricade, fleet, captions. |
| `src/components/MapView.tsx` | Renders the map 1:1 and centres a focal point at a given zoom, so overlays can be positioned in **map‑pixel** coordinates. |
| `src/mapConfig.ts` | Geography measured directly from the map image (Britain ellipse, France, ports, ocean colour). |
| `src/components/Barricade.tsx` | The self‑drawing fortified ring + palisade spikes around Britain. |
| `src/components/Fleet.tsx` + `Ship.tsx` | Ships sailing at Britain and being repelled. |
| `src/components/Caption.tsx` | Lower‑third narration bar. |
| `src/components/CompassRose.tsx` | Ocean dressing. |

## Assets & credits

Public‑domain images from Wikimedia Commons, stored in `public/`:

- `napoleon.jpg` — *The Emperor Napoleon in His Study at the Tuileries*, Jacques‑Louis David (1812).
- `napoleon_face.jpg` — *Napoleon Bonaparte* (young officer portrait).
- `map_political.png` — political map of Europe.

The map shows modern borders (used purely as accurate geography); the blockade
itself is stylised. In 1806 Ireland was part of the United Kingdom, so ringing
both islands is historically appropriate.
