// =====================================================================
//  FX : étincelles, fumée / embruns, confettis (système de particules léger)
// =====================================================================
import * as THREE from 'three';
import { glowCanvas } from './textures.js';

const VS = `
attribute float size; attribute vec4 col; varying vec4 vC;
void main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * (320.0 / max(1.0,-mv.z)); }`;
const FS = `
uniform sampler2D map; varying vec4 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if(gl_FragColor.a < 0.01) discard; }`;

class Pool {
  constructor(n, additive, tex, fog = true) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n); this.grav = new Float32Array(n); this.base = new Float32Array(n * 4); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { map: { value: tex } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false;
    for (let k = 0; k < n; k++) this.pos[k * 3 + 1] = -999;
  }
  emit(x, y, z, vx, vy, vz, size, life, r, g, b, a, grow = 0, grav = 0, drag = 0) {
    const k = this.i; this.i = (this.i + 1) % this.n;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z; this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.size[k] = size; this.life[k] = life; this.max[k] = life; this.grow[k] = grow; this.grav[k] = grav; this.drag[k] = drag;
    this.base[k * 4] = r; this.base[k * 4 + 1] = g; this.base[k * 4 + 2] = b; this.base[k * 4 + 3] = a;
  }
  update(dt) {
    const { pos, vel, col, size, life, max, grow, grav, base, drag } = this;
    for (let k = 0; k < this.n; k++) {
      if (life[k] <= 0) { if (pos[k * 3 + 1] > -900) { pos[k * 3 + 1] = -999; col[k * 4 + 3] = 0; } continue; }
      life[k] -= dt; const f = Math.max(0, life[k] / max[k]);
      const dr = Math.max(0, 1 - drag[k] * dt);
      vel[k * 3] *= dr; vel[k * 3 + 1] = vel[k * 3 + 1] * dr - grav[k] * dt; vel[k * 3 + 2] *= dr;
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      if (pos[k * 3 + 1] < 0.02 && grav[k] > 0) { pos[k * 3 + 1] = 0.02; vel[k * 3 + 1] *= -0.3; vel[k * 3] *= 0.7; vel[k * 3 + 2] *= 0.7; }
      size[k] += grow[k] * dt;
      col[k * 4] = base[k * 4]; col[k * 4 + 1] = base[k * 4 + 1]; col[k * 4 + 2] = base[k * 4 + 2]; col[k * 4 + 3] = base[k * 4 + 3] * f;
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.col.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, quality = 'high') {
    const tex = new THREE.CanvasTexture(glowCanvas());
    const k = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
    this.sparks = new Pool(Math.round(500 * k) + 100, true, tex);
    this.smoke = new Pool(Math.round(700 * k) + 100, false, tex);
    this.group = new THREE.Group(); this.group.add(this.smoke.mesh, this.sparks.mesh); scene.add(this.group);
    this.t = 0;
  }
  spark(x, z, power = 1, y = 0.25) {
    const n = Math.round(10 + power * 22);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 3 + Math.random() * 9 * power;
      this.sparks.emit(x, y, z, Math.cos(a) * sp, 1.5 + Math.random() * 4, Math.sin(a) * sp, 0.18 + Math.random() * 0.2, 0.35 + Math.random() * 0.5, 1, 0.65 + Math.random() * 0.3, 0.2, 1, -0.2, 18, 0.5);
    }
  }
  /** fumée de pneu / poussière / embruns derrière une voiture */
  trail(x, z, vx, vz, kind, amount = 1) {
    const rain = kind === 'spray', dust = kind === 'dust';
    const c = rain ? [0.85, 0.9, 0.95] : dust ? [0.55, 0.46, 0.34] : [0.85, 0.85, 0.85];
    this.smoke.emit(x + (Math.random() - 0.5) * 0.6, 0.15, z + (Math.random() - 0.5) * 0.6, vx * 0.1 + (Math.random() - 0.5) * 1.5, rain ? 1.4 : 0.9, vz * 0.1 + (Math.random() - 0.5) * 1.5,
      (rain ? 1.6 : 1.2) * amount, rain ? 0.8 : 1.2, c[0], c[1], c[2], rain ? 0.22 : 0.3, rain ? 2.5 : 1.8, 0, 1.2);
  }
  burst(x, y, z, r, g, b, n = 20, speed = 6, size = 0.5) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = Math.random() * 3.14 - 1.57, sp = speed * (0.4 + Math.random()); this.smoke.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, size, 1 + Math.random(), r, g, b, 0.8, 0.4, 3, 1.5); }
  }
  update(dt) { this.t += dt; this.sparks.update(dt); this.smoke.update(dt); }
}

/** Confettis (podium) : petits rectangles instanciés */
export class Confetti {
  constructor(scene, n = 500) {
    this.n = n; this.scene = scene;
    const geo = new THREE.PlaneGeometry(0.12, 0.07);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false }), n);
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.p = Array.from({ length: n }, () => ({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wr: 0, life: 0 }));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1); this.v = new THREE.Vector3(); this.c = new THREE.Color();
    const pal = ['#ffd400', '#ff2d2d', '#2fc84a', '#2a7bff', '#ffffff', '#ff7ac8', '#00d7c0', '#ff8000'];
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this.c.set(pal[i % pal.length]));
    this.k = 0;
  }
  burst(x, y, z, count = 120, spread = 6) {
    for (let i = 0; i < count; i++) {
      const p = this.p[this.k]; this.k = (this.k + 1) % this.n;
      const a = Math.random() * 6.283, sp = Math.random() * spread;
      p.x = x + (Math.random() - 0.5) * 2; p.y = y; p.z = z + (Math.random() - 0.5) * 2; p.vx = Math.cos(a) * sp; p.vy = 6 + Math.random() * 9; p.vz = Math.sin(a) * sp;
      p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.rz = Math.random() * 6; p.wr = 3 + Math.random() * 8; p.life = 5 + Math.random() * 4;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt; p.vy -= 7 * dt; p.vx *= 1 - 0.5 * dt; p.vz *= 1 - 0.5 * dt; if (p.vy < -2.2) p.vy = -2.2 + Math.sin(p.life * 6 + i) * 0.4;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wr * dt; p.ry += p.wr * 0.7 * dt; if (p.y < 0) { p.y = 0; p.life = Math.min(p.life, 0.3); }
        this.v.set(p.x, p.y, p.z);
      } else this.v.set(0, -50, 0);
      this.e.set(p.rx, p.ry, p.rz); this.q.setFromEuler(this.e); this.m.compose(this.v, this.q, this.s); this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
