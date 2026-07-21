// Public entry point for the rendering core.
export type {
  Diagram,
  Marker,
  MarkerType,
  Tuning,
  FretWindow,
  Capo,
  RootConfig,
  NotationConfig,
  StyleOverrides,
} from "./types.ts";
export { renderSvg } from "./render.ts";
export { pitchClassOf, noteName, intervalName, DEFAULT_INTERVALS } from "./theory.ts";
