// Serveur statique minimal (aucune dépendance) :  node tools/serve.mjs [dossier] [port]
// Sans argument : sert le projet (mode développement). « dist » : sert la version construite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, process.argv[2] || '.');
const port = +(process.argv[3] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/\.\.+/g, '.');
  const rel = clean.endsWith('/') ? clean + 'index.html' : clean;
  const cands = [path.join(dir, rel), path.join(dir, 'public', rel)];          // en dev, public/ est servi à la racine
  for (const c of cands) { if (c.startsWith(dir) && fs.existsSync(c) && fs.statSync(c).isFile()) return c; }
  return null;
}
const server = http.createServer((req, res) => {
  const f = resolve(req.url);
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('404 — introuvable : ' + req.url); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});
server.listen(port, () => {
  console.log(`\n  Jeu prêt :  http://localhost:${port}/\n  (dossier servi : ${path.relative(process.cwd(), dir) || '.'})\n  Arrêt : Ctrl+C\n`);
});
