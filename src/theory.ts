// Music-theory helpers: note names and intervals.
//
// This module is intentionally standalone so it can be reused by the renderer,
// a future GUI, tests, or headless AI generation. It has no rendering concerns.

const LETTER_TO_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Default interval labels keyed by semitones from the root (0–11). */
export const DEFAULT_INTERVALS = [
  "R", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7",
];

/** Parse a note or pitch name ("C", "Eb", "F#3", "E2") into a pitch class 0–11. */
export function pitchClassOf(name: string): number {
  const m = /^([A-Ga-g])([#b]*)/.exec(name.trim());
  if (!m) throw new Error(`Cannot parse note name: "${name}"`);
  let pc = LETTER_TO_SEMITONE[m[1].toUpperCase()];
  for (const c of m[2]) pc += c === "#" ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}

/** Name a pitch class, honoring an accidental preference and optional overrides. */
export function noteName(
  pc: number,
  accidentals: "sharp" | "flat" = "sharp",
  overrides?: Partial<Record<number, string>>,
): string {
  const p = ((pc % 12) + 12) % 12;
  const override = overrides?.[p];
  if (override != null) return override;
  return (accidentals === "flat" ? FLAT_NAMES : SHARP_NAMES)[p];
}

/** Interval label of a pitch class relative to a root, with optional overrides. */
export function intervalName(
  pc: number,
  rootPc: number,
  overrides?: Partial<Record<number, string>>,
): string {
  const semis = (((pc - rootPc) % 12) + 12) % 12;
  const override = overrides?.[semis];
  if (override != null) return override;
  return DEFAULT_INTERVALS[semis];
}
