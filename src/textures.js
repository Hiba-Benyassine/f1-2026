// =====================================================================
//  TEXTURES procédurales (canvas) : aucune image externe n'est nécessaire.
//  Tu peux les remplacer par de vraies textures (voir docs/ASSET_REPLACEMENT.md).
// =====================================================================
import * as THREE from 'three';

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function canvasTex(canvas, { repeat = null, srgb = true, aniso = 8, mip = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso; t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

// bruit pseudo-aléatoire déterministe
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function asphaltCanvas(size = 512, tone = 0) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(11);
  const base = 40 + tone; g.fillStyle = `rgb(${base},${base + 2},${base + 6})`; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 34 + (r() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.05; }
  g.putImageData(img, 0, 0);
  // gravillons
  for (let i = 0; i < size * 5; i++) { const x = r() * size, y = r() * size, v = 70 + r() * 70; g.fillStyle = `rgba(${v},${v},${v + 4},${0.08 + r() * 0.12})`; g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5); }
  // bande de gomme (trajectoire) : légèrement plus sombre / brillante au centre
  const grad = g.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.18, 'rgba(0,0,0,0)'); grad.addColorStop(0.3, 'rgba(0,0,0,0.12)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.2)'); grad.addColorStop(0.7, 'rgba(0,0,0,0.12)'); grad.addColorStop(0.82, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  // lignes blanches de bord (en pointillé léger pour casser la répétition)
  g.fillStyle = 'rgba(235,235,235,0.92)'; g.fillRect(size * 0.012, 0, size * 0.012, size); g.fillRect(size * 0.976, 0, size * 0.012, size);
  return c;
}

export function grassCanvas(size = 256, dark = false) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(7);
  g.fillStyle = dark ? '#2c5a26' : '#3f7a2e'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 40; i++) { const x = r() * size, y = r() * size, k = r(); g.fillStyle = k < 0.5 ? `rgba(20,70,20,${0.12 + r() * 0.2})` : `rgba(120,170,60,${0.08 + r() * 0.15})`; g.fillRect(x, y, 1, 2 + r() * 3); }
  // tondeuse : bandes
  g.fillStyle = 'rgba(255,255,255,0.035)'; for (let i = 0; i < 8; i += 2) g.fillRect(0, (i / 8) * size, size, size / 8);
  return c;
}
export function gravelCanvas(size = 256) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = rng(23);
  g.fillStyle = '#b9a88a'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 30; i++) { const v = 120 + r() * 120; g.fillStyle = `rgba(${v},${v - 12},${v - 36},${0.2 + r() * 0.5})`; g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2); }
  return c;
}

export function kerbCanvas() {
  const c = makeCanvas(64, 128), g = c.getContext('2d');
  g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#d80f1b'; g.fillRect(0, 0, 64, 64);
  const r = rng(5); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.1})`; g.fillRect(r() * 64, r() * 128, 2, 2); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 62, 64, 4); g.fillRect(0, 126, 64, 2);
  return c;
}
export function checkerCanvas(n = 8) {
  const c = makeCanvas(256, 64), g = c.getContext('2d'); const sx = 256 / (n * 2), sy = 64 / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < n * 2; x++) { g.fillStyle = (x + y) % 2 ? '#101010' : '#f4f4f4'; g.fillRect(x * sx, y * sy, sx, sy); }
  return c;
}
export function pitLaneCanvas() {
  const c = makeCanvas(256, 256), g = c.getContext('2d'), r = rng(3);
  g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 55 + r() * 60; g.fillStyle = `rgba(${v},${v},${v + 3},0.18)`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
  g.fillStyle = '#ffffff'; g.fillRect(6, 0, 5, 256);                               // ligne blanche voie rapide
  g.fillStyle = '#f2c800'; g.fillRect(244, 0, 5, 256);                             // ligne jaune côté travail
  return c;
}
export function crowdCanvas(w = 512, h = 256) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), r = rng(99);
  g.fillStyle = '#20232b'; g.fillRect(0, 0, w, h);
  const cols = ['#d62828', '#f77f00', '#fcbf49', '#eae2b7', '#2a9d8f', '#4361ee', '#ffffff', '#e5383b', '#222', '#8338ec', '#06d6a0'];
  for (let row = 0; row < 12; row++) for (let i = 0; i < w / 7; i++) {
    const x = i * 7 + (row % 2) * 3.5 + r() * 2, y = row * (h / 12) + 4; g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y + 8, 5, 8);
    g.fillStyle = r() < 0.5 ? '#f1c27d' : r() < 0.5 ? '#8d5524' : '#c68642'; g.beginPath(); g.arc(x + 2.5, y + 4, 2.6, 0, 7); g.fill();
  }
  return c;
}
export function boardCanvas(text, bg = '#111', fg = '#fff', accent = '#e10600', w = 512, h = 128) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 16, h);
  g.fillStyle = fg; g.font = `900 ${Math.floor(h * 0.52)}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2 + 6, h / 2 - 4);
  return c;
}
export function numberCanvas(num, color = '#fff', bg = null) {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 128, 128); }
  g.font = '900 104px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(String(num), 64, 68); g.fillStyle = color; g.fillText(String(num), 64, 68);
  return c;
}
export function brakeBoardCanvas(txt) {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e10600'; g.fillRect(8, 8, 112, 112); g.fillStyle = '#fff'; g.font = '900 70px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 68);
  return c;
}
export function skyCanvas(top = '#2f6fcf', mid = '#8fc1f0', bottom = '#e9f2fb', w = 16, h = 512) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(0.82, bottom); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); return c;
}
/** équirectangulaire simple pour reflets (ciel, horizon, sol) */
export function envCanvas(sky = ['#3a78d4', '#a9d0f5', '#f2f6fb'], ground = '#6b6e6a') {
  const w = 512, h = 256, c = makeCanvas(w, h), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, sky[0]); gr.addColorStop(0.35, sky[1]); gr.addColorStop(0.5, sky[2]); gr.addColorStop(0.5001, ground); gr.addColorStop(1, '#2a2b2a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // soleil
  const rg = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, 40); rg.addColorStop(0, 'rgba(255,250,230,1)'); rg.addColorStop(1, 'rgba(255,250,230,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
  return c;
}
export function cloudCanvas() {
  const c = makeCanvas(512, 256), g = c.getContext('2d'), r = rng(31);
  g.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i++) { const x = r() * 512, y = 80 + r() * 90, rad = 14 + r() * 38; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  return c;
}
export function glowCanvas() {
  const c = makeCanvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
}
export function confettiCanvas() {
  const c = makeCanvas(16, 16), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(2, 0, 12, 16); return c;
}
