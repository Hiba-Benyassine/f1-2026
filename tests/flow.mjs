// Test du flux complet : course (avance rapide) -> arrivée -> résultats -> podium -> menu.
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const out = new URL('./shots/', import.meta.url).pathname;
const q = process.argv[2] || '?quick=1&laps=1&drive=auto&graphics=medium&circuit=redbullring';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || ''))); page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error ' + m.text()); });
await page.goto('http://localhost:8123/' + q);
for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.__game && window.__game.mode === 'race')) break; }
const r = await page.evaluate(() => { const g = window.__game, rc = g.race; window.__pen = []; rc.on('penalty', (e) => window.__pen.push(e.car.driver.code + ' ' + e.sec + ' ' + e.reason + ' @' + rc.clock.toFixed(1))); rc.on('log', (e) => { if (e.type !== 'finish') window.__pen.push('log ' + e.type + ' ' + e.text); }); g.started = true; rc.startSequence(); let n = 0; const H = 1 / 120; while (rc.phase !== 'results' && n < 120 * 400) { rc.step(H); rc.checkEnd(); n++; if (rc.phase === 'finish' && rc.player.finished && !g._seen) { g._seen = n; } } return { n, phase: rc.phase, clock: rc.clock }; });
console.log('sim', JSON.stringify(r)); console.log(JSON.stringify(await page.evaluate(() => window.__pen)));
await page.waitForTimeout(2500);
console.log('mode', await page.evaluate(() => window.__game.mode));
await page.screenshot({ path: out + '20_results.png' });
await page.click('[data-do="podium"]'); await page.waitForTimeout(3000); await page.screenshot({ path: out + '21_podium_a.png' });
await page.waitForTimeout(9000); await page.screenshot({ path: out + '22_podium_b.png' });
console.log('mode', await page.evaluate(() => window.__game.mode));
await page.click('[data-do="results"]'); await page.waitForTimeout(800); await page.click('[data-do="menu"]'); await page.waitForTimeout(1200); await page.screenshot({ path: out + '23_menu_again.png' });
console.log('mode', await page.evaluate(() => window.__game.mode), 'ERRORS', errors.length); errors.slice(0, 5).forEach((e) => console.log(e));
await browser.close();
