import { CIRCUITS } from '../src/data.js';
import { buildNamedTrack } from '../src/track.js';
const tr = buildNamedTrack(CIRCUITS.find(c=>c.id==='monza'),15);
const prof = tr.speedProfile({muScale:0.86, vmax:94});
for (let s=380;s<=470;s+=8){ const i=Math.round(s/tr.ds); console.log(s, 'cK', tr.kap[i].toFixed(4), 'lineD', tr.lineD[i].toFixed(1), 'lineK', tr.lineKappa[i].toFixed(4), 'prof', (prof[i]).toFixed(1), 'aNeeded', (prof[i]**2*Math.abs(tr.lineKappa[i])).toFixed(1)); }
