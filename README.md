# fretboard-diagram

Guitar fretboard (指板図) diagram generator — for practice and for Note / X
articles and video assets. Build a diagram in a local web editor, or generate
one headlessly from a JSON spec (e.g. by an AI).

Live (static version): https://macotoikarashi.github.io/fretboard-diagram/ —
rebuilt and published by GitHub Actions on every push to `main`.

## Features

- Any tuning and string count — the tuning is printed on the image. Tuning templates (Standard plus your own) can be added and removed; Standard is kept.
- Adjustable fret window up to 24; nut shown as a double line, with the strings overhanging to the left when the nut is off‑screen.
- Notes as filled dots, open strings as rings, mutes as ×, capo as a bar.
- Root emphasis (double ring), either by pitch class or by a marked position.
- Labels: note names (♯/♭) or intervals — with per‑pitch‑class spelling and per‑degree overrides (e.g. ♯5 vs ♭6, 2 vs 9), and per‑note show/hide.
- Per‑note colors, plus group outlines that enclose a set of notes (chord/position shapes).
- Inlays at 3/5/7/9/15/17/19/21 and double at 12/24.
- Export to SVG / PNG / JPEG at 1×/2×/4×.
- Diagram library: save, tag, filter, and recall (on disk with `npm run dev`, in the browser on the static site), with JSON export/import.

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

Pick a template or edit each string's pitch (scientific pitch notation, e.g.
`E2`); strings are listed high → low (string 1 = highest). **Add to templates**
saves the current tuning (by its name) as a reusable template; **Remove from
templates** deletes the selected one. Standard cannot be removed. Set the fret
window with **From/To**, toggle fret number and inlays, and set a **Capo**
(0 = none). With a capo, open‑string markers behind it are hidden.

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
**Export library (JSON)** writes every saved diagram to one file; **Import…**
adds the diagrams from such a file (an entry with the same id replaces the
saved one).

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
gui/            web editor (main.ts, storage client for files or browser, styles)
examples/       sample specs + a render script
library/        saved diagrams (*.json, gitignored; folder kept via .gitkeep)
config/         tuning templates (tunings.json, gitignored; folder kept via .gitkeep)
vite.config.ts  dev server + the library and tunings file APIs
```

The library and the tuning templates are persisted on disk by small dev‑server
APIs in `vite.config.ts` (GET/PUT/DELETE `/api/library`, GET/PUT `/api/tunings`).
Saved diagrams (`library/*.json`) and tuning templates (`config/tunings.json`)
are **gitignored by default** so personal work stays local; remove those lines in
`.gitignore` if you want to version them.

## Static build (no server)

```bash
npm run build   # writes dist/, which any static host can serve
```

The static build has no dev server, so saved diagrams and tuning templates live
in the browser's localStorage instead of `library/` and `config/`. Each browser
keeps its own copy; **Export library (JSON)** and **Import…** move diagrams
between devices (and between the static site and the Mac's `library/`). Asset
paths are relative, so `dist/` works under a sub-path such as GitHub Pages'
`/fretboard-diagram/`.

## Development

```bash
npm run typecheck   # tsc --noEmit over src + gui + examples
npm run build       # production build (Vite) into dist/
npm run preview     # serve the production build
```

## Roadmap

- Vertical layout option (the data spec is already orientation‑neutral).

## License and use / ライセンスと利用について

- **Images you make with fretboard-diagram** (circles, diagrams, exports) are free to use
  anywhere — blogs, videos, teaching material, paid articles, monetized videos
  and other commercial work. No permission or credit is needed; it's nice to
  hear when you use it, but that's optional.
- **The source code** is under the [MIT License](LICENSE): use, modify and
  redistribute it freely, keeping the copyright and license notice in copies of
  the code.
- No warranty: the analysis may contain mistakes, and data saved in the browser
  can be lost — keep a copy with Export.

日本語：このアプリで作った画像は、ブログ・動画・教材・有料記事・収益化した動画など、
商用を含めて自由に使えます。連絡もクレジット表記も不要です（使ったら教えてもらえると
嬉しいです）。ソースコードは MIT ライセンスです。内容の正確さは保証しません。ブラウザに
保存したデータは消えることがあるので、Export で控えを取ってください。

## Author

Made by **ikalasimakoto**, who makes music as **dadzijuwha** (a solo project).
Music and links: https://linktr.ee/dadzijuwha
