// Construction « production » :  node tools/build.mjs   (ou  npm run build)
// - Si esbuild est disponible (npm i -D esbuild, ou variable ESBUILD=/chemin/esbuild) : un seul fichier JS minifié.
// - Sinon : copie directe des sources + vendor (fonctionne aussi, sans minification). Aucune erreur pour un débutant.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const rel = (...p) => path.join(root, ...p);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

function findEsbuild() {
  const cands = [process.env.ESBUILD, rel('node_modules/.bin/esbuild'), rel('node_modules/@esbuild/linux-x64/bin/esbuild'), '/opt/npm-tools/node_modules/@esbuild/linux-x64/bin/esbuild'].filter(Boolean);
  return cands.find((c) => fs.existsSync(c));
}

if (fs.existsSync(rel('public'))) copy(rel('public'), dist);
let html = fs.readFileSync(rel('index.html'), 'utf8');
const es = findEsbuild();
if (es) {
  const v = rel('vendor/three');
  // alias : import 'three' -> vendor ; 'three/addons/*' -> vendor/addons/*
  // esbuild CLI n'accepte pas de plugin : on utilise --alias (esbuild >= 0.16)
  const args = [rel('src/main.js'), '--bundle', '--minify', '--format=esm', '--target=es2020', `--outfile=${path.join(dist, 'game.js')}`,
    `--alias:three=${path.join(v, 'three.module.js')}`, `--alias:three/addons=${path.join(v, 'addons')}`, '--legal-comments=none', '--log-level=warning'];
  execFileSync(es, args, { stdio: 'inherit' });
  execFileSync(es, [rel('src/style.css'), '--minify', `--outfile=${path.join(dist, 'style.css')}`, '--log-level=warning'], { stdio: 'inherit' });
  html = html.replace(/<!--IMPORTMAP-->[\s\S]*?<!--\/IMPORTMAP-->/, '')
    .replace('href="src/style.css"', 'href="style.css"')
    .replace(/<!--SCRIPT-->[\s\S]*?<!--\/SCRIPT-->/, '<script type="module" src="game.js"></script>');
  console.log('Build esbuild OK ->', dist);
} else {
  copy(rel('src'), path.join(dist, 'src'));
  copy(rel('vendor'), path.join(dist, 'vendor'));
  console.log('esbuild introuvable : copie non minifiée (le jeu fonctionne pareil). Pour minifier : npm i -D esbuild');
}
fs.writeFileSync(path.join(dist, 'index.html'), html);
const size = (d) => fs.readdirSync(d, { recursive: true }).reduce((s, f) => { const p = path.join(d, f); return s + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0); }, 0);
console.log('Taille dist :', (size(dist) / 1e6).toFixed(1), 'Mo');
