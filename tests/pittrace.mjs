import { CIRCUITS, DEFAULT_AI_GRID } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const code = process.argv[2] || 'STR', cid = process.argv[3] || 'monza', t0 = +(process.argv[4] || 0), t1 = +(process.argv[5] || 400);
const circuit = CIRCUITS.find(c => c.id === cid); const track = buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 4, playerId: 'leclerc', aiIds: DEFAULT_AI_GRID, aiCount: 12, difficulty: 'medium', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'mid', lizard: true, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'race', drive: 'auto', circuitId: cid, seed: 7, circuit });
race.startSequence(); const dt = 1/120; let np = 0; const car = race.cars.find(c => c.driver.code === code); race.on('carhit', e => { if (e.a === car || e.b === car) console.log('  HIT', race.clock.toFixed(1), 'pw', e.power.toFixed(1), e.a.driver.code, e.b.driver.code); });
console.log('pit', JSON.stringify({ sIn: track.pit.sIn, sOut: track.pit.sOut, ramp: track.pit.ramp, dLane: track.pit.dLane, exitIdx: track.pitExitIdx, n: track.pitPath.length }));
while (race.phase !== 'results' && race.clock < t1) { race.step(dt); race.checkEnd(); if (race.clock >= Math.max(np, t0) && race.clock >= np) { np = race.clock + 1; if (car.status === 'pit') { const V = car.v; console.log(`clock=${race.clock.toFixed(0)} ${car.pit.phase} idx=${car.pit.idx} s=${car.proj.s.toFixed(0)} d=${car.proj.d.toFixed(1)} u=${V.u.toFixed(1)} v=${V.v.toFixed(1)} t=${car.pit.t.toFixed(1)} exitWait=${car.pit.exitWait} light=${race.pitExitLight}`); } } }
