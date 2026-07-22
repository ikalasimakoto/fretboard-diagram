// Client for the dev-server library API (see vite.config.ts).
// Diagrams persist as JSON files under ./library on disk.

import type { Diagram } from "../src/types.ts";

export interface StoredDiagram {
  id: string;
  createdAt?: string;
  savedAt: string;
  diagram: Diagram;
}

const BASE = "/api/library";

export async function listLibrary(): Promise<StoredDiagram[]> {
  const r = await fetch(BASE);
  if (!r.ok) throw new Error(`list failed (${r.status})`);
  return r.json();
}

export async function saveLibrary(id: string, diagram: Diagram): Promise<StoredDiagram> {
  const r = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(diagram),
  });
  if (!r.ok) throw new Error(`save failed (${r.status})`);
  return r.json();
}

export async function deleteLibrary(id: string): Promise<void> {
  const r = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(`delete failed (${r.status})`);
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
