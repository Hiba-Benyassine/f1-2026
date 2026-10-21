import { CIRCUITS, DEFAULT_AI_GRID } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
for (const cid of ['monaco', 'monza', 'silverstone', 'redbullring']) {
  const circuit = CIRCUITS.find((c) => c.id === cid); const track = buildNamedTrack(circuit, 15);
  const race = new Race({ track, laps: 2, playerId: 'leclerc', aiIds: DEFAULT_AI_GRID, aiCount: 12, difficulty: 'medium', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'mid', lizard: false, vmax: 340, mode: 'race', drive: 'auto', circuitId: cid, seed: 1, circuit });
  race.startSequence(); let n = 0; while (race.phase !== 'results' && n < 120 * 600) { race.step(1 / 120); race.checkEnd(); n++; }
  const pen = race.cars.map((c) => `${c.driver.code}:${c.strikes}/${c.penaltySec}`).join(' ');
  console.log(cid.padEnd(12), 'clock', race.clock.toFixed(0), pen);
}
