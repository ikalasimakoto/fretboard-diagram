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
  titleZone: number;
  openZone: number;
  bottomZone: number;
  nutGap: number;
  overhang: number;
  background: "transparent" | "white";
  lineColor: string;
  dotColor: string;
  rootColor: string;
  inlayColor: string;
  textOnDot: string;
  font: string;
}

const DEFAULTS: Style = {
  fretSpacing: 58,
  stringSpacing: 34,
  noteRadius: 12,
  marginTop: 14,
  marginLeft: 16,
  marginRight: 24,
  titleZone: 46,
  openZone: 34,
  bottomZone: 34,
  nutGap: 4,
  overhang: 12,
  background: "transparent",
  lineColor: "#222222",
  dotColor: "#222222",
  rootColor: "#c0392b",
  inlayColor: "#cfcfcf",
  textOnDot: "#ffffff",
  font: "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
};

/** Frets that carry inlay dots, and which are doubled. */
const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSvg(d: Diagram, styleIn?: Partial<Style>): string {
  const S: Style = { ...DEFAULTS, ...(mapStyleOverrides(d)), ...(styleIn ?? {}) };

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
  const originY = S.marginTop + S.titleZone;
  const totalW = originX + boardW + S.marginRight;
  const totalH = originY + boardH + S.bottomZone;

  // Geometry helpers.
  const xWire = (k: number) => originX + (k - leftWire) * S.fretSpacing;
  const xFret = (f: number) => xWire(f) - S.fretSpacing / 2; // center of fret f's space
  const yString = (i: number) => originY + (n - 1 - i) * S.stringSpacing; // i=0 at bottom

  const parts: string[] = [];

  // Background.
  if (S.background === "white") {
    parts.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>`);
  }

  // Title + tuning caption.
  const title = d.meta?.title;
  if (title) {
    parts.push(
      `<text x="${S.marginLeft}" y="${S.marginTop + 18}" font-family="${S.font}" ` +
        `font-size="18" font-weight="600" fill="${S.lineColor}">${esc(title)}</text>`,
    );
  }
  const tuningCaption = `Tuning: ${d.tuning.name} (${strings.join(" ")})`;
  parts.push(
    `<text x="${S.marginLeft}" y="${S.marginTop + (title ? 38 : 20)}" font-family="${S.font}" ` +
      `font-size="12" fill="#666666">${esc(tuningCaption)}</text>`,
  );

  // Inlays (behind everything on the board).
  if (showInlay) {
    const firstPlayable = from === 0 ? 1 : from;
    for (let f = firstPlayable; f <= to; f++) {
      const cx = xFret(f);
      if (DOUBLE_INLAYS.has(f)) {
        parts.push(inlayDot(cx, originY + boardH / 3, S));
        parts.push(inlayDot(cx, originY + (2 * boardH) / 3, S));
      } else if (SINGLE_INLAYS.has(f)) {
        parts.push(inlayDot(cx, originY + boardH / 2, S));
      }
    }
  }

  // Strings (horizontal lines). Overhang left when the nut is off-screen.
  const stringLeft =
    from === 0 ? originX - S.nutGap : originX - S.overhang;
  const stringRight = xWire(to);
  for (let i = 0; i < n; i++) {
    const y = yString(i);
    parts.push(
      `<line x1="${stringLeft}" y1="${y}" x2="${stringRight}" y2="${y}" ` +
        `stroke="${S.lineColor}" stroke-width="1.4"/>`,
    );
  }

  // Fret wires (vertical lines); the nut is a double line.
  const yTop = yString(n - 1);
  const yBot = yString(0);
  for (let k = leftWire; k <= to; k++) {
    if (from === 0 && k === 0) {
      // Nut: double line.
      parts.push(vline(originX, yTop, yBot, S.lineColor, 2));
      parts.push(vline(originX - S.nutGap, yTop, yBot, S.lineColor, 2));
    } else {
      parts.push(vline(xWire(k), yTop, yBot, S.lineColor, 1.4));
    }
  }

  // Fret number of the leftmost fret space only.
  if (showFretNumber) {
    const leftmost = from === 0 ? 1 : from;
    parts.push(
      `<text x="${xFret(leftmost)}" y="${originY + boardH + 20}" text-anchor="middle" ` +
        `font-family="${S.font}" font-size="12" fill="#666666">${leftmost}</text>`,
    );
  }

  // Capo bar.
  const capoFret = d.capo?.fret;
  if (capoFret != null && capoFret >= (from === 0 ? 1 : from) && capoFret <= to) {
    const cx = xFret(capoFret);
    const w = S.noteRadius * 1.3;
    parts.push(
      `<rect x="${cx - w / 2}" y="${yTop - S.overhang}" width="${w}" ` +
        `height="${boardH + 2 * S.overhang}" rx="${w / 2}" ` +
        `fill="${S.lineColor}" opacity="0.85"/>`,
    );
  }

  // Root pitch class (for pitchClass mode and interval labels).
  const rootPc = resolveRootPc(d);

  // Markers.
  for (const m of d.markers) {
    if (m.string < 0 || m.string >= n) continue;
    const openPc = pitchClassOf(strings[m.string]);
    const pc = (openPc + m.fret) % 12;
    const y = yString(m.string);

    // Skip fretted markers outside the window or left of a capo.
    if (m.fret > 0) {
      if (m.fret < from || m.fret > to) continue;
      if (capoFret != null && m.fret < capoFret) continue;
    }

    const label = markerLabel(d, m, pc, rootPc);
    const isRoot = markerIsRoot(d, m, pc, rootPc);
    const fill = m.color ?? (isRoot ? S.rootColor : S.dotColor);

    if (m.fret === 0) {
      // Open-string markers only make sense when the nut is shown.
      if (from !== 0) continue;
      const cx = S.marginLeft + S.openZone / 2;
      if (m.type === "mute") {
        parts.push(muteMark(cx, y, S));
      } else {
        parts.push(openRing(cx, y, label, isRoot, S));
      }
      continue;
    }

    // Fretted dot.
    const cx = xFret(m.fret);
    if (isRoot) {
      parts.push(
        `<circle cx="${cx}" cy="${y}" r="${S.noteRadius + 3}" fill="none" ` +
          `stroke="${fill}" stroke-width="2"/>`,
      );
    }
    parts.push(`<circle cx="${cx}" cy="${y}" r="${S.noteRadius}" fill="${fill}"/>`);
    if (label) {
      parts.push(dotText(cx, y, label, S.textOnDot, S));
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

function markerIsRoot(
  d: Diagram,
  m: Marker,
  pc: number,
  rootPc: number | null,
): boolean {
  const mode = d.root?.mode;
  if (mode === "pitchClass" && rootPc != null) return pc === rootPc;
  if (mode === "position") return m.root === true;
  return m.root === true;
}

function markerLabel(
  d: Diagram,
  m: Marker,
  pc: number,
  rootPc: number | null,
): string {
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
