// Serves game/ at http://localhost:8080 for local play. Node standard
// library only; run with `node serve.ts`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "game");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    let path = normalize(join(root, url.pathname));
    if (!path.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    const data = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(port, () => console.log(`EMBERLINE at http://localhost:${port}`));
