import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const cid = process.argv[2] || 'monza'; const circuit = CIRCUITS.find(c => c.id === cid);
const track = buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 2, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'hard', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'timetrial', drive: 'auto', circuitId: cid, seed: 7, circuit });
race.startSequence(); const dt = 1 / 120; const car = race.player; let hist = [];
while (race.t < 200) { const V = car.v; hist.push(`${race.t.toFixed(3)} x=${V.x.toFixed(1)} u=${V.u} v=${V.v} r=${V.r} st=${V.steer} ctl=${JSON.stringify(V.controls)} d=${car.proj.d} s=${car.proj.s} st=${car.status}`); if (hist.length > 6) hist.shift(); race.step(dt); if (!isFinite(car.v.u) || !isFinite(car.v.x)) { console.log('NaN at', race.t); console.log(hist.join('\n')); break; } }
