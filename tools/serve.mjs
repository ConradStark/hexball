// Serve the installable web app (dist/pwa) on http://localhost:8080 so the service worker and install prompt work
// like they will on a real host: npm start (builds first). No dependencies. PORT=xxxx to change the port.
import fs from 'fs';
import http from 'http';
import path from 'path';

const ROOT = path.resolve('dist/pwa');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('dist/pwa is missing: run npm run build first');

http
  .createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(req.url.split(/[?#]/)[0]);
    } catch {
      return res.writeHead(400).end();
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, body) => {
      if (err) return res.writeHead(404).end('not found');
      // no-cache so a rebuild shows on reload; the service worker does the offline caching
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    });
  })
  .listen(PORT, () => console.log(`Hexball at http://localhost:${PORT}/`));
