// Test navigateur (Playwright + Chromium sans écran, WebGL logiciel).
// Usage : node tests/browser.mjs [url] [scénario]
// Vérifie : chargement sans erreur, menus, démarrage de course, feux, course, captures d'écran.
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8123/';
const scen = process.argv[3] || 'quick';
const out = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const errors = []; const logs = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + t); });
const shot = async (name) => { await page.screenshot({ path: out + name + '.png' }); console.log('shot', name); };
const state = () => page.evaluate(() => { const g = window.__game; if (!g || !g.race) return { mode: g && g.mode, err: window.__error }; const r = g.race, p = r.player; return { mode: g.mode, phase: r.phase, t: +r.t.toFixed(1), clock: +r.clock.toFixed(1), pos: p.pos, lap: p.lapsDone, u: +(p.v.u * 3.6).toFixed(0), status: p.status, err: window.__error }; });
if (scen === 'menu') {
  await page.goto(url); await page.waitForTimeout(1500); await shot('01_menu');
  await page.click('[data-do="go"][data-v="drivers"]'); await page.waitForTimeout(800); await shot('02_drivers');
  await page.click('[data-do="go"][data-v="circuits"]'); await page.waitForTimeout(800); await shot('03_circuits');
  await page.click('[data-do="go"][data-v="setup"]'); await page.waitForTimeout(500); await shot('04_setup');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('[data-do="go"][data-v="settings"]'); await page.waitForTimeout(400); await shot('05_settings');
  await page.keyboard.press('Escape'); await page.click('[data-do="go"][data-v="controls"]'); await page.waitForTimeout(300); await shot('06_controls');
  await page.keyboard.press('Escape'); await page.click('[data-do="go"][data-v="about"]'); await page.waitForTimeout(300); await shot('07_about');
} else {
  const q = scen === 'quick' ? '?quick=1&laps=1&drive=auto&graphics=low&circuit=monza' : scen;
  await page.goto(url + (q.startsWith('?') ? q : '?' + q)); 
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); const s = await state(); if (s.mode === 'race') break; if (s.err) break; }
  console.log('state', JSON.stringify(await state())); await shot('10_grid');
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); const s = await state(); if (s.phase === 'racing' || s.err) break; }
  await shot('11_start'); console.log('state', JSON.stringify(await state()));
  for (const n of [1, 2, 3]) { await page.waitForTimeout(8000); await shot('12_race' + n); console.log('state', JSON.stringify(await state())); }
}
console.log('ERRORS', errors.length); errors.slice(0, 5).forEach((e) => console.log(e));
console.log('LOGS', logs.length); logs.slice(0, 8).forEach((e) => console.log(e));
await browser.close();
