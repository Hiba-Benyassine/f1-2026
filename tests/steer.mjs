import { Vehicle, steerLimit } from '../src/vehicle.js';
const SURF={type:'track',grip:1,drag:0};
for (const [sp,st,thr] of [[20,1,0.3],[20,0.6,0.3],[20,1,0],[40,1,0],[40,0.5,0],[70,1,0],[70,0.5,0]]){
 const w=new Vehicle({}); w.tyre.temp=92; w.place(0,0,0); w.setSpeed(sp); let out=[];
 for(let i=0;i<360;i++){ w.controls.throttle=thr; w.controls.steer=st; w.update(1/120,{surface:SURF,wetness:0,vmax:94}); if(i%60==59) out.push(`${(i/120).toFixed(1)}s u=${w.u.toFixed(1)} v=${w.v.toFixed(1)} r=${w.r.toFixed(2)} ay=${(w.u*w.r/9.81).toFixed(2)}g`);}
 console.log(`sp=${sp} steer=${st} thr=${thr} lim=${steerLimit(sp).toFixed(3)} | `+out.join(' | '));
}
