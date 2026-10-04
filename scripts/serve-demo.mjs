import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/demo/index.html' : pathname));
    if (!file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Demo: http://127.0.0.1:${port}/`));
