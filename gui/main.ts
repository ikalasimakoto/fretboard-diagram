// Fretboard Diagram Editor — GUI.
//
// The GUI only builds a Diagram spec and calls the rendering core. It holds no
// drawing logic of its own; everything visual comes from renderSvg().

import { renderSvg } from "../src/render.ts";
import { pitchClassOf, DEFAULT_INTERVALS } from "../src/theory.ts";
import type { Diagram, NotationConfig } from "../src/types.ts";
import {
  listLibrary,
  saveLibrary,
  deleteLibrary,
  makeId,
  type StoredDiagram,
} from "./library.ts";

const TUNING_PRESETS: Record<string, string[]> = {
  Standard: ["E2", "A2", "D3", "G3", "B3", "E4"],
  FACGCE: ["F2", "A2", "C3", "G3", "C4", "E4"],
  "7-string all-4ths": ["E1", "A1", "D2", "G2", "C3", "F3", "Bb3"],
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Pitch classes with two common spellings (sharp, flat).
const ACCIDENTAL_ALTS: Record<number, [string, string]> = {
  1: ["C#", "Db"],
  3: ["D#", "Eb"],
  6: ["F#", "Gb"],
  8: ["G#", "Ab"],
  10: ["A#", "Bb"],
};

/** Display name for a pitch class given current spelling overrides + global accidentals. */
function displayNoteName(pc: number): string {
  const not = state.notation;
  const override = not?.noteSpelling?.[pc];
  if (override) return override;
  return (not?.accidentals ?? "sharp") === "flat" ? FLAT_NAMES[pc] : PITCH_CLASSES[pc];
}

const state: Diagram = {
  version: 1,
  meta: { title: "", tags: [] },
  tuning: { name: "Standard", strings: [...TUNING_PRESETS.Standard] },
  frets: { from: 0, to: 4, showFretNumber: true, showInlay: true },
  capo: null,
  root: { mode: "pitchClass", value: "C" },
  notation: { type: "note", accidentals: "sharp" },
  markers: [],
  groups: [],
};

const GROUP_PALETTE = ["#2b6cb0", "#c0392b", "#2e7d32", "#8e44ad", "#d97706", "#0891b2"];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Marker helpers ----------

function cycleMarker(stringIdx: number, fret: number): void {
  const i = state.markers.findIndex((m) => m.string === stringIdx && m.fret === fret);
  const existing = i >= 0 ? state.markers[i] : null;
  // The root (◎) step only exists in "By position" mode — in the other modes the
  // root is decided by pitch class (or off), so cycling through it looks like a
  // no-op. There we skip straight past it.
  const positionMode = state.root?.mode === "position";

  if (fret === 0) {
    // empty -> open -> [open+root] -> mute -> empty
    if (!existing) state.markers.push({ string: stringIdx, fret: 0, type: "open" });
    else if (existing.type === "mute") state.markers.splice(i, 1);
    else if (existing.root) {
      existing.type = "mute";
      existing.root = false;
    } else if (positionMode) existing.root = true;
    else existing.type = "mute";
  } else {
    // empty -> note -> [root] -> empty
    if (!existing) state.markers.push({ string: stringIdx, fret, type: "dot" });
    else if (existing.root) state.markers.splice(i, 1);
    else if (positionMode) existing.root = true;
    else state.markers.splice(i, 1);
  }
  renderAll();
}

// ---------- Tuning editor ----------

function buildTuningEditor(): void {
  const host = $("tuning-strings");
  host.replaceChildren();
  const n = state.tuning.strings.length;
  // Show highest string on top (numbered 1) down to the lowest (numbered n).
  for (let idx = n - 1; idx >= 0; idx--) {
    const row = document.createElement("div");
    row.className = "tstr";
    const label = document.createElement("label");
    label.textContent = idx === 0 ? `${n} (lowest)` : `${n - idx}`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = state.tuning.strings[idx];
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
  }
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

// ---------- Per-note settings (12 pitch classes) ----------

let editingNotePc: number | null = null;
let editingNoteOriginal: string | undefined;

function notation(): NotationConfig {
  return (state.notation ??= { type: "note" });
}

function buildPerNote(): void {
  const host = $("per-note");
  host.replaceChildren();
  const not = notation();
  for (let pc = 0; pc < 12; pc++) {
    const row = document.createElement("div");
    row.className = "pn-row";

    const name = document.createElement("span");
    name.className = "pn-name";
    name.textContent = displayNoteName(pc);

    // Show / hide this pitch class's label.
    const show = document.createElement("input");
    show.type = "checkbox";
    show.title = "Show label";
    show.checked = not.labelVisible?.[pc] !== false;
    show.addEventListener("change", () => {
      not.labelVisible ??= {};
      if (show.checked) delete not.labelVisible[pc];
      else not.labelVisible[pc] = false;
      renderPreview();
    });

    // ♯/♭ spelling (accidental pitch classes only).
    const spellCell = document.createElement("span");
    spellCell.className = "pn-spell";
    const alts = ACCIDENTAL_ALTS[pc];
    if (alts) {
      const sel = document.createElement("select");
      for (const opt of alts) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = displayNoteName(pc);
      sel.addEventListener("change", () => {
        not.noteSpelling ??= {};
        not.noteSpelling[pc] = sel.value;
        name.textContent = sel.value;
        renderPreview();
      });
      spellCell.appendChild(sel);
    }

    // Color: swatch that opens an inline editor with live preview + OK/Cancel.
    const colorCell = document.createElement("span");
    colorCell.className = "pn-color";
    if (editingNotePc === pc) {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.className = "grp-picker";
      picker.value = not.noteColor?.[pc] ?? "#222222";
      picker.addEventListener("input", () => {
        (not.noteColor ??= {})[pc] = picker.value;
        renderPreview();
      });
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "OK";
      ok.addEventListener("click", () => {
        editingNotePc = null;
        buildPerNote();
      });
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ghost";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        if (editingNoteOriginal === undefined) delete not.noteColor?.[pc];
        else (not.noteColor ??= {})[pc] = editingNoteOriginal;
        editingNotePc = null;
        buildPerNote();
        renderPreview();
      });
      const def = document.createElement("button");
      def.type = "button";
      def.className = "ghost";
      def.textContent = "Default";
      def.addEventListener("click", () => {
        delete not.noteColor?.[pc];
        editingNotePc = null;
        buildPerNote();
        renderPreview();
      });
      colorCell.append(picker, ok, cancel, def);
    } else {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "grp-swatch";
      swatch.style.background = not.noteColor?.[pc] ?? "#222222";
      swatch.title = not.noteColor?.[pc] ? "Custom color — click to change" : "Default color — click to set";
      if (!not.noteColor?.[pc]) swatch.classList.add("pn-default");
      swatch.addEventListener("click", () => {
        editingNotePc = pc;
        editingNoteOriginal = not.noteColor?.[pc];
        buildPerNote();
      });
      colorCell.appendChild(swatch);
    }

    row.append(name, show, spellCell, colorCell);
    host.appendChild(row);
  }
}

function buildIntervalLabels(): void {
  const host = $("interval-labels");
  host.replaceChildren();
  const not = notation();
  for (let deg = 0; deg < 12; deg++) {
    const row = document.createElement("div");
    row.className = "il-row";
    const lbl = document.createElement("span");
    lbl.className = "il-label";
    lbl.textContent = `${deg} st · ${DEFAULT_INTERVALS[deg]}`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = not.intervalSpelling?.[deg] ?? "";
    input.placeholder = DEFAULT_INTERVALS[deg];
    input.addEventListener("change", () => {
      const v = input.value.trim();
      not.intervalSpelling ??= {};
      if (v && v !== DEFAULT_INTERVALS[deg]) not.intervalSpelling[deg] = v;
      else delete not.intervalSpelling[deg];
      renderPreview();
    });
    row.append(lbl, input);
    host.appendChild(row);
  }
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

/** Redraw the diagram + JSON only (leaves the group list DOM intact). */
function renderPreview(): void {
  $("preview").innerHTML = renderSvg(state, { interactive: true });
  if (groupSelect) markSelectedHits();
  $<HTMLTextAreaElement>("json").value = JSON.stringify(state, null, 2);
}

function renderAll(): void {
  renderPreview();
  renderGroups();
}

/** Replace the working diagram (from JSON paste or the library) and refresh the UI. */
function loadDiagram(d: Diagram): void {
  const src = structuredClone(d);
  state.version = src.version ?? 1;
  state.meta = src.meta ?? { title: "", tags: [] };
  state.tuning = src.tuning;
  state.frets = src.frets;
  state.capo = src.capo ?? null;
  state.root = src.root ?? { mode: "pitchClass", value: "C" };
  state.notation = src.notation ?? { type: "note", accidentals: "sharp" };
  state.markers = src.markers ?? [];
  state.groups = src.groups ?? [];
  state.style = src.style;
  editingNotePc = null;
  buildTuningEditor();
  buildRootValueOptions();
  buildPerNote();
  buildIntervalLabels();
  syncControls();
  renderAll();
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
    // Mutate in place so per-note/interval row handlers keep a valid reference.
    notation().type = (e.target as HTMLSelectElement).value as "note" | "interval" | "none";
    syncControls();
    renderAll();
  });
  $<HTMLSelectElement>("accidentals").addEventListener("change", (e) => {
    notation().accidentals = (e.target as HTMLSelectElement).value as "sharp" | "flat";
    buildPerNote(); // default spellings shown per-note follow the global choice
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

  // Click the diagram: place/cycle notes, or (in group-select mode) toggle
  // membership of the clicked note in the pending group.
  $("preview").addEventListener("click", (e) => {
    const hit = (e.target as Element).closest?.(".hit");
    if (!hit) return;
    const s = Number(hit.getAttribute("data-string"));
    const f = Number(hit.getAttribute("data-fret"));
    if (groupSelect) toggleSelection(s, f, hit as SVGElement);
    else cycleMarker(s, f);
  });

  initGroups();

  $("clear-all").addEventListener("click", () => {
    state.markers = [];
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
      loadDiagram(parsed);
      currentId = null; // pasted JSON is a fresh, unsaved diagram
    } catch (err) {
      alert(`Invalid JSON: ${(err as Error).message}`);
    }
  });

  initLibrary();
}

// ---------- Library (save / tag / recall) ----------

let currentId: string | null = null;
let libraryCache: StoredDiagram[] = [];

function haystack(it: StoredDiagram): string {
  const d = it.diagram;
  return [d.meta?.title, d.tuning?.name, ...(d.meta?.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** AND match: every comma-separated term must appear. */
function matchesFilter(it: StoredDiagram, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = haystack(it);
  return terms.every((t) => hay.includes(t));
}

function sortItems(items: StoredDiagram[]): StoredDiagram[] {
  const mode = $<HTMLSelectElement>("lib-sort").value;
  const copy = [...items];
  if (mode === "name") {
    copy.sort((a, b) =>
      (a.diagram.meta?.title ?? "").localeCompare(b.diagram.meta?.title ?? "", undefined, {
        sensitivity: "base",
      }),
    );
  } else if (mode === "created") {
    copy.sort((a, b) => String(b.createdAt ?? b.savedAt).localeCompare(String(a.createdAt ?? a.savedAt)));
  } else {
    copy.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  return copy;
}

function renderLibrary(): void {
  const host = $("lib-list");
  host.replaceChildren();
  const terms = $<HTMLInputElement>("lib-search")
    .value.toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const items = sortItems(libraryCache.filter((it) => matchesFilter(it, terms)));

  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = libraryCache.length ? "No matches." : "No saved diagrams yet.";
    host.appendChild(p);
    return;
  }

  for (const it of items) {
    const card = document.createElement("div");
    card.className = `lib-card${it.id === currentId ? " active" : ""}`;

    const thumb = document.createElement("div");
    thumb.className = "lib-thumb";
    try {
      thumb.innerHTML = renderSvg(it.diagram);
    } catch {
      thumb.textContent = "—";
    }

    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = it.diagram.meta?.title || "(untitled)";

    const meta = document.createElement("div");
    meta.className = "lib-meta";
    meta.textContent = [it.diagram.tuning?.name, ...(it.diagram.meta?.tags ?? [])]
      .filter(Boolean)
      .join(" · ");

    const actions = document.createElement("div");
    actions.className = "lib-actions";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => {
      loadDiagram(it.diagram);
      currentId = it.id;
      renderLibrary();
      setStatus(`Loaded "${it.diagram.meta?.title || it.id}".`);
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ghost danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Delete "${it.diagram.meta?.title || it.id}"?`)) return;
      await deleteLibrary(it.id);
      if (currentId === it.id) currentId = null;
      await reloadLibrary();
      setStatus("Deleted.");
    });
    actions.append(loadBtn, delBtn);

    card.append(thumb, title, meta, actions);
    host.appendChild(card);
  }
}

async function reloadLibrary(): Promise<void> {
  try {
    libraryCache = await listLibrary();
    renderLibrary();
  } catch {
    setStatus("Library API unavailable (run with `npm run dev`).");
  }
}

function setStatus(msg: string): void {
  $("lib-status").textContent = msg;
}

function initLibrary(): void {
  $("lib-search").addEventListener("input", renderLibrary);
  $("lib-sort").addEventListener("change", renderLibrary);

  $("lib-save").addEventListener("click", async () => {
    const id = currentId ?? makeId(state.meta?.title ?? "");
    try {
      await saveLibrary(id, state);
      currentId = id;
      await reloadLibrary();
      setStatus(`Saved "${state.meta?.title || id}".`);
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    }
  });

  $("lib-save-new").addEventListener("click", async () => {
    const id = makeId(state.meta?.title ?? "");
    try {
      await saveLibrary(id, state);
      currentId = id;
      await reloadLibrary();
      setStatus(`Saved a new copy "${state.meta?.title || id}".`);
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    }
  });

  void reloadLibrary();
}

// ---------- Groups (outline sets of notes) ----------

let groupSelect = false;
const selected = new Set<string>(); // keys "s:f"

function markerExists(s: number, f: number): boolean {
  return state.markers.some((m) => m.string === s && m.fret === f);
}

/** Re-apply the "selected" class to hit targets after a re-render. */
function markSelectedHits(): void {
  for (const key of selected) {
    const [s, f] = key.split(":");
    const el = document.querySelector(`#preview svg .hit[data-string="${s}"][data-fret="${f}"]`);
    el?.classList.add("selected");
  }
}

function toggleSelection(s: number, f: number, el: SVGElement): void {
  if (!markerExists(s, f)) return; // only notes can be grouped
  const key = `${s}:${f}`;
  if (selected.has(key)) {
    selected.delete(key);
    el.classList.remove("selected");
  } else {
    selected.add(key);
    el.classList.add("selected");
  }
  $<HTMLButtonElement>("grp-create").textContent = `Create group (${selected.size})`;
}

function enterGroupSelect(): void {
  groupSelect = true;
  selected.clear();
  $("preview").classList.add("selecting");
  $("grp-select").hidden = true;
  $<HTMLButtonElement>("grp-create").hidden = false;
  $<HTMLButtonElement>("grp-create").textContent = "Create group (0)";
  $("grp-cancel").hidden = false;
  $("diagram-hint").textContent = "Group mode: click notes to select, then Create group.";
}

function exitGroupSelect(): void {
  groupSelect = false;
  selected.clear();
  $("preview").classList.remove("selecting");
  $("grp-select").hidden = false;
  $("grp-create").hidden = true;
  $("grp-cancel").hidden = true;
  $("diagram-hint").textContent =
    "Click the diagram to place/cycle notes (fretted → note; open string → open → mute). In “By position” root mode, an extra click marks a root (◎).";
  renderAll(); // clears selection highlight
}

function createGroupFromSelection(): void {
  if (selected.size === 0) {
    exitGroupSelect();
    return;
  }
  const markers = [...selected].map((k) => {
    const [s, f] = k.split(":").map(Number);
    return { string: s, fret: f };
  });
  const color = GROUP_PALETTE[(state.groups?.length ?? 0) % GROUP_PALETTE.length];
  (state.groups ??= []).push({ id: `g${Date.now().toString(36)}`, markers, color });
  exitGroupSelect();
}

let editingGroupIdx: number | null = null;
let editingOriginalColor: string | null = null;

function renderGroups(): void {
  const host = $("grp-list");
  host.replaceChildren();
  const groups = state.groups ?? [];
  groups.forEach((g, idx) => {
    const row = document.createElement("div");
    row.className = "grp-row";

    const nn = g.markers.length;
    const label = document.createElement("span");
    label.className = "grp-label";
    label.textContent = `Group ${idx + 1} · ${nn} note${nn === 1 ? "" : "s"}`;

    if (editingGroupIdx === idx) {
      // Editing: adjust the color live, commit with OK, revert with Cancel.
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = g.color ?? "#2b6cb0";
      picker.className = "grp-picker";
      picker.addEventListener("input", () => {
        g.color = picker.value;
        renderPreview(); // live preview without rebuilding this row
      });

      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "OK";
      ok.addEventListener("click", () => {
        editingGroupIdx = null;
        editingOriginalColor = null;
        renderAll();
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ghost";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        g.color = editingOriginalColor;
        editingGroupIdx = null;
        editingOriginalColor = null;
        renderAll();
      });

      row.append(picker, label, ok, cancel);
    } else {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "grp-swatch";
      swatch.style.background = g.color ?? "#2b6cb0";
      swatch.title = "Change outline color";
      swatch.addEventListener("click", () => {
        editingGroupIdx = idx;
        editingOriginalColor = g.color ?? "#2b6cb0";
        renderAll();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        state.groups?.splice(idx, 1);
        renderAll();
      });

      row.append(swatch, label, del);
    }
    host.appendChild(row);
  });
}

function initGroups(): void {
  $("grp-select").addEventListener("click", enterGroupSelect);
  $("grp-cancel").addEventListener("click", exitGroupSelect);
  $("grp-create").addEventListener("click", createGroupFromSelection);
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
buildPerNote();
buildIntervalLabels();
syncControls();
renderAll();
