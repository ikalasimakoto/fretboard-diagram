# fretboard-diagram

Guitar fretboard (指板図) diagram generator — for practice and for Note / X
articles and video assets. Build a diagram in a local web editor, or generate
one headlessly from a JSON spec (e.g. by an AI).

## Features

- Any tuning and string count (presets: Standard, FACGCE, 7‑string all‑fourths) — the tuning is printed on the image.
- Adjustable fret window up to 24; nut shown as a double line, with the strings overhanging to the left when the nut is off‑screen.
- Notes as filled dots, open strings as rings, mutes as ×, capo as a bar.
- Root emphasis (double ring), either by pitch class or by a marked position.
- Labels: note names (♯/♭) or intervals — with per‑pitch‑class spelling and per‑degree overrides (e.g. ♯5 vs ♭6, 2 vs 9), and per‑note show/hide.
- Per‑note colors, plus group outlines that enclose a set of notes (chord/position shapes).
- Inlays at 3/5/7/9/15/17/19/21 and double at 12/24.
- Export to SVG / PNG / JPEG at 1×/2×/4×.
- Diagram library on disk: save, tag, filter, and recall.

## Getting started

Requirements: Node 24+ (the app runs the TypeScript sources directly, no build step).

```bash
npm install     # first time only
npm run dev     # starts the editor at http://localhost:5173
```

Open http://localhost:5173 in a browser.

## Using the editor

The window has three columns — **Setup** (left), the interactive **Diagram**
(centre), and **Export** + **JSON** (right) — with the **Library** below.

### Place notes

Click a spot on the diagram to cycle it:

- **Fretted position:** empty → note → (root, only in "By position" mode) → empty.
- **Open string:** empty → open ○ → (root) → mute × → empty.

Use **Clear notes** to remove all of them. Setup sections (Tuning, Frets,
Labels, Root, …) are collapsible to keep the panel short.

### Tuning, frets, capo

Pick a preset or edit each string's pitch (scientific pitch notation, e.g.
`E2`); strings are listed high → low (string 1 = highest). Set the fret window
with **From/To**, toggle fret number and inlays, and set a **Capo** (0 = none).
With a capo, open‑string markers behind it are hidden.

### Labels and root

Choose **note names**, **intervals**, or **nothing**, and ♯/♭ for names. Set the
**Root** by note (every matching pitch class is a root) or by position (mark a
note on the board). For fine control, the **Per‑note** section gives each of the
12 pitch classes its own color, label show/hide, and ♯/♭ spelling; **Interval
labels** overrides the text for each degree (used in interval mode).

### Groups

Click **Select for group**, click the notes to enclose, then **Create group** to
draw a rounded outline around them. Each group has its own color (staged edit
with OK/Cancel) and can be deleted. Add as many as you like.

### Export

Choose a scale (1×/2×/4×) and **Download SVG / PNG / JPEG**. SVG is vector; PNG
and JPEG are rasterized at the chosen scale (JPEG on a white background).

### Library

**Save / update** stores the current diagram; **Save as new** makes a copy.
Cards show a thumbnail, title, and tags — **filter** with comma‑separated terms
(all must match), **sort** by updated / created / name, and **Load** or
**Delete**. Diagrams are saved as JSON files under `library/` (see below).

## Headless / AI use

The rendering core is a pure `Diagram → SVG` function, so a script or an AI can
generate images without the GUI.

```ts
import { renderSvg } from "./src/index.ts";
const svg = renderSvg(spec); // spec: Diagram (see src/types.ts)
```

Render the bundled examples to `out/*.svg`:

```bash
node examples/render-example.ts
```

## Diagram spec

Plain JSON; `src/types.ts` is the authoritative definition. Key fields:

- `tuning.strings` — pitches low → high, e.g. `["E2","A2","D3","G3","B3","E4"]`. Length = string count.
- `frets` — `{ from, to, showFretNumber?, showInlay? }`. `from: 0` shows the nut and open strings; max fret 24.
- `markers` — `{ string, fret, type?, root?, color?, label? }`. `string` indexes `tuning.strings` (0 = lowest); `fret: 0` = open (`type: "open" | "mute"`).
- `root` — `{ mode: "pitchClass" | "position" | null, value? }`.
- `notation` — `{ type: "note" | "interval" | "none", accidentals?, noteSpelling?, intervalSpelling?, noteColor?, labelVisible? }` (the last four keyed by pitch class 0–11, or by semitones‑from‑root for `intervalSpelling`).
- `capo` — `{ fret }`. Positions behind it are hidden.
- `groups` — `[{ id, markers: [{string, fret}], color? }]`.
- `style` — optional color/background overrides.

## Architecture

Three layers, so the image logic is independent of any editor:

1. **Data spec (JSON)** — `src/types.ts`.
2. **Rendering core** — `renderSvg(diagram) → SVG string`; pure, no DOM/filesystem. `src/render.ts`, with music theory in `src/theory.ts` and group geometry in `src/group.ts`.
3. **GUI** — a dependency‑light local web app (Vite + vanilla TS) that builds the spec and calls the core. `index.html` + `gui/`.

SVG is the primary output: vector, crisp at any size, and easy to rasterize.

## Project layout

```
src/            rendering core (types, theory, group geometry, render, index)
gui/            web editor (main.ts, library client, styles)
examples/       sample specs + a render script
library/        saved diagrams (*.json, gitignored; folder kept via .gitkeep)
vite.config.ts  dev server + the library file API
```

The library is persisted on disk by a small dev‑server API in `vite.config.ts`
(GET/PUT/DELETE `/api/library`). Saved diagrams (`library/*.json`) are
**gitignored by default** so personal work stays local; remove that line in
`.gitignore` if you want to version them.

## Development

```bash
npm run typecheck   # tsc --noEmit over src + gui + examples
npm run build       # production build (Vite) into dist/
npm run preview     # serve the production build
```

## Roadmap

- Vertical layout option (the data spec is already orientation‑neutral).
