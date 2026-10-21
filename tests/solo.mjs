import { CIRCUITS, DEFAULT_AI_GRID } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const cid = process.argv[2] || 'monza'; const circuit = CIRCUITS.find(c => c.id === cid);
const track = buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 2, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'hard', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'timetrial', drive: 'auto', circuitId: cid, seed: 7, circuit });
race.startSequence(); const dt = 1 / 120; const car = race.player;
let nextPrint = 0;
while (race.phase !== 'results' && race.t < 200) {
  race.step(dt); race.checkEnd();
  if (race.t >= nextPrint) { nextPrint += 2; const V = car.v, p = car.proj; console.log(`t=${race.t.toFixed(1)} ${race.phase} s=${p.s.toFixed(0)} d=${p.d.toFixed(1)} u=${(V.u*3.6).toFixed(0)} vT=${((car.ai.vTarget||0)*3.6).toFixed(0)} steer=${V.controls.steer.toFixed(2)} thr=${V.controls.throttle.toFixed(2)} brk=${V.controls.brake.toFixed(2)} g=${V.gear} lat=${V.ayCentri.toFixed(1)} slip=${V.sliding} dmg=${V.damage.toFixed(0)} wear=${V.tyre.wear.toFixed(1)} lap=${car.lapsDone}`); }
}
console.log('laps', car.lapTimes.map(x => x.toFixed(2)), 'valid', car.lapValid, 'strikes', car.strikes, 'L', track.L.toFixed(0));
