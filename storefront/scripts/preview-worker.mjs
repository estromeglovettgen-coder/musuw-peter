import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../worker/index.js";

const country = process.argv[2] ?? "US";
const port = Number(process.argv[3] ?? 4190);
const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const distRoot = join(projectRoot, "dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt; charset=utf-8",
  ".srt": "application/x-subrip",
  ".zip": "application/zip",
  ".md": "text/plain; charset=utf-8"
};

async function assetResponse(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(distRoot, requested);
  let filePath = candidate.startsWith(`${distRoot}/`) ? candidate : join(distRoot, "index.html");
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
  } catch {
    try {
      filePath = `${filePath.replace(/\/+$/, "")}.html`;
      if (!(await stat(filePath)).isFile()) throw new Error("Not a file");
    } catch {
      filePath = join(distRoot, "index.html");
    }
  }
  return new Response(await readFile(filePath), {
    headers: {
      "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream"
    }
  });
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: ["GET", "HEAD"].includes(incoming.method) ? undefined : body
    });
    Object.defineProperty(request, "cf", { value: { country } });
    const response = await handleRequest(request, {
      ASSETS: { fetch: assetResponse }
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end(error instanceof Error ? error.message : "Preview error");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`musuw Worker preview (${country}) http://127.0.0.1:${port}\n`);
});
