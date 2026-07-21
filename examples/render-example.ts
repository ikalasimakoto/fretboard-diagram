// Renders every examples/*.json to out/<name>.svg.
//
// Run: npm run example   (or: node examples/render-example.ts)

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSvg } from "../src/render.ts";
import type { Diagram } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");
mkdirSync(outDir, { recursive: true });

const jsonFiles = readdirSync(here).filter((f) => f.endsWith(".json"));
if (jsonFiles.length === 0) {
  console.log("No example .json files found.");
}

for (const file of jsonFiles) {
  const spec = JSON.parse(readFileSync(join(here, file), "utf8")) as Diagram;
  const svg = renderSvg(spec);
  const outPath = join(outDir, `${basename(file, ".json")}.svg`);
  writeFileSync(outPath, svg, "utf8");
  console.log(`rendered ${file} -> out/${basename(outPath)}`);
}
