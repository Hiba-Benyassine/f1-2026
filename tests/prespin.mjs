import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack, generateTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const cid = process.argv[2] || 'monza';
const circuit = CIRCUITS.find(c => c.id === cid);
const track = cid === 'procedural' ? generateTrack({ seed: 2026, complexity: 0.6, width: 15 }) : buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 3, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'hard', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'timetrial', drive: 'auto', circuitId: cid, seed: 7, circuit });
race.startSequence(); const dt = 1/120, car = race.player; const buf = []; let n = 0;
while (race.t < 120) {
  race.step(dt); race.checkEnd(); n++;
  const V = car.v, p = car.proj;
  if (n % 12 === 0) buf.push(`t=${race.t.toFixed(2)} s=${p.s.toFixed(0)} d=${p.d.toFixed(1)} u=${V.u.toFixed(1)} v=${V.v.toFixed(1)} r=${V.r.toFixed(2)} vT=${(car.ai.vTarget||0).toFixed(1)} thr=${V.controls.throttle.toFixed(2)} brk=${V.controls.brake.toFixed(2)} st=${V.controls.steer.toFixed(2)} T=${(V.tyre?.temp ?? 0).toFixed(0)} ${car.ai.state} aero=${(V.aero??V.aeroBlend??0).toFixed?.(2)} bst=${V.controls.boost?1:0} k=${track.lineKappaAt(p.s).toFixed(4)}`);
  if (race.phase === 'racing' && Math.abs(V.v) > 0.3 * Math.max(V.u, 10) && V.u > 8) { console.log(buf.slice(-18).join('\n')); break; }
}
