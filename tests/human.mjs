// « Pilote virtuel » qui utilise UNIQUEMENT l'entrée joueur (steer/throttle/brake normalisés comme le clavier/manette)
// pour vérifier que la voie de contrôle manuel est pilotable (tours propres, sans AI autopilote).
import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
import { Race } from '../src/race.js';
import { steerLimit } from '../src/vehicle.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cid = process.argv[2] || 'monza', assists = process.argv[3] || 'standard', factor = +(process.argv[4] || 0.82);
const circuit = CIRCUITS.find((c) => c.id === cid), track = buildNamedTrack(circuit, 15);
const race = new Race({ track, laps: 2, playerId: 'leclerc', aiIds: [], aiCount: 0, difficulty: 'medium', assists, weather: 'dry', startTyre: 'M', gridPos: 'pole', lizard: false, vmax: 340, mode: 'timetrial', drive: 'manual', circuitId: cid, seed: 1, circuit });
race.startSequence(); const p = race.player, V = p.v; let n = 0, smooth = 0; const H = 1 / 120;
let maxD = 0;
while (race.phase !== 'results' && n < 120 * 400) {
  const inp = { steer: 0, throttle: 0, brake: 0, boost: false };
  if (race.phase === 'racing' || race.phase === 'go' || race.phase === 'finish') {
    const prof = race.getProfile(clamp(V.gripFactor, 0.4, 1.05));
    const u = Math.max(V.u, 1), la = 8 + u * 0.55, s = p.proj.s;
    const tgt = track.posAt(s + la, track.lineOffsetAt(s + la), {});
    const cf = Math.cos(V.phi), sf = Math.sin(V.phi), dx = tgt.x - V.x, dz = tgt.z - V.z, lf = dx * cf + dz * sf, lr = -dx * sf + dz * cf;
    const alpha = Math.atan2(lr, lf), delta = Math.atan2(2 * 3.6 * Math.sin(alpha), Math.hypot(dx, dz));
    let st = clamp(delta / steerLimit(u), -1, 1);
    // lissage de type clavier
    const rate = 5; smooth += clamp(st - smooth, -rate * H, rate * H); inp.steer = smooth;
    const vp = track.profileAt(prof, s + u * 0.3) * factor; const vNext = track.profileAt(prof, s + u * 2.2) * factor;
    const v = Math.min(vp, vNext + 8);
    if (u < v - 1) inp.throttle = 1; else if (u > v + 2) inp.brake = clamp((u - v) / 10, 0.2, 1); else inp.throttle = 0.25;
  }
  if (process.env.TR2 && race.t > 9.6 && race.t < 11.6 && n % 12 === 0) console.log(`t=${race.t.toFixed(2)} s=${p.proj.s.toFixed(0)} d=${p.proj.d.toFixed(2)} u=${(V.u*3.6).toFixed(0)} v=${V.v.toFixed(2)} r=${V.r.toFixed(2)} steer=${V.steer.toFixed(3)} cmd=${inp.steer.toFixed(2)} sl=${V.sliding} surf=${V.surfType} dmg=${V.damage.toFixed(0)} phi=${V.phi.toFixed(2)}`);
  if (process.env.TR && n % 120 === 0 && n < 120 * 40) console.log(`t=${(n/120).toFixed(0)} ph=${race.phase} s=${p.proj.s.toFixed(0)} d=${p.proj.d.toFixed(1)} u=${(V.u*3.6).toFixed(0)} thr=${inp.throttle} brk=${inp.brake.toFixed(2)} st=${inp.steer.toFixed(2)} dmg=${V.damage.toFixed(0)} status=${p.status}`);
  race.playerInput = inp; race.step(H); race.checkEnd(); n++; maxD = Math.max(maxD, Math.abs(p.proj.d));
}
console.log(cid, assists, 'f', factor, 'finished', p.finished, 'clock', race.clock.toFixed(1), 'laps', p.lapsDone, 'best', p.best < 1e8 ? p.best.toFixed(2) : '-', 'strikes', p.strikes, 'damage', V.damage.toFixed(0), 'maxD', maxD.toFixed(1), 'status', p.status);
