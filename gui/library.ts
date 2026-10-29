// Storage for saved diagrams and tuning templates, with two backends:
//
// - "files": the dev server (`npm run dev`, see vite.config.ts) writes diagrams
//   to ./library/*.json and templates to ./config/tunings.json. This is the
//   main, durable copy on the Mac.
// - "browser": the static build (e.g. on GitHub Pages) has no server, so it
//   keeps both in this browser's localStorage. Each device has its own copy;
//   the library's JSON export/import moves diagrams between devices.

import type { Diagram, Tuning } from "../src/types.ts";

export interface StoredDiagram {
  id: string;
  createdAt?: string;
  savedAt: string;
  diagram: Diagram;
}

export const STORAGE: "files" | "browser" = import.meta.env.DEV ? "files" : "browser";

const BASE = "/api/library";
const LS_LIBRARY = "fretboard-diagram.library";
const LS_TUNINGS = "fretboard-diagram.tunings";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(`browser storage unavailable (${e})`);
  }
}

export async function listLibrary(): Promise<StoredDiagram[]> {
  if (STORAGE === "browser") return readLocal<StoredDiagram[]>(LS_LIBRARY, []);
  const r = await fetch(BASE);
  if (!r.ok) throw new Error(`list failed (${r.status})`);
  return r.json();
}

export async function saveLibrary(id: string, diagram: Diagram, createdAt?: string): Promise<StoredDiagram> {
  if (STORAGE === "browser") {
    const list = readLocal<StoredDiagram[]>(LS_LIBRARY, []);
    const prev = list.find((s) => s.id === id);
    const now = new Date().toISOString();
    const rec: StoredDiagram = { id, createdAt: prev?.createdAt ?? createdAt ?? now, savedAt: now, diagram };
    writeLocal(LS_LIBRARY, [rec, ...list.filter((s) => s.id !== id)]);
    return rec;
  }
  const r = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(diagram),
  });
  if (!r.ok) throw new Error(`save failed (${r.status})`);
  return r.json();
}

export async function deleteLibrary(id: string): Promise<void> {
  if (STORAGE === "browser") {
    writeLocal(LS_LIBRARY, readLocal<StoredDiagram[]>(LS_LIBRARY, []).filter((s) => s.id !== id));
    return;
  }
  const r = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(`delete failed (${r.status})`);
}

/** Saved tuning templates; an empty list means none saved yet (first run). */
export async function loadTunings(): Promise<Tuning[]> {
  if (STORAGE === "browser") return readLocal<Tuning[]>(LS_TUNINGS, []);
  const r = await fetch("/api/tunings");
  if (!r.ok) throw new Error(`tunings failed (${r.status})`);
  return r.json();
}

export async function saveTunings(list: Tuning[]): Promise<void> {
  if (STORAGE === "browser") return writeLocal(LS_TUNINGS, list);
  const r = await fetch("/api/tunings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error(`save tunings failed (${r.status})`);
}

/** Human-readable, filesystem-safe id derived from the title plus a short suffix. */
export function makeId(title: string): string {
  const slug =
    (title || "diagram")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "diagram";
  const rand = Math.random().toString(16).slice(2, 6);
  return `${slug}-${rand}`;
}
