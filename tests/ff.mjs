// Test navigateur « avance rapide » : simule N secondes sans attendre le rendu logiciel, puis capture.
// Usage : node tests/ff.mjs "?quick=1&circuit=monaco&laps=2&graphics=medium" 25 [cam=0..3]
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const q = process.argv[2] || '?quick=1&laps=2&drive=auto&graphics=low&circuit=monza';
const secs = +(process.argv[3] || 25);
const tag = process.argv[4] || 'ff';
const out = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error ' + m.text()); });
await page.goto('http://localhost:8123/' + q);
for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.__game && window.__game.mode === 'race')) break; }
await page.evaluate((secs) => { const g = window.__game, r = g.race; g.started = true; r.startSequence(); const H = 1 / 120; let n = 0; while (r.phase !== 'racing' && n < 20000) { r.step(H); n++; } for (let i = 0; i < secs * 120; i++) { r.step(H); r.checkEnd(); } g.gridT = 99; }, secs);
if (process.env.PIT) {
  const r = await page.evaluate(() => { const g = window.__game, rc = g.race, p = rc.player; rc.requestPit('H'); let n = 0; while (!(p.status === 'pit' && p.pit.phase === 'service' && p.pit.t > 0.8) && n < 120 * 200) { rc.step(1 / 120); n++; } return { n, phase: p.pit.phase, st: p.status, boxK: p.pit.boxK }; });
  console.log('pit', JSON.stringify(r));
}
if (process.env.SCN) await page.evaluate((s) => { for (const x of s.split(',')) window.__game.race.scenario(x); }, process.env.SCN);
if (process.env.SECS2) await page.evaluate((n) => { const rc = window.__game.race; for (let i = 0; i < n * 120; i++) rc.step(1 / 120); }, +process.env.SECS2);
const cams = (process.env.CAMS || '0,1,2,3').split(',').map(Number);
for (const c of cams) {
  await page.evaluate((c) => { window.__game.camMode = c; window.__game.camInit = false; }, c);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + `${tag}_cam${c}.png` });
}
const st = await page.evaluate(() => { const r = window.__game.race, p = r.player; return { phase: r.phase, clock: +r.clock.toFixed(1), pos: p.pos, lap: p.lapsDone, u: +(p.v.u * 3.6).toFixed(0), top: r.sortedCars().slice(0, 4).map((c) => c.driver.code + ':' + c.lapsDone), err: window.__error }; });
console.log(JSON.stringify(st)); console.log('ERRORS', errors.length); errors.slice(0, 5).forEach((e) => console.log(e));
await browser.close();
