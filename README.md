# fretboard-diagram

Guitar fretboard (指板図) diagram generator — for practice, Note/X articles, and video assets.

## Architecture

Three layers, so the image-making logic is reusable independently of any editor:

1. **Data spec (JSON)** — one diagram fully described as plain JSON. See `src/types.ts`.
2. **Rendering core (`renderSvg`)** — a pure function `Diagram → SVG string`. No DOM, no filesystem, no GUI. See `src/render.ts`. Music theory (note names, intervals) is a separate module, `src/theory.ts`.
3. **GUI (planned)** — a local web app that builds the JSON and calls the core.

Because the core is a pure `JSON → SVG` function, it can also be driven headlessly (e.g. by an AI) to generate images from a spec — no GUI needed.

SVG is the primary output: vector, crisp at any size, and convertible to PNG/JPEG at any resolution.

## Usage

### GUI (editor)

```
npm install     # first time only
npm run dev     # opens a local web app (Vite) at http://localhost:5173
```

The editor builds a spec and calls the same rendering core; it has no drawing
logic of its own. Export to SVG / PNG / JPEG, and copy/load the JSON spec.

### Headless (core only)

Node 24+ runs the TypeScript sources directly (no build step).

```
node examples/render-example.ts   # renders examples/*.json into out/*.svg
```

Or from code:

```ts
import { renderSvg } from "./src/index.ts";
const svg = renderSvg(spec);   // spec: Diagram
```

Type-check (optional):

```
npm run typecheck
```

## Diagram spec (summary)

See `src/types.ts` for the authoritative definition. Key fields:

- `tuning.strings` — pitches low → high (e.g. `["E2","A2","D3","G3","B3","E4"]`). Length = string count.
- `frets` — `{ from, to, showFretNumber, showInlay }`. `from: 0` shows the nut and open strings. Max fret 24.
- `markers` — `{ string, fret, type?, root?, color?, label? }`. `string` indexes `tuning.strings` (0 = lowest). `fret: 0` = open; use `type: "open"` or `"mute"`.
- `root` — `{ mode: "pitchClass" | "position" | null, value? }`. Roots get a double ring.
- `notation` — `{ type: "note" | "interval" | "none", accidentals?, noteSpelling?, intervalSpelling? }`. Per-pitch-class note spelling and per-degree interval spelling are supported.
- `capo` — `{ fret }`. Drawn as a bar; markers left of it are ignored.
- `style` — optional color/background overrides.

## Implemented

- Variable tuning and string count; tuning printed on the image.
- Horizontal board, lowest string at the bottom.
- Fret window with max 24; nut as a double line; string overhang when the nut is off-screen.
- Dots, open rings, mute ×; root emphasis (pitch-class or position mode).
- Note names (sharp/flat, per-pitch-class override) or interval labels (per-degree override).
- Inlays: single at 3/5/7/9/15/17/19/21, double at 12/24, light gray.
- Leftmost fret number; capo bar.

## GUI

`index.html` + `gui/` is a dependency-light local web app (Vite + vanilla TS).
Three panels: setup controls, an interactive board, and a live preview with
export. See `gui/main.ts`.

## Library

Diagrams are saved as JSON files under `library/` (one file per diagram:
`{ id, savedAt, diagram }`). The GUI reads/writes them through a small dev-server
API (`vite.config.ts`), so the library is durable on disk, git-friendly, and
readable/writable by an AI — not trapped in browser storage. Filter by title,
tag, or tuning; load or delete from the panel.

## Roadmap

- Capo: reinterpret open-string markers relative to the capo (× at capo position).
- Groups: outline a set of markers with a thick polygon (chord/position shapes).
- Per-note color presets and per-pitch-class spelling UI; richer styling.
- Vertical layout option (data spec is already orientation-neutral).

## Done

- Rendering core (JSON → SVG); music-theory module.
- Local web GUI with interactive board and live preview.
- PNG / JPEG / SVG export at selectable resolution.
- Diagram library: save, tag (chord/scale/mode/tuning/keywords), filter, recall.
