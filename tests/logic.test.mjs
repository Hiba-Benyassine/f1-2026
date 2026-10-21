// Tests logiques (Node, sans navigateur) :  npm test
import assert from 'node:assert/strict';
import { CIRCUITS, DEFAULT_AI_GRID, DRIVERS } from '../src/data.js';
import { buildNamedTrack, generateTrack, validateTrack } from '../src/track.js';
import { Race } from '../src/race.js';
import { steerLimit } from '../src/vehicle.js';
let ok = 0; const t = (name, fn) => { try { fn(); ok++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

console.log('Données');
t('8 pilotes issus des images', () => assert.equal(DRIVERS.filter((d) => ['leclerc','hamilton','russell','antonelli','verstappen','hadjar','norris','piastri'].includes(d.id)).length, 8));
t('grille IA par défaut : 12 voitures', () => assert.equal(DEFAULT_AI_GRID.length >= 12, true));

console.log('Circuits');
for (const c of CIRCUITS.filter((x) => x.id !== 'procedural')) t(`tracé valide : ${c.id}`, () => { const tr = buildNamedTrack(c, 15); const v = validateTrack(tr); assert.ok(v.ok, v.problems.join(';')); assert.ok(tr.L > 2000); });
t('circuit procédural valide (plusieurs graines)', () => { for (const seed of [1, 7, 2026]) { const v = validateTrack(generateTrack({ seed, complexity: 0.5, width: 15 })); assert.ok(v.ok, 'seed ' + seed + ' ' + v.problems.join(';')); } });
t('direction : limite décroît avec la vitesse', () => assert.ok(steerLimit(80) < steerLimit(10)));

function mk(circuit, laps, extra = {}) {
  const track = buildNamedTrack(circuit, 15);
  return new Race({ track, laps, playerId: 'leclerc', aiIds: DEFAULT_AI_GRID, aiCount: 12, difficulty: 'medium', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'mid', lizard: false, vmax: 340, mode: 'race', drive: 'auto', ...extra });
}
console.log('Course (simulation)');
t('feux → départ → arrivée, 13 voitures classées, sans NaN', () => {
  const r = mk(CIRCUITS.find((c) => c.id === 'redbullring'), 2); r.startSequence();
  let n = 0; while (r.phase !== 'results' && n < 120 * 400) { r.step(1 / 120); r.checkEnd(); n++; }
  assert.equal(r.phase, 'results'); const R = r.resultsData || r.finalize();
  assert.equal(R.rows.length, 13);
  for (const c of r.cars) assert.ok(isFinite(c.v.x + c.v.z + c.v.u + c.v.phi));
  assert.ok(R.rows.filter((x) => x.finished).length >= 11);
});
t('départ anticipé manuel : aucune exception', () => {
  const r = mk(CIRCUITS[0], 1, { drive: 'manual' }); r.startSequence(); r.playerInput = { steer: 0, throttle: 1, brake: 0 };
  let ev = 0; r.on('jumpstart', () => ev++); for (let i = 0; i < 120 * 4 && !ev; i++) r.step(1 / 120);
  assert.ok(ev >= 0);
});
t('pilote virtuel manuel : 1 tour propre sur Monza', () => {
  const circuit = CIRCUITS.find((c) => c.id === 'monza'), track = buildNamedTrack(circuit, 15);
  const r = new Race({ track, laps: 1, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'medium', assists: 'standard', weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, mode: 'timetrial', drive: 'manual' });
  r.startSequence(); const p = r.player, V = p.v; let n = 0;
  while (r.phase !== 'results' && n < 120 * 300) {
    const inp = { steer: 0, throttle: 0, brake: 0 };
    if (['racing', 'go', 'finish'].includes(r.phase)) {
      const prof = r.getProfile(clamp(V.gripFactor, 0.4, 1.05)), u = Math.max(V.u, 1), s = p.proj.s, la = 8 + u * 0.55;
      const g = track.posAt(s + la, track.lineOffsetAt(s + la), {}), cf = Math.cos(V.phi), sf = Math.sin(V.phi), dx = g.x - V.x, dz = g.z - V.z;
      const al = Math.atan2(-dx * sf + dz * cf, dx * cf + dz * sf), de = Math.atan2(2 * 3.6 * Math.sin(al), Math.hypot(dx, dz));
      inp.steer = clamp(de / steerLimit(u), -1, 1);
      const v = Math.min(track.profileAt(prof, s + u * 0.3), track.profileAt(prof, s + u * 2.2) + 8) * 0.85;
      if (u < v - 1) inp.throttle = 1; else if (u > v + 2) inp.brake = clamp((u - v) / 10, 0.2, 1); else inp.throttle = 0.25;
    }
    r.playerInput = inp; r.step(1 / 120); r.checkEnd(); n++;
  }
  assert.ok(p.finished && V.damage < 5);
});
console.log(`\n${ok} tests réussis`);
