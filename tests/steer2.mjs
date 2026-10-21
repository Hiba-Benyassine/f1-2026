import { Vehicle } from '../src/vehicle.js';
const SURF={type:'track',grip:1,drag:0};
const w=new Vehicle({}); w.tyre.temp=92; w.place(0,0,0); w.setSpeed(70);
for(let i=0;i<300;i++){ w.controls.throttle=0; w.controls.steer=0.25; w.update(1/120,{surface:SURF,wetness:0,vmax:94});
 if(i%20==0){ const af=Math.atan2(w.v+1.95*w.r,Math.max(w.u,3))-w.steer, ar=Math.atan2(w.v-1.65*w.r,Math.max(w.u,3)); console.log((i/120).toFixed(2),'u',w.u.toFixed(1),'v',w.v.toFixed(2),'r',w.r.toFixed(3),'δ',w.steer.toFixed(3),'af',af.toFixed(3),'ar',ar.toFixed(3),'mu',w.muNow.toFixed(2),'grip',w.gripFactor.toFixed(2));}}
