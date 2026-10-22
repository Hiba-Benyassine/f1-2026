// =====================================================================
//  PODIUM : scène animée (marches, 3 premiers, trophée, confettis, public, projecteurs, musique)
// =====================================================================
import * as THREE from 'three';
import { makeHuman, makeTrophy } from './characters.js';
import { buildCar } from './carModel.js';
import { Confetti } from './fx.js';
import * as TX from './textures.js';

export class PodiumScene {
  constructor(renderer, rows, opts = {}) {
    this.renderer = renderer; this.t = 0; this.rows = rows.slice(0, 3); this.opts = opts;
    const scene = this.scene = new THREE.Scene(); scene.background = new THREE.Color('#04060c'); scene.fog = new THREE.FogExp2('#05070d', 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    const pm = new THREE.PMREMGenerator(renderer), tex = new THREE.CanvasTexture(TX.envCanvas(['#0b1020', '#2a3560', '#6b7bb8'], '#15171c')); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pm.fromEquirectangular(tex).texture; scene.environmentIntensity = 0.6; pm.dispose(); tex.dispose();
    scene.add(new THREE.HemisphereLight('#7f93ff', '#201018', 0.6));
    // sol
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#0d1018', roughness: 0.28, metalness: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.5, 64), new THREE.MeshBasicMaterial({ color: '#ff2a1a' })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    // fond : grand panneau + bandeau
    const back = new THREE.Mesh(new THREE.PlaneGeometry(56, 14), new THREE.MeshBasicMaterial({ map: TX.canvasTex(TX.boardCanvas('GRAND PRIX 2026', '#0a0d16', '#ffffff', '#e10600', 1024, 256), { wrap: false }) })); back.position.set(0, 9.5, -22); scene.add(back);
    // marches
    const stepMat = new THREE.MeshStandardMaterial({ color: '#d7dbe3', roughness: 0.35, metalness: 0.4 });
    const heights = { 1: 1.0, 0: 0.72, 2: 0.48 }; // index de classement -> hauteur ; positions : P2 gauche, P1 centre, P3 droite
    const xs = { 0: 0, 1: -2.3, 2: 2.3 };
    this.slots = [];
    this.rows.forEach((row, i) => {
      const h = [1.0, 0.72, 0.48][i], x = xs[i];
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.1, h, 2.0), stepMat); step.position.set(x, h / 2, 0); step.castShadow = step.receiveShadow = true; scene.add(step);
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: TX.canvasTex(TX.numberCanvas(i + 1, i === 0 ? '#ffd400' : i === 1 ? '#d9dde6' : '#e6a06a', null), { wrap: false }), transparent: true })); nm.position.set(x, h / 2, 1.011); scene.add(nm);
      const T = row.team;
      const hm = makeHuman({ suit: T.suit === '#15191c' || T.suit === '#101114' ? '#2a2f38' : T.suit, trim: T.accent === '#101010' ? '#ffffff' : T.accent, hat: 'cap', gloves: '#fff' });
      hm.root.position.set(x, h, 0); hm.root.rotation.y = -Math.PI / 2; scene.add(hm.root);
      const trophy = makeTrophy(); scene.add(trophy);
      this.slots.push({ row, x, h, hm, trophy, i });
      // voiture de l'équipe derrière
      const car = buildCar(T, row.driver, { compound: 'M' }); car.group.position.set(x * 2.6, 0, -4.2 - i * 0.3); car.group.rotation.y = -(Math.PI / 2) + (i === 0 ? 0 : (x < 0 ? -0.35 : 0.35)) * -1; scene.add(car.group);
      car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    });
    // projecteurs
    this.spots = [];
    const cols = ['#ff3b30', '#ffffff', '#4b8bff'];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.SpotLight(cols[k], 380, 40, 0.35, 0.6, 1.6); s.position.set((k - 1) * 8, 12, 6); s.target.position.set((k - 1) * 2.3, 1.5, 0); if (k === 1) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0003; } scene.add(s, s.target); this.spots.push(s);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 12, 24, 1, true), new THREE.MeshBasicMaterial({ color: cols[k], transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.set((k - 1) * 4.6, 6, 0); beam.rotation.z = (k - 1) * -0.18; scene.add(beam);
    }
    const key = new THREE.DirectionalLight('#fff2dd', 1.4); key.position.set(4, 8, 9); scene.add(key);
    // tribune derrière le podium + public (instances)
    const stairMat = new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.9 });
    for (let r = 0; r < 6; r++) { const st = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5 * (r + 1), 1.15), stairMat); st.position.set(0, 0.25 * (r + 1), -9.5 - r * 1.15); scene.add(st); }
    const N = 6 * 64, geoB = new THREE.CapsuleGeometry(0.2, 0.34, 3, 6).translate(0, 0.45, 0), geoH = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.92, 0);
    this.crowdN = N; this.bodies = new THREE.InstancedMesh(geoB, new THREE.MeshStandardMaterial({ roughness: 0.85 }), N); this.heads = new THREE.InstancedMesh(geoH, new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    const shirts = ['#d62828', '#f77f00', '#fcbf49', '#eae2b7', '#2a9d8f', '#4361ee', '#ffffff', '#e5383b', '#222222', '#8338ec', '#06d6a0'], skins = ['#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#ffdbb4'];
    this.crowd = []; const col = new THREE.Color(), m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / 64), k = i % 64;
      this.crowd.push({ x: -15.5 + k * (31 / 63) + (row % 2) * 0.25, z: -9.5 - row * 1.15, y: 0.5 * (row + 1), ph: Math.random() * 6.28, sp: 4 + Math.random() * 4, face: 0 });
      this.bodies.setColorAt(i, col.set(shirts[(Math.random() * shirts.length) | 0])); this.heads.setColorAt(i, col.set(skins[(Math.random() * skins.length) | 0]));
    }
    this.group = new THREE.Group(); this.group.add(this.bodies, this.heads); scene.add(this.group); this._m = m;
    this.confetti = new Confetti(scene, 700);
    this.shots = [[0, 3.0, 9.5, 0, 2.0, 0], [6.5, 2.0, 6.5, 0, 2.2, 0], [-5.5, 1.4, 5.5, 0, 2.4, 0]];
    this.burstT = 0.4; this.burstN = 0;
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  update(dt, audio) {
    this.t += dt; const t = this.t, m = this._m, q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    // humains
    for (const sl of this.slots) {
      const win = sl.i === 0; const base = win ? 'trophy' : 'celebrate';
      sl.hm.pose(t > 1.2 ? base : 'wave', t * (win ? 1 : 0.9));
      sl.trophy.visible = t > 1.2;
      sl.trophy.position.set(sl.x + 0.05, sl.h + 2.28 + Math.abs(Math.sin(t * 5)) * (win ? 0.12 : 0.05), 0.15); sl.trophy.rotation.y = t * 1.2;
    }
    // public
    for (let i = 0; i < this.crowdN; i++) {
      const c = this.crowd[i], j = Math.max(0, Math.sin(t * c.sp + c.ph)) * (t > 2 ? 0.28 : 0.05);
      p.set(c.x, c.y + j, c.z); e.set(0, c.face, 0); q.setFromEuler(e); m.compose(p, q, s); this.bodies.setMatrixAt(i, m); this.heads.setMatrixAt(i, m);
    }
    this.bodies.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true; if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true; if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    // projecteurs balayent
    this.spots.forEach((sp, k) => { sp.target.position.x = (k - 1) * 2.3 + Math.sin(t * 0.8 + k * 2) * 1.5; });
    // confettis par salves
    this.burstT -= dt;
    if (this.burstT <= 0) { this.burstT = this.burstN < 6 ? 0.7 : 2.2; this.burstN++; this.confetti.burst((Math.random() - 0.5) * 6, 5 + Math.random() * 3, (Math.random() - 0.5) * 2, 90, 5); if (audio) { audio.cheer(0.8); } }
    this.confetti.update(dt);
    // caméra : plans successifs
    const shot = Math.floor(t / 9) % 3, f = (t % 9) / 9, S = this.shots[shot], k = f * f * (3 - 2 * f);
    const ox = Math.sin(t * 0.25) * 1.2;
    this.camera.position.set(S[0] * (1 - 0.15 * k) + ox, S[1] + k * 0.4, S[2] - k * 1.2); this.camera.lookAt(S[3], S[4] + (shot === 0 ? 0.3 : 0), S[5]);
  }
  dispose() { this.confetti.dispose(); this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
