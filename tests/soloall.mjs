import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack, generateTrack } from '../src/track.js';
import { Race } from '../src/race.js';
const ids = process.argv[2] ? process.argv[2].split(',') : ['monza', 'monaco', 'silverstone', 'redbullring', 'procedural'];
const diff = process.argv[3] || 'hard', weather = process.argv[4] || 'dry';
for (const cid of ids) {
  const circuit = CIRCUITS.find(c => c.id === cid);
  const track = cid === 'procedural' ? generateTrack({ seed: 2026, complexity: 0.6, width: 15 }) : buildNamedTrack(circuit, 15);
  const race = new Race({ track, laps: 3, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: diff, assists: 'standard', weather, startTyre: weather==='wet'?'W':'M', gridPos: 'pole', lizard: false, vmax: 340, startDelay: 0.2, rules: 'standard', mode: 'timetrial', drive: 'auto', circuitId: cid, seed: 7, circuit });
  race.startSequence(); const dt = 1 / 120; const car = race.player; let anomalies = 0, firstAn = null, maxD = 0, wall = 0;
  let prevDmg = 0;
  while (race.phase !== 'results' && race.t < 260) {
    race.step(dt); race.checkEnd();
    const p = car.proj, V = car.v;
    if (race.phase === 'racing') { maxD = Math.max(maxD, Math.abs(p.d)); if (V.damage > prevDmg + 0.5) { wall++; prevDmg = V.damage; } if ((Math.abs(V.v) > 0.5 * Math.max(V.u, 10)) || V.u < 3 && race.clock > 12) { anomalies++; if (!firstAn) firstAn = { t: race.t.toFixed(1), s: p.s.toFixed(0), d: p.d.toFixed(1), u: (V.u * 3.6).toFixed(0), state: car.ai.state }; } }
  }
  console.log(cid.padEnd(12), 'L', track.L.toFixed(0), 'laps', car.lapTimes.map(x => x.toFixed(1)).join(','), 'valid', car.lapValid.map(v => v ? 1 : 0).join(''), 'strikes', car.strikes, 'maxD', maxD.toFixed(1), 'hits', wall, 'dmg', car.v.damage.toFixed(0), 'wear', car.v.tyre.wear.toFixed(0), 'anom', anomalies, JSON.stringify(firstAn));
}
