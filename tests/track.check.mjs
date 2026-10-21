import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack, validateTrack, generateTrack } from '../src/track.js';
import fs from 'node:fs';
const out = {};
for (const c of CIRCUITS) {
  if (c.id === 'procedural') continue;
  const tr = buildNamedTrack(c, 15); const v = validateTrack(tr);
  console.log(c.id, 'L=', tr.L.toFixed(0), 'minR=', v.minRadius.toFixed(1), 'straight', v.straight.before|0, v.straight.after|0, v.ok ? 'OK' : v.problems.join(' | '), 'pit', JSON.stringify({sIn:tr.pit.sIn|0,sOut:tr.pit.sOut|0, sp: tr.pit.spacing.toFixed(1)}), 'corners', tr.corners.length);
  out[c.id] = tr.outline(4);
}
for (const cx of [0.1, 0.5, 0.9]) { const tr = generateTrack({ seed: 2026, complexity: cx, width: 15 }); console.log('proc', cx, 'iter', tr.iterations, tr.validation.ok, tr.validation.problems, tr.L|0); out['proc' + cx] = tr.outline(4); }
fs.writeFileSync(process.argv[2] || '/tmp/outlines.json', JSON.stringify(out));
