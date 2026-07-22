// Rendering core: Diagram spec -> SVG string.
//
// Pure and side-effect free: give it a spec, get back an SVG string. No DOM,
// no filesystem, no GUI. A GUI or a headless script can both call this.

import type { Diagram, Marker } from "./types.ts";
import { pitchClassOf, noteName, intervalName } from "./theory.ts";

interface Style {
  fretSpacing: number;
  stringSpacing: number;
  noteRadius: number;
  marginTop: number;
  marginLeft: number;
  marginRight: number;
  openZone: number;
  nutGap: number;
  openGap: number;
  overhang: number;
  topGap: number;
  bottomGap: number;
  minTitleWidth: number;
  background: "transparent" | "white";
  lineColor: string;
  dotColor: string;
  rootColor: string;
  inlayColor: string;
  capoColor: string;
  textOnDot: string;
  font: string;
}

const DEFAULTS: Style = {
  fretSpacing: 58,
  stringSpacing: 34,
  noteRadius: 12,
  marginTop: 16,
  marginLeft: 16,
  marginRight: 24,
  openZone: 42,
  nutGap: 4,
  openGap: 6,
  overhang: 12,
  topGap: 12,
  bottomGap: 14,
  minTitleWidth: 260,
  background: "transparent",
  lineColor: "#222222",
  dotColor: "#222222",
  rootColor: "#c0392b",
  inlayColor: "#cfcfcf",
  capoColor: "#6e6e6e",
  textOnDot: "#ffffff",
  font: "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
};

const TITLE_SIZE = 18;
const TITLE_LINE_H = 24;
const TITLE_CHAR_W = 10.2; // rough px/char for the title font
const CAPTION_SIZE = 12;
const CAPTION_CHAR_W = 6.7;

/** Frets that carry inlay dots, and which are doubled. */
const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Greedily wrap text to a max pixel width (best-effort; single long words are not split). */
function wrapText(text: string, maxWidth: number, charW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (!cur || trial.length * charW <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface RenderOptions {
  /** Add a transparent, clickable hit-target at every position (for a GUI editor). Off for exports. */
  interactive?: boolean;
  style?: Partial<Style>;
}

export function renderSvg(d: Diagram, opts: RenderOptions = {}): string {
  const S: Style = { ...DEFAULTS, ...mapStyleOverrides(d), ...(opts.style ?? {}) };
  const interactive = opts.interactive ?? false;

  const strings = d.tuning.strings;
  const n = strings.length;
  const from = d.frets.from;
  const to = Math.min(d.frets.to, 24);
  const showFretNumber = d.frets.showFretNumber ?? true;
  const showInlay = d.frets.showInlay ?? true;

  const leftWire = from === 0 ? 0 : from - 1;
  const cols = to - leftWire; // number of fret spaces shown
  const boardW = cols * S.fretSpacing;
  const boardH = (n - 1) * S.stringSpacing;

  const originX = S.marginLeft + S.openZone;
  const boardTotalW = originX + boardW + S.marginRight;

  // --- Header layout (title wraps; caption on its own line) ---
  const title = d.meta?.title;
  const availTitleW = Math.max(boardTotalW - S.marginLeft - S.marginRight, S.minTitleWidth);
  const titleLines = title ? wrapText(title, availTitleW, TITLE_CHAR_W) : [];
  const captionText = `Tuning: ${d.tuning.name} (${strings.join(" ")})`;

  const firstBaseline = S.marginTop + TITLE_SIZE;
  const captionBaseline =
    titleLines.length > 0
      ? firstBaseline + (titleLines.length - 1) * TITLE_LINE_H + 20
      : firstBaseline;

  // Widen the canvas if a title line or the caption is wider than the board.
  const widestHeaderPx = Math.max(
    captionText.length * CAPTION_CHAR_W,
    ...titleLines.map((l) => l.length * TITLE_CHAR_W),
    0,
  );
  const totalW = Math.ceil(Math.max(boardTotalW, S.marginLeft + widestHeaderPx + S.marginRight));

  // Board top leaves room so the top row of notes clears the caption.
  const originY = captionBaseline + S.noteRadius + S.topGap;
  const fretNumBaseline = originY + boardH + S.noteRadius + S.bottomGap;
  const totalH = showFretNumber ? fretNumBaseline + 12 : originY + boardH + S.noteRadius + 12;

  // --- Geometry helpers ---
  const xWire = (k: number) => originX + (k - leftWire) * S.fretSpacing;
  const xFret = (f: number) => xWire(f) - S.fretSpacing / 2; // center of fret f's space
  const yString = (i: number) => originY + (n - 1 - i) * S.stringSpacing; // i=0 at bottom
  const openCx = (originX - S.nutGap) - S.openGap - S.noteRadius; // open-string marker x

  const parts: string[] = [];

  if (S.background === "white") {
    parts.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>`);
  }

  // Title (possibly multi-line) + tuning caption.
  titleLines.forEach((line, i) => {
    parts.push(
      `<text x="${S.marginLeft}" y="${firstBaseline + i * TITLE_LINE_H}" font-family="${S.font}" ` +
        `font-size="${TITLE_SIZE}" font-weight="600" fill="${S.lineColor}">${esc(line)}</text>`,
    );
  });
  parts.push(
    `<text x="${S.marginLeft}" y="${captionBaseline}" font-family="${S.font}" ` +
      `font-size="${CAPTION_SIZE}" fill="#666666">${esc(captionText)}</text>`,
  );

  // Inlays (behind the board).
  if (showInlay && n >= 2) {
    // The gap to draw in: for even string counts this is the centre gap; for
    // odd counts it is the gap between the middle string and the next string
    // toward the treble side (avoids sitting on a string, under the notes).
    const mLow = Math.floor(n / 2) - (n % 2 === 0 ? 1 : 0);
    const singleY = (yString(mLow) + yString(mLow + 1)) / 2;
    const firstPlayable = from === 0 ? 1 : from;
    for (let f = firstPlayable; f <= to; f++) {
      const cx = xFret(f);
      if (DOUBLE_INLAYS.has(f)) {
        parts.push(inlayDot(cx, singleY - S.stringSpacing, S));
        parts.push(inlayDot(cx, singleY + S.stringSpacing, S));
      } else if (SINGLE_INLAYS.has(f)) {
        parts.push(inlayDot(cx, singleY, S));
      }
    }
  }

  // Strings (horizontal). Overhang left when the nut is off-screen.
  const stringLeft = from === 0 ? originX - S.nutGap : originX - S.overhang;
  const stringRight = xWire(to);
  for (let i = 0; i < n; i++) {
    const y = yString(i);
    parts.push(
      `<line x1="${stringLeft}" y1="${y}" x2="${stringRight}" y2="${y}" ` +
        `stroke="${S.lineColor}" stroke-width="1.4"/>`,
    );
  }

  // Fret wires (vertical). Nut is a double line.
  const yTop = yString(n - 1);
  const yBot = yString(0);
  for (let k = leftWire; k <= to; k++) {
    if (from === 0 && k === 0) {
      parts.push(vline(originX, yTop, yBot, S.lineColor, 2));
      parts.push(vline(originX - S.nutGap, yTop, yBot, S.lineColor, 2));
    } else {
      parts.push(vline(xWire(k), yTop, yBot, S.lineColor, 1.4));
    }
  }

  // Leftmost fret number only.
  if (showFretNumber) {
    const leftmost = from === 0 ? 1 : from;
    parts.push(
      `<text x="${xFret(leftmost)}" y="${fretNumBaseline}" text-anchor="middle" ` +
        `font-family="${S.font}" font-size="${CAPTION_SIZE}" fill="#666666">${leftmost}</text>`,
    );
  }

  // Capo bar.
  const capoFret = d.capo?.fret;
  if (capoFret != null && capoFret >= (from === 0 ? 1 : from) && capoFret <= to) {
    const cx = xFret(capoFret);
    const w = S.noteRadius * 1.3;
    parts.push(
      `<rect x="${cx - w / 2}" y="${yTop - S.overhang}" width="${w}" ` +
        `height="${boardH + 2 * S.overhang}" rx="${w / 2}" fill="${S.capoColor}"/>`,
    );
  }

  const rootPc = resolveRootPc(d);

  // Markers.
  for (const m of d.markers) {
    if (m.string < 0 || m.string >= n) continue;
    const openPc = pitchClassOf(strings[m.string]);
    const pc = (openPc + m.fret) % 12;
    const y = yString(m.string);

    if (m.fret > 0) {
      if (m.fret < from || m.fret > to) continue;
      if (capoFret != null && m.fret < capoFret) continue;
    }

    const label = markerLabel(d, m, pc, rootPc);
    const isRoot = markerIsRoot(d, m, pc, rootPc);
    const fill = m.color ?? (isRoot ? S.rootColor : S.dotColor);

    if (m.fret === 0) {
      if (from !== 0) continue; // open strings only meaningful with the nut shown
      if (m.type === "mute") {
        parts.push(muteMark(openCx, y, S));
      } else {
        parts.push(openRing(openCx, y, label, isRoot, S));
      }
      continue;
    }

    const cx = xFret(m.fret);
    if (isRoot) {
      parts.push(
        `<circle cx="${cx}" cy="${y}" r="${S.noteRadius + 3}" fill="none" ` +
          `stroke="${fill}" stroke-width="2"/>`,
      );
    }
    parts.push(`<circle cx="${cx}" cy="${y}" r="${S.noteRadius}" fill="${fill}"/>`);
    if (label) parts.push(dotText(cx, y, label, S.textOnDot, S));
  }

  // Transparent click targets for an interactive editor (never in exports).
  if (interactive) {
    const hitR = Math.min(S.fretSpacing, S.stringSpacing) / 2 - 1;
    const fretCols: number[] = [];
    if (from === 0) fretCols.push(0);
    for (let f = Math.max(1, from); f <= to; f++) fretCols.push(f);
    for (let i = 0; i < n; i++) {
      const cy = yString(i);
      for (const f of fretCols) {
        const cx = f === 0 ? openCx : xFret(f);
        parts.push(
          `<circle class="hit" data-string="${i}" data-fret="${f}" cx="${cx}" cy="${cy}" ` +
            `r="${hitR}" fill="transparent" style="cursor:pointer"/>`,
        );
      }
    }
  }

  const svgOpen =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" ` +
    `viewBox="0 0 ${totalW} ${totalH}">`;
  return `${svgOpen}\n${parts.join("\n")}\n</svg>\n`;
}

function mapStyleOverrides(d: Diagram): Partial<Style> {
  const s = d.style;
  if (!s) return {};
  const out: Partial<Style> = {};
  if (s.background) out.background = s.background;
  if (s.dotColor) out.dotColor = s.dotColor;
  if (s.rootColor) out.rootColor = s.rootColor;
  if (s.lineColor) out.lineColor = s.lineColor;
  if (s.inlayColor) out.inlayColor = s.inlayColor;
  if (s.capoColor) out.capoColor = s.capoColor;
  if (s.textOnDot) out.textOnDot = s.textOnDot;
  return out;
}

function resolveRootPc(d: Diagram): number | null {
  const r = d.root;
  if (!r) return null;
  if (r.mode === "pitchClass" && r.value) return pitchClassOf(r.value);
  if (r.mode === "position") {
    const rm = d.markers.find((m) => m.root);
    if (rm) return (pitchClassOf(d.tuning.strings[rm.string]) + rm.fret) % 12;
  }
  return null;
}

function markerIsRoot(d: Diagram, m: Marker, pc: number, rootPc: number | null): boolean {
  const mode = d.root?.mode;
  if (mode === "pitchClass") return rootPc != null && pc === rootPc;
  if (mode === "position") return m.root === true;
  // "None" (or no root config): never emphasize, even if marker.root is stored.
  return false;
}

function markerLabel(d: Diagram, m: Marker, pc: number, rootPc: number | null): string {
  if (m.label != null) return m.label;
  const not = d.notation ?? { type: "note" as const };
  if (not.type === "none") return "";
  if (not.type === "interval") {
    if (rootPc == null) return "";
    return intervalName(pc, rootPc, not.intervalSpelling);
  }
  return noteName(pc, not.accidentals ?? "sharp", not.noteSpelling);
}

function vline(x: number, y1: number, y2: number, color: string, w: number): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;
}

function inlayDot(cx: number, cy: number, S: Style): string {
  return `<circle cx="${cx}" cy="${cy}" r="5" fill="${S.inlayColor}"/>`;
}

function dotText(cx: number, cy: number, text: string, color: string, S: Style): string {
  const size = text.length >= 3 ? 9 : 11;
  return (
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${S.font}" font-size="${size}" font-weight="600" fill="${color}">${esc(text)}</text>`
  );
}

function openRing(cx: number, cy: number, label: string, isRoot: boolean, S: Style): string {
  const color = isRoot ? S.rootColor : S.dotColor;
  let out = "";
  if (isRoot) {
    out += `<circle cx="${cx}" cy="${cy}" r="${S.noteRadius + 3}" fill="none" stroke="${color}" stroke-width="2"/>`;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="${S.noteRadius}" fill="none" stroke="${color}" stroke-width="2"/>`;
  if (label) out += dotText(cx, cy, label, color, S);
  return out;
}

function muteMark(cx: number, cy: number, S: Style): string {
  const r = S.noteRadius * 0.8;
  const c = S.dotColor;
  return (
    `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="${c}" stroke-width="2"/>` +
    `<line x1="${cx - r}" y1="${cy + r}" x2="${cx + r}" y2="${cy - r}" stroke="${c}" stroke-width="2"/>`
  );
}
