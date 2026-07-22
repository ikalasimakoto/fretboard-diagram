// Diagram spec — the stable data contract.
//
// A diagram is fully described by plain JSON. The rendering core turns this
// into an image. Keep this file free of rendering/GUI concerns so the spec can
// outlive any particular renderer or editor.

/** Marker kinds. Fretted notes are "dot"; open strings use "open" or "mute". */
export type MarkerType = "dot" | "open" | "mute";

/** A single played/marked position. */
export interface Marker {
  /** Index into tuning.strings. 0 = lowest-pitched string. */
  string: number;
  /** Fret number. 0 = open string. */
  fret: number;
  /** Defaults to "dot" for fret > 0. For fret 0 use "open" or "mute". */
  type?: MarkerType;
  /** Highlight as a root note (used when root.mode === "position"). */
  root?: boolean;
  /** Override fill color (CSS color). Null/omitted = theme default. */
  color?: string | null;
  /** Override the printed label entirely. Null/omitted = computed from notation. */
  label?: string | null;
}

/**
 * How labels inside markers are produced.
 * - "note": real note names (C, D#, ...).
 * - "interval": scale degrees relative to the root (R, M3, m6, ...).
 * - "none": no text.
 */
export interface NotationConfig {
  type: "note" | "interval" | "none";
  /** Default accidental spelling for note names. Default "sharp". */
  accidentals?: "sharp" | "flat";
  /**
   * Per-pitch-class note-name override, keyed by pitch class 0–11 (0 = C).
   * Lets you, e.g., spell only certain notes as flats.
   */
  noteSpelling?: Partial<Record<number, string>>;
  /**
   * Per-degree interval override, keyed by semitones from the root 0–11.
   * Lets you choose, e.g., "#5" vs "m6", or "M2" vs "9".
   */
  intervalSpelling?: Partial<Record<number, string>>;
}

export interface Tuning {
  /** Display name, e.g. "Standard", "FACGCE". */
  name: string;
  /**
   * Pitches from lowest to highest string, in scientific pitch notation
   * (e.g. "E2", "A2", "D3", "G3", "B3", "E4"). Length defines the string count.
   */
  strings: string[];
}

export interface FretWindow {
  /** First fret shown. 0 includes the nut and open strings. */
  from: number;
  /** Last fret shown. Max 24. */
  to: number;
  /** Show the fret number of the leftmost fret (only). Default true. */
  showFretNumber?: boolean;
  /** Show inlay position dots. Default true. */
  showInlay?: boolean;
}

export interface Capo {
  /** Fret the capo clamps. */
  fret: number;
}

export interface RootConfig {
  /**
   * - "pitchClass": every marker whose pitch class equals `value` is a root.
   * - "position": the marker(s) flagged `root: true` are the root.
   * - null: no root emphasis (unless individual markers set `root: true`).
   */
  mode: "pitchClass" | "position" | null;
  /** For "pitchClass" mode: a note name like "C" or "Eb". */
  value?: string | null;
}

/** Optional visual overrides. All have sensible defaults in the renderer. */
export interface StyleOverrides {
  background?: "transparent" | "white";
  dotColor?: string;
  rootColor?: string;
  lineColor?: string;
  inlayColor?: string;
  capoColor?: string;
  textOnDot?: string;
}

export interface Diagram {
  version: number;
  meta?: { title?: string; tags?: string[] };
  tuning: Tuning;
  frets: FretWindow;
  capo?: Capo | null;
  root?: RootConfig | null;
  notation?: NotationConfig;
  markers: Marker[];
  style?: StyleOverrides;
  // groups?: ...  // polygon outlines around marker sets — planned, not yet implemented.
}
