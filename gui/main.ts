// Fretboard Diagram Editor — GUI.
//
// The GUI only builds a Diagram spec and calls the rendering core. It holds no
// drawing logic of its own; everything visual comes from renderSvg().

import { renderSvg } from "../src/render.ts";
import { pitchClassOf, noteName } from "../src/theory.ts";
import type { Diagram, Marker } from "../src/types.ts";

const TUNING_PRESETS: Record<string, string[]> = {
  Standard: ["E2", "A2", "D3", "G3", "B3", "E4"],
  FACGCE: ["F2", "A2", "C3", "G3", "C4", "E4"],
  "7-string all-4ths": ["E1", "A1", "D2", "G2", "C3", "F3", "Bb3"],
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const state: Diagram = {
  version: 1,
  meta: { title: "", tags: [] },
  tuning: { name: "Standard", strings: [...TUNING_PRESETS.Standard] },
  frets: { from: 0, to: 4, showFretNumber: true, showInlay: true },
  capo: null,
  root: { mode: "pitchClass", value: "C" },
  notation: { type: "note", accidentals: "sharp" },
  markers: [],
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Marker helpers ----------

function findMarker(stringIdx: number, fret: number): Marker | undefined {
  return state.markers.find((m) => m.string === stringIdx && m.fret === fret);
}

function cycleMarker(stringIdx: number, fret: number): void {
  const i = state.markers.findIndex((m) => m.string === stringIdx && m.fret === fret);
  const existing = i >= 0 ? state.markers[i] : null;

  if (fret === 0) {
    // empty -> open -> mute -> empty
    if (!existing) state.markers.push({ string: stringIdx, fret: 0, type: "open" });
    else if (existing.type === "open") existing.type = "mute";
    else state.markers.splice(i, 1);
  } else {
    // empty -> note -> root -> empty
    if (!existing) state.markers.push({ string: stringIdx, fret, type: "dot" });
    else if (!existing.root) existing.root = true;
    else state.markers.splice(i, 1);
  }
  renderAll();
}

// ---------- Board editor ----------

function cellGlyph(m: Marker | undefined): { text: string; cls: string } {
  if (!m) return { text: "", cls: "" };
  if (m.type === "mute") return { text: "×", cls: "on" };
  if (m.type === "open") return { text: "○", cls: "on" };
  if (m.root) return { text: "◎", cls: "root" };
  return { text: "●", cls: "on" };
}

function buildBoardEditor(): void {
  const n = state.tuning.strings.length;
  const from = state.frets.from;
  const to = Math.min(state.frets.to, 24);
  const showOpen = from === 0;

  const table = document.createElement("table");
  table.className = "board";

  // Header: fret numbers.
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  htr.appendChild(document.createElement("th")); // corner (string label col)
  if (showOpen) {
    const th = document.createElement("th");
    th.textContent = "0";
    htr.appendChild(th);
  }
  for (let f = Math.max(1, from); f <= to; f++) {
    const th = document.createElement("th");
    th.textContent = String(f);
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);

  // Rows: strings high (top) -> low (bottom).
  const tbody = document.createElement("tbody");
  for (let i = n - 1; i >= 0; i--) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.className = "strlabel";
    label.textContent = state.tuning.strings[i];
    tr.appendChild(label);

    const cols: number[] = [];
    if (showOpen) cols.push(0);
    for (let f = Math.max(1, from); f <= to; f++) cols.push(f);

    for (const f of cols) {
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      const g = cellGlyph(findMarker(i, f));
      btn.className = `cell ${g.cls}`;
      btn.textContent = g.text;
      btn.title = `string ${i + 1} (${state.tuning.strings[i]}), fret ${f}`;
      btn.addEventListener("click", () => cycleMarker(i, f));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const host = $("board-editor");
  host.replaceChildren(table);
}

// ---------- Tuning editor ----------

function buildTuningEditor(): void {
  const host = $("tuning-strings");
  host.replaceChildren();
  state.tuning.strings.forEach((pitch, idx) => {
    const row = document.createElement("div");
    row.className = "tstr";
    const label = document.createElement("label");
    label.textContent = idx === 0 ? "1 (lowest)" : `${idx + 1}`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = pitch;
    input.addEventListener("change", () => {
      try {
        pitchClassOf(input.value); // validate
        state.tuning.strings[idx] = input.value.trim();
        renderAll();
      } catch {
        input.value = state.tuning.strings[idx]; // revert
      }
    });
    row.append(label, input);
    host.appendChild(row);
  });
}

// ---------- Root note dropdown ----------

function buildRootValueOptions(): void {
  const sel = $<HTMLSelectElement>("root-value");
  sel.replaceChildren();
  for (const pc of PITCH_CLASSES) {
    const o = document.createElement("option");
    o.value = pc;
    o.textContent = pc;
    sel.appendChild(o);
  }
  sel.value = state.root?.value ?? "C";
}

// ---------- Sync controls <- state ----------

function syncControls(): void {
  $<HTMLInputElement>("title").value = state.meta?.title ?? "";
  $<HTMLInputElement>("tags").value = (state.meta?.tags ?? []).join(", ");
  $<HTMLInputElement>("tuning-name").value = state.tuning.name;
  $<HTMLInputElement>("fret-from").value = String(state.frets.from);
  $<HTMLInputElement>("fret-to").value = String(state.frets.to);
  $<HTMLInputElement>("show-fretnum").checked = state.frets.showFretNumber ?? true;
  $<HTMLInputElement>("show-inlay").checked = state.frets.showInlay ?? true;
  $<HTMLInputElement>("capo").value = String(state.capo?.fret ?? 0);
  $<HTMLSelectElement>("notation-type").value = state.notation?.type ?? "note";
  $<HTMLSelectElement>("accidentals").value = state.notation?.accidentals ?? "sharp";
  $<HTMLSelectElement>("root-mode").value = state.root?.mode == null ? "null" : state.root.mode;
  $<HTMLSelectElement>("root-value").value = state.root?.value ?? "C";

  // Conditional visibility.
  $("acc-field").style.display = state.notation?.type === "note" ? "" : "none";
  const mode = state.root?.mode;
  $("root-value-field").style.display = mode === "pitchClass" ? "" : "none";
  const hint =
    mode === "pitchClass"
      ? "Every note of this pitch class is drawn as a root (double ring)."
      : mode === "position"
        ? "Cycle a fretted cell to its root state (◎) to mark the root."
        : "No root emphasis.";
  $("root-hint").textContent = hint;
}

// ---------- Render everything ----------

function renderAll(): void {
  $("preview").innerHTML = renderSvg(state);
  buildBoardEditor();
  $<HTMLTextAreaElement>("json").value = JSON.stringify(state, null, 2);
}

// ---------- Export ----------

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(): string {
  const t = (state.meta?.title || "fretboard").trim().toLowerCase();
  return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "fretboard";
}

function downloadSvg(): void {
  downloadBlob(new Blob([renderSvg(state)], { type: "image/svg+xml" }), `${baseName()}.svg`);
}

async function downloadRaster(type: "image/png" | "image/jpeg"): Promise<void> {
  const scale = Number($<HTMLSelectElement>("export-scale").value) || 1;
  const svg = renderSvg(state);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("SVG load failed"));
    img.src = svgUrl;
  });
  const w = (img.naturalWidth || img.width) * scale;
  const h = (img.naturalHeight || img.height) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(svgUrl);
  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, `${baseName()}.${type === "image/png" ? "png" : "jpg"}`);
    },
    type,
    0.95,
  );
}

// ---------- Wire up controls ----------

function initControls(): void {
  // Tuning preset dropdown.
  const presetSel = $<HTMLSelectElement>("tuning-preset");
  presetSel.replaceChildren();
  for (const name of Object.keys(TUNING_PRESETS)) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    presetSel.appendChild(o);
  }
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "Custom";
  presetSel.appendChild(custom);
  presetSel.value = "Standard";

  presetSel.addEventListener("change", () => {
    const name = presetSel.value;
    if (name !== "__custom__") {
      state.tuning.name = name;
      state.tuning.strings = [...TUNING_PRESETS[name]];
      state.markers = [];
      buildTuningEditor();
      syncControls();
      renderAll();
    }
  });

  $<HTMLInputElement>("title").addEventListener("input", (e) => {
    state.meta = { ...state.meta, title: (e.target as HTMLInputElement).value };
    renderAll();
  });
  $<HTMLInputElement>("tags").addEventListener("input", (e) => {
    const tags = (e.target as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean);
    state.meta = { ...state.meta, tags };
    $<HTMLTextAreaElement>("json").value = JSON.stringify(state, null, 2);
  });
  $<HTMLInputElement>("tuning-name").addEventListener("input", (e) => {
    state.tuning.name = (e.target as HTMLInputElement).value;
    renderAll();
  });

  $("add-string").addEventListener("click", () => {
    const last = state.tuning.strings[state.tuning.strings.length - 1] ?? "E4";
    state.tuning.strings.push(last);
    presetSel.value = "__custom__";
    buildTuningEditor();
    renderAll();
  });
  $("remove-string").addEventListener("click", () => {
    if (state.tuning.strings.length <= 1) return;
    const removed = state.tuning.strings.length - 1;
    state.tuning.strings.pop();
    state.markers = state.markers.filter((m) => m.string !== removed);
    presetSel.value = "__custom__";
    buildTuningEditor();
    renderAll();
  });

  $<HTMLInputElement>("fret-from").addEventListener("change", (e) => {
    let v = Math.max(0, Math.min(24, Number((e.target as HTMLInputElement).value) || 0));
    if (v > state.frets.to) v = state.frets.to;
    state.frets.from = v;
    syncControls();
    renderAll();
  });
  $<HTMLInputElement>("fret-to").addEventListener("change", (e) => {
    let v = Math.max(1, Math.min(24, Number((e.target as HTMLInputElement).value) || 1));
    if (v < state.frets.from) v = state.frets.from;
    state.frets.to = v;
    syncControls();
    renderAll();
  });
  $<HTMLInputElement>("show-fretnum").addEventListener("change", (e) => {
    state.frets.showFretNumber = (e.target as HTMLInputElement).checked;
    renderAll();
  });
  $<HTMLInputElement>("show-inlay").addEventListener("change", (e) => {
    state.frets.showInlay = (e.target as HTMLInputElement).checked;
    renderAll();
  });
  $<HTMLInputElement>("capo").addEventListener("change", (e) => {
    const f = Math.max(0, Math.min(24, Number((e.target as HTMLInputElement).value) || 0));
    state.capo = f > 0 ? { fret: f } : null;
    renderAll();
  });

  $<HTMLSelectElement>("notation-type").addEventListener("change", (e) => {
    state.notation = { ...state.notation, type: (e.target as HTMLSelectElement).value as "note" | "interval" | "none" };
    syncControls();
    renderAll();
  });
  $<HTMLSelectElement>("accidentals").addEventListener("change", (e) => {
    state.notation = { ...state.notation, type: state.notation?.type ?? "note", accidentals: (e.target as HTMLSelectElement).value as "sharp" | "flat" };
    renderAll();
  });

  $<HTMLSelectElement>("root-mode").addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    state.root = v === "null" ? { mode: null } : { mode: v as "pitchClass" | "position", value: state.root?.value ?? "C" };
    syncControls();
    renderAll();
  });
  $<HTMLSelectElement>("root-value").addEventListener("change", (e) => {
    state.root = { mode: "pitchClass", value: (e.target as HTMLSelectElement).value };
    renderAll();
  });

  $("dl-svg").addEventListener("click", downloadSvg);
  $("dl-png").addEventListener("click", () => void downloadRaster("image/png"));
  $("dl-jpg").addEventListener("click", () => void downloadRaster("image/jpeg"));

  $("copy-json").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
  });
  $("load-json").addEventListener("click", () => {
    try {
      const parsed = JSON.parse($<HTMLTextAreaElement>("json").value) as Diagram;
      Object.assign(state, parsed);
      buildTuningEditor();
      buildRootValueOptions();
      syncControls();
      renderAll();
    } catch (err) {
      alert(`Invalid JSON: ${(err as Error).message}`);
    }
  });
}

// ---------- Boot ----------

function seedExample(): void {
  // A friendly default so the board isn't empty on first load.
  state.meta = { title: "C major — open position", tags: ["scale", "C major"] };
  state.markers = [
    { string: 0, fret: 0, type: "open" },
    { string: 0, fret: 1 },
    { string: 0, fret: 3 },
    { string: 1, fret: 0, type: "open" },
    { string: 1, fret: 2 },
    { string: 1, fret: 3 },
    { string: 2, fret: 0, type: "open" },
    { string: 2, fret: 2 },
    { string: 4, fret: 1 },
    { string: 5, fret: 0, type: "open" },
    { string: 5, fret: 1 },
  ];
}

seedExample();
initControls();
buildTuningEditor();
buildRootValueOptions();
syncControls();
renderAll();

// Keep the unused import honest (noteName is exported for future per-note UI).
void noteName;
