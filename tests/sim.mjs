import { CIRCUITS, DEFAULT_AI_GRID, DEFAULT_SETUP } from '../src/data.js';
import { buildNamedTrack, generateTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const cid = args.circuit || 'monza'; const laps = +(args.laps || 3); const drive = args.drive || 'auto';
const circuit = CIRCUITS.find(c => c.id === cid);
const track = cid === 'procedural' ? generateTrack({ seed: 2026, complexity: 0.6, width: 15 }) : buildNamedTrack(circuit, +(args.width||15));
const race = new Race({ track, laps, playerId: 'leclerc', aiIds: DEFAULT_AI_GRID, aiCount: 12, difficulty: args.diff || 'medium', assists: 'standard', weather: args.weather || 'dry', startTyre: 'M', gridPos: 'mid', lizard: args.lizard !== '0', vmax: 340, startDelay: 1, rules: 'standard', mode: 'race', drive, circuitId: cid, seed: 7, circuit });
let radioCount = 0; race.on('radio', k => { radioCount++; if (args.v) console.log('  radio', k); });
race.on('log', e => { if (args.v && e.type !== 'finish') console.log(`  [${race.clock.toFixed(1)}] ${e.type}: ${e.text}`); });
race.on('sparks', (e) => { race._sparks = (race._sparks || 0) + 1; if (args.sp && e.power > +args.sp) { let b = null, bd = 1e9; for (const c of race.cars) { const d = Math.hypot(c.v.x - e.x, c.v.z - e.z); if (d < bd) { bd = d; b = c; } } console.log(`  SPARK clock=${race.clock.toFixed(1)} ${b.driver.code} s=${b.proj.s.toFixed(0)} d=${b.proj.d.toFixed(1)} u=${b.v.u.toFixed(0)} v=${b.v.v.toFixed(1)} pw=${e.power.toFixed(2)}`); } });
race.on('carhit', (e) => { if (args.hit && e.power > +args.hit) { const f = (c) => `${c.driver.code}(s${c.proj.s.toFixed(0)} d${c.proj.d.toFixed(1)} u${c.v.u.toFixed(0)} v${c.v.v.toFixed(1)} ${c.ai ? c.ai.state : ''})`; console.log(`  HIT clock=${race.clock.toFixed(1)} pw=${e.power.toFixed(1)} ${f(e.a)} x ${f(e.b)}`); } });
race.startSequence();
const dt = 1 / 120; let n = 0; const T0 = Date.now(); let lastPrint = 0;
if (args.scn) setTimeout(() => {}, 0);
while (race.phase !== 'results' && race.t < 600) {
  if (args.scn && Math.abs(race.clock - (+args.at || 40)) < dt / 2 && race.phase === 'racing') { for (const s of args.scn.split(',')) race.scenario(s); }
  if (args.pit && race.phase === 'racing' && race.clock > 10 && !race._pitReq) { race._pitReq = true; race.requestPit('H'); }
  race.step(dt); race.checkEnd(); n++;
  if (args.trace) { const tc = race.cars.find(c => c.driver.code === args.trace); if (tc.status === 'pit' && n % 60 === 0) console.log(`  PT clock=${race.clock.toFixed(1)} ${tc.pit.phase} idx=${tc.pit.idx} s=${tc.proj.s.toFixed(0)} d=${tc.proj.d.toFixed(1)} u=${tc.v.u.toFixed(1)} v=${tc.v.v.toFixed(1)} phi=${(tc.v.phi - Math.atan2(tc.proj.tz, tc.proj.tx)).toFixed(2)} dmg=${tc.v.damage.toFixed(0)} st=${tc.v.controls.steer.toFixed(2)}`); }
  if (race.t - lastPrint >= 20) { lastPrint = race.t; const s = race.sortedCars(); console.log(`t=${race.t.toFixed(0)} clock=${race.clock.toFixed(0)} ${race.phase}/${race.neutral} top: ` + s.slice(0, 4).map(c => `${c.driver.code}(${(c.dist / track.L).toFixed(2)})`).join(' ') + ` | stuck: ` + race.cars.filter(c => c.status === 'racing' && c.v.u < 3 && race.phase === 'racing').map(c => c.driver.code).join(',')); }
}
console.log('sim wall', ((Date.now() - T0) / 1000).toFixed(1), 's for', race.t.toFixed(0), 's simulated; steps', n);
const R = race.resultsData || race.finalize();
for (const r of R.rows) console.log(String(r.pos).padStart(2), r.driver.code, r.team.short.padEnd(12), r.status.padEnd(4), 'laps', r.laps, 'T', r.finished ? r.time.toFixed(1) : '-', 'pen', r.pen, 'best', r.best < 1e8 ? r.best.toFixed(2) : '-', 'stops', r.stops, 'gp', r.gained, 'top', (r.topSpeed * 3.6) | 0, 'lim', r.strikes);
console.log('sparks', race._sparks || 0, 'radio', radioCount, 'fastest', R.fastest.t.toFixed(2), R.fastest.car && R.fastest.car.driver.code);
const dmg = race.cars.map(c => c.driver.code + ':' + c.v.damage.toFixed(0)).join(' '); console.log('damage', dmg);
if (args.dump) for (const c of race.cars) console.log(c.driver.code, c.status, c.pit.phase, 'laps', c.lapsDone, 's', c.proj.s.toFixed(0), 'd', c.proj.d.toFixed(1), 'u', c.v.u.toFixed(1), 'box', c.pit.boxK, 'idx', c.pit.idx, 'req', c.pit.request, 'dmg', c.v.damage.toFixed(0), c.retired ? 'RET:' + c.retireReason : '');
