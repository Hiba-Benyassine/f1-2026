import { Vehicle } from '../src/vehicle.js';
const SURF={type:'track',grip:1,drag:0};
function run(fn,T,dt=1/120){const v=new Vehicle({compound:'M'});v.place(0,0,0);const log=[];for(let t=0;t<T;t+=dt){fn(v,t);v.update(dt,{surface:SURF,wetness:0,vmax:94});if(Math.abs(t%1)<dt)log.push([t,v.u*3.6,v.gear,v.rpm|0,v.ax]);}return {v,log};}
let r=run((v,t)=>{v.controls.throttle=1;},25);
console.log('accel: 0-100 / top:', r.log.filter((_,i)=>[1,2,3,5,8,12,20,24].includes(i)).map(l=>`${l[0].toFixed(0)}s ${l[1].toFixed(0)}km/h g${l[2]} ${l[3]}rpm ax${l[4].toFixed(2)}`).join(' | '));
// braking from 300
const v=new Vehicle({});v.place(0,0,0);v.setSpeed(83);let d=0,t=0;while(v.u>3&&t<20){v.controls.brake=1;v.update(1/120,{surface:SURF,wetness:0,vmax:94});d+=v.u/120;t+=1/120;}
console.log('brake 300->0:',d.toFixed(0),'m',t.toFixed(1),'s');
// steady circle at 40 m/s with steer such that R≈80
for (const sp of [30,50,70]){const w=new Vehicle({});w.place(0,0,0);w.setSpeed(sp);for(let i=0;i<600;i++){w.controls.throttle=0.35;w.controls.steer=Math.min(1,0.9*0.34/(1+(sp/24)**2)/ (0.34/(1+(sp/24)**2)));w.update(1/120,{surface:SURF,wetness:0,vmax:94});}
 console.log('steer full-limit @',sp,'m/s → u',w.u.toFixed(1),'r',w.r.toFixed(3),'R',(w.u/Math.max(1e-3,w.r)).toFixed(0),'ay',w.ayCentri.toFixed(2),'g slipping',w.sliding);}
