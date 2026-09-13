import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { URL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = path.join(root, 'dist-remote-fastapi');
const port = Number(process.env.GRID_PRODUCTION_PORT ?? 4174);
const backend = new URL(process.env.GRID_PRODUCTION_BACKEND ?? 'http://127.0.0.1:8001');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);

function proxy(request, response) {
  const upstream = http.request(
    new URL(request.url ?? '/', backend),
    {
      method: request.method,
      headers: { ...request.headers, host: backend.host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    }
  );
  upstream.on('error', (error) => {
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Upstream unavailable: ${error.message}`);
  });
  request.pipe(upstream);
}

function serve(request, response) {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname === '/openapi.json' ||
    requestUrl.pathname.startsWith('/docs')
  ) {
    proxy(request, response);
    return;
  }

  const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  const candidate = path.resolve(frontendRoot, relativePath || 'index.html');
  const isInsideRoot =
    candidate.startsWith(`${frontendRoot}${path.sep}`) || candidate === frontendRoot;
  const file =
    isInsideRoot && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(frontendRoot, 'index.html');
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(file)) ?? 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(response);
}

if (!fs.existsSync(path.join(frontendRoot, 'index.html'))) {
  throw new Error('Run pnpm build:remote-fastapi before starting the production test server.');
}

http.createServer(serve).listen(port, '127.0.0.1', () => {
  console.log(`Production demo test server listening on http://127.0.0.1:${port}`);
});
