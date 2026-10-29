import { defineConfig, type Plugin } from "vite";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// Dev-server API that persists diagrams as JSON files in ./library.
// Each file is a record: { id, savedAt, diagram }. This keeps the library on
// disk (durable, git-friendly, readable/writable by an AI) rather than trapped
// in browser storage.
function libraryApi(): Plugin {
  const dir = join(process.cwd(), "library");
  const idRe = /^\/api\/library\/([A-Za-z0-9_-]+)$/;

  return {
    name: "fretboard-library-api",
    configureServer(server) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (!pathname.startsWith("/api/library")) return next();

        const send = (code: number, body?: unknown) => {
          res.statusCode = code;
          if (body === undefined) return res.end();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        try {
          const idMatch = pathname.match(idRe);

          if (req.method === "GET" && /^\/api\/library\/?$/.test(pathname)) {
            const items = readdirSync(dir)
              .filter((f) => f.endsWith(".json"))
              .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
              .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
            return send(200, items);
          }

          if (req.method === "PUT" && idMatch) {
            let body = "";
            for await (const chunk of req) body += chunk;
            const diagram = JSON.parse(body);
            const path = join(dir, `${idMatch[1]}.json`);
            const now = new Date().toISOString();
            // Preserve the original creation time across updates. For records
            // saved before createdAt existed, fall back to their previous
            // savedAt (then the file's birth time) — never bump it to now, or
            // an update would make the diagram look freshly created.
            let createdAt = now;
            if (existsSync(path)) {
              try {
                const prev = JSON.parse(readFileSync(path, "utf8"));
                createdAt =
                  prev.createdAt ?? prev.savedAt ?? statSync(path).birthtime.toISOString();
              } catch {
                createdAt = statSync(path).birthtime.toISOString();
              }
            }
            const record = { id: idMatch[1], createdAt, savedAt: now, diagram };
            writeFileSync(path, JSON.stringify(record, null, 2));
            return send(200, record);
          }

          if (req.method === "DELETE" && idMatch) {
            const p = join(dir, `${idMatch[1]}.json`);
            if (existsSync(p)) unlinkSync(p);
            return send(204);
          }

          return send(404, { error: "not found" });
        } catch (err) {
          return send(500, { error: String(err) });
        }
      });
    },
  };
}

// Dev-server API that persists the user's tuning templates as a single JSON
// file (./config/tunings.json): an array of { name, strings }. Same rationale as
// the library — durable on disk, not trapped in browser storage.
function tuningsApi(): Plugin {
  const dir = join(process.cwd(), "config");
  const file = join(dir, "tunings.json");

  return {
    name: "fretboard-tunings-api",
    configureServer(server) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname !== "/api/tunings") return next();

        const send = (code: number, body?: unknown) => {
          res.statusCode = code;
          if (body === undefined) return res.end();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        try {
          if (req.method === "GET") {
            const list = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
            return send(200, list);
          }
          if (req.method === "PUT") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const list = JSON.parse(body);
            writeFileSync(file, JSON.stringify(list, null, 2));
            return send(200, list);
          }
          return send(405, { error: "method not allowed" });
        } catch (err) {
          return send(500, { error: String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the static build also works under a sub-path
  // such as GitHub Pages' /fretboard-diagram/.
  base: "./",
  plugins: [libraryApi(), tuningsApi()],
});
