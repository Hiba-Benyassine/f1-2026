import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const cid = process.argv[2] || 'monza'; const t0 = +process.argv[3] || 24, t1 = +process.argv[4] || 28; const circuit = CIRCUITS.find(c => c.id === cid);
const track = buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 2, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'hard', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'timetrial', drive: 'auto', circuitId: cid, seed: 7, circuit });
race.startSequence(); const dt = 1 / 120; const car = race.player; let np = t0;
while (race.t < t1) { race.step(dt); if (race.t >= np) { np += 0.1; const V = car.v, p = car.proj; console.log(`t=${race.t.toFixed(2)} s=${p.s.toFixed(0)} d=${p.d.toFixed(1)} u=${V.u.toFixed(1)} v=${V.v.toFixed(1)} r=${V.r.toFixed(2)} vT=${(car.ai.vTarget||0).toFixed(1)} steer=${V.controls.steer.toFixed(2)} δ=${V.steer.toFixed(3)} thr=${V.controls.throttle.toFixed(2)} brk=${V.controls.brake.toFixed(2)} ph=${(V.phi-Math.atan2(p.tz,p.tx)).toFixed(2)} state=${car.ai.state} curv=${track.curvatureAt(p.s).toFixed(4)}`);} }
