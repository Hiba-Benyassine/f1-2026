// Test de conduite manuelle réelle (touches clavier) dans le navigateur.
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const q = process.argv[2] || '?quick=1&laps=1&drive=manual&graphics=low&circuit=monza';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:8123/' + q);
const st = () => page.evaluate(() => { const r = window.__game.race, p = r.player; return { phase: r.phase, clock: +r.clock.toFixed(1), u: +(p.v.u * 3.6).toFixed(0), d: +p.proj.d.toFixed(1), s: +p.proj.s.toFixed(0), pos: p.pos, pen: p.penaltySec, status: p.status, steer: +p.v.controls.steer.toFixed(2), thr: p.v.controls.throttle, jump: r.jumpStart, dmg: +p.v.damage.toFixed(0) }; });
for (let i = 0; i < 80; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.__game && window.__game.mode === 'race' && window.__game.race.phase === 'lights')) break; }
const ff = (n, hook) => page.evaluate(([n]) => { const g = window.__game, rc = g.race; for (let i = 0; i < n * 120; i++) { rc.playerInput = g.input.read(1 / 120); rc.step(1 / 120); rc.checkEnd(); } const p = rc.player; return { phase: rc.phase, clock: +rc.clock.toFixed(1), u: +(p.v.u * 3.6).toFixed(0), d: +p.proj.d.toFixed(1), s: +p.proj.s.toFixed(0), pos: p.pos, pen: p.penaltySec, status: p.status, steer: +p.v.controls.steer.toFixed(2), jump: rc.jumpStart, dmg: +p.v.damage.toFixed(0), strikes: p.strikes }; }, [n]);
await page.evaluate(() => { const g = window.__game, rc = g.race; g.started = true; rc.startSequence(); let n = 0; while (rc.phase !== 'go' && n < 120 * 60) { rc.playerInput = { steer: 0, throttle: 0, brake: 0, boost: false }; rc.step(1 / 120); n++; } });
console.log('go', JSON.stringify(await st()));
await page.keyboard.down('ArrowUp');
for (let i = 0; i < 6; i++) console.log('acc', JSON.stringify(await ff(5)));
await page.keyboard.down('ArrowRight'); console.log('right', JSON.stringify(await ff(1.5))); await page.keyboard.up('ArrowRight');
console.log('straight', JSON.stringify(await ff(3)));
await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowDown'); console.log('brake', JSON.stringify(await ff(5))); await page.keyboard.up('ArrowDown');
await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp'); console.log('boost', JSON.stringify(await ff(5)));
console.log('ERRORS', errors.length); errors.slice(0, 3).forEach((e) => console.log(e));
await browser.close();
