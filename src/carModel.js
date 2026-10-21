// =====================================================================
//  CAR MODEL : monoplace F1 procédurale (carrosserie « loftée », ailerons, halo,
//  roues qui tournent / braquent, feux stop, aileron mobile (aéro active), pneus colorés).
//  Remplaçable : si public/assets/models/car.glb existe, main.js peut l'utiliser (voir docs).
//  Repère local : +X avant, +Y haut, +Z droite. Origine = centre de gravité, au sol.
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTex, numberCanvas } from './textures.js';
import { TYRES } from './data.js';
import { CAR } from './constants.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- lofts
function ringPts(x, w, y0, y1, n, N) {
  const pts = [], cy = (y0 + y1) / 2, hh = (y1 - y0) / 2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a);
    pts.push([x, cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * hh, Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w]);
  }
  return pts;
}
/** sections : [x, demi-largeur, yBas, yHaut, exposant] (du plus en avant au plus en arrière) */
export function loft(secs, N = 16, zOff = 0) {
  const pos = [], idx = [];
  secs.forEach((s) => ringPts(s[0], s[1], s[2], s[3], s[4] || 3, N).forEach((p) => pos.push(p[0], p[1], p[2] + zOff)));
  for (let i = 0; i < secs.length - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + ((k + 1) % N), c = (i + 1) * N + k, d = (i + 1) * N + ((k + 1) % N);
    idx.push(a, c, b, b, c, d);
  }
  // capuchons
  for (const [si, flip] of [[0, false], [secs.length - 1, true]]) {
    const s = secs[si], ci = pos.length / 3; pos.push(s[0], (s[2] + s[3]) / 2, zOff);
    for (let k = 0; k < N; k++) { const a = si * N + k, b = si * N + ((k + 1) % N); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };
const cyl = (r0, r1, len, from, to) => {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = b.clone().sub(a), L = dir.length();
  const g = new THREE.CylinderGeometry(r0, r1, L, 6); g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g;
};

// ---------------------------------------------------------------- cache global
const cache = { geo: null, tyreTex: {}, brakeTex: null };

function tyreTexture(comp) {
  if (cache.tyreTex[comp]) return cache.tyreTex[comp];
  const T = TYRES[comp] || TYRES.M, c = makeCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#101010'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1b1b1d'; g.beginPath(); g.arc(128, 128, 120, 0, TAU); g.fill();
  g.strokeStyle = T.color; g.lineWidth = 9; g.beginPath(); g.arc(128, 128, 98, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; g.beginPath(); g.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); g.stroke(); }
  // jante magnésium
  g.fillStyle = '#2b2d31'; g.beginPath(); g.arc(128, 128, 72, 0, TAU); g.fill();
  g.fillStyle = '#16171a'; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.beginPath(); g.arc(128 + Math.cos(a) * 46, 128 + Math.sin(a) * 46, 11, 0, TAU); g.fill(); }
  g.fillStyle = '#c9ccd2'; g.beginPath(); g.arc(128, 128, 11, 0, TAU); g.fill();
  g.fillStyle = T.color; g.fillRect(124, 62, 8, 18);   // repère de rotation
  const t = canvasTex(c, { wrap: false }); return (cache.tyreTex[comp] = t);
}

function buildGeometries() {
  if (cache.geo) return cache.geo;
  const G = {};
  // ----- carrosserie principale (monocoque + nez + capot moteur)
  const main = [
    [2.78, 0.035, 0.16, 0.22, 2.4], [2.45, 0.095, 0.16, 0.30, 2.6], [2.0, 0.15, 0.15, 0.38, 3], [1.45, 0.21, 0.13, 0.50, 3.4],
    [0.75, 0.26, 0.12, 0.60, 4], [0.05, 0.27, 0.12, 0.62, 4], [-0.65, 0.255, 0.13, 0.66, 3.6], [-1.35, 0.20, 0.16, 0.62, 3.2], [-2.0, 0.12, 0.2, 0.52, 2.8], [-2.52, 0.06, 0.24, 0.42, 2.4],
  ];
  G.body = loft(main, 16);
  const side = [[0.62, 0.15, 0.11, 0.40, 2.8], [0.2, 0.20, 0.09, 0.52, 3], [-0.5, 0.2, 0.10, 0.50, 3], [-1.2, 0.15, 0.12, 0.42, 2.8], [-1.95, 0.08, 0.14, 0.32, 2.4]];
  G.sideR = loft(side, 14, 0.46); G.sideL = loft(side, 14, -0.46);
  G.airbox = loft([[-0.35, 0.09, 0.56, 0.78, 2.8], [-0.75, 0.11, 0.56, 0.86, 2.8], [-1.3, 0.07, 0.56, 0.70, 2.6]], 12);
  G.inlets = mergeGeometries([box(0.05, 0.16, 0.26, 0.64, 0.30, 0.45), box(0.05, 0.16, 0.26, 0.64, 0.30, -0.45), box(0.06, 0.12, 0.16, -0.38, 0.72, 0)]);
  // ----- fond plat, diffuseur, fences
  const floor = [box(3.5, 0.03, 1.55, -0.1, 0.07, 0), box(0.9, 0.03, 1.15, -1.95, 0.14, 0, 0, 0, 0.18)];
  for (const sz of [-1, 1]) { floor.push(box(2.4, 0.07, 0.02, -0.3, 0.1, sz * 0.78)); floor.push(box(0.5, 0.2, 0.02, 1.38, 0.13, sz * 0.56)); }
  G.floor = mergeGeometries(floor);
  // ----- aileron avant
  const fw = [box(0.46, 0.022, 1.9, 2.72, 0.13, 0), box(0.30, 0.02, 1.8, 2.62, 0.2, 0, 0, 0, -0.1), box(0.22, 0.02, 1.7, 2.58, 0.27, 0, 0, 0, -0.16)];
  for (const sz of [-1, 1]) { fw.push(box(0.62, 0.3, 0.03, 2.66, 0.2, sz * 0.96)); fw.push(box(0.08, 0.14, 0.04, 2.9, 0.34, sz * 0.96, 0, 0, 0.5)); }
  fw.push(box(0.1, 0.16, 0.08, 2.5, 0.2, 0.0)); fw.push(cyl(0.025, 0.025, 0, [2.45, 0.2, 0.06], [2.3, 0.3, 0.05])); fw.push(cyl(0.025, 0.025, 0, [2.45, 0.2, -0.06], [2.3, 0.3, -0.05]));
  G.frontWing = mergeGeometries(fw);
  // ----- aileron arrière
  const rw = [box(0.34, 0.02, 1.0, -2.42, 0.98, 0, 0, 0, 0.08), box(0.28, 0.02, 0.98, -2.5, 0.62, 0), box(0.1, 0.5, 0.05, -2.47, 0.76, 0.58)];
  rw.push(box(0.1, 0.5, 0.05, -2.47, 0.76, -0.58)); rw.push(box(0.1, 0.4, 0.08, -2.3, 0.78, 0)); rw.push(box(0.55, 0.05, 0.5, -2.1, 0.3, 0));
  G.rearWing = mergeGeometries(rw);
  G.drs = (() => { const g = new THREE.BoxGeometry(0.3, 0.018, 0.98); g.translate(-0.12, 0, 0); return g; })();
  // ----- halo
  const halo = [];
  const hp = new THREE.CatmullRomCurve3([new THREE.Vector3(0.62, 0.55, 0.28), new THREE.Vector3(0.38, 0.8, 0.22), new THREE.Vector3(0.0, 0.84, 0.28), new THREE.Vector3(-0.26, 0.68, 0.3)]);
  halo.push(new THREE.TubeGeometry(hp, 14, 0.02, 6)); const hp2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.62, 0.55, -0.28), new THREE.Vector3(0.38, 0.8, -0.22), new THREE.Vector3(0.0, 0.84, -0.28), new THREE.Vector3(-0.26, 0.68, -0.3)]);
  halo.push(new THREE.TubeGeometry(hp2, 14, 0.02, 6)); halo.push(cyl(0.022, 0.022, 0, [0.62, 0.5, 0], [0.4, 0.8, 0]));
  halo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.38, 0.8, 0.22), new THREE.Vector3(0.38, 0.84, 0), new THREE.Vector3(0.38, 0.8, -0.22)]), 8, 0.02, 6));
  G.halo = mergeGeometries(halo);
  // ----- suspensions
  const susp = [];
  for (const [ax, wz] of [[1.95, 0.78], [-1.65, 0.75]]) for (const sz of [-1, 1]) {
    const hub = [ax, 0.32, sz * (wz - 0.15)];
    susp.push(cyl(0.012, 0.012, 0, [ax + 0.2, 0.34, sz * 0.2], hub)); susp.push(cyl(0.012, 0.012, 0, [ax - 0.2, 0.30, sz * 0.2], hub));
    susp.push(cyl(0.011, 0.011, 0, [ax + 0.05, 0.26, sz * 0.22], [ax, 0.2, sz * (wz - 0.15)])); susp.push(cyl(0.01, 0.01, 0, [ax, 0.5, sz * 0.2], hub));
  }
  G.susp = mergeGeometries(susp);
  // ----- pilote
  G.helmet = new THREE.SphereGeometry(0.135, 14, 12); G.helmet.scale(1.1, 1, 0.95); G.helmet.translate(0.02, 0.7, 0);
  G.visor = new THREE.SphereGeometry(0.14, 12, 8, -0.9, 1.8, 1.25, 0.55); G.visor.scale(1.1, 1, 0.97); G.visor.translate(0.04, 0.7, 0);
  G.torso = mergeGeometries([box(0.28, 0.17, 0.36, -0.18, 0.6, 0), box(0.2, 0.1, 0.3, 0.12, 0.54, 0)]);
  G.wheelGuard = box(0.02, 0.02, 0.02, 0, 0, 0);
  // ----- roues : pneu (cylindre axe Z) et faces
  const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  G.tyreF = new THREE.CylinderGeometry(0.33, 0.33, 0.30, 26, 1, true).applyMatrix4(rot);
  G.tyreR = new THREE.CylinderGeometry(0.36, 0.36, 0.40, 26, 1, true).applyMatrix4(rot);
  G.faceF = new THREE.CircleGeometry(0.33, 26); G.faceR = new THREE.CircleGeometry(0.36, 26);
  G.disc = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14).applyMatrix4(rot);
  return (cache.geo = G);
}

const teamMats = {};
function matsFor(team) {
  const key = team.short;
  if (teamMats[key]) return teamMats[key];
  const body = new THREE.MeshPhysicalMaterial({ color: team.body, metalness: 0.28, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhysicalMaterial({ color: team.accent, metalness: 0.2, roughness: 0.38, clearcoat: 0.8, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: team.dark === '#000000' ? '#0a0a0b' : team.dark, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  const carbon = new THREE.MeshStandardMaterial({ color: '#0d0e10', metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: '#6c7078', metalness: 0.9, roughness: 0.35 });
  return (teamMats[key] = { body, accent, dark, carbon, metal });
}

const glowTex = (() => { let t = null; return () => { if (t) return t; const c = makeCanvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); t = new THREE.CanvasTexture(c); return t; }; })();

/**
 * Construit un modèle de voiture.
 * @returns {{group:THREE.Group, update:Function, setCompound:Function, dispose:Function}}
 */
export function buildCar(team, driver, opts = {}) {
  const G = buildGeometries(), M = matsFor(team);
  const group = new THREE.Group(); group.name = 'car-' + driver.code;
  const body = new THREE.Group(); group.add(body);          // pour roulis / tangage
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; parent.add(m); return m; };

  add(G.body, M.body); add(G.sideR, M.body); add(G.sideL, M.body); add(G.airbox, M.body);
  add(G.floor, M.carbon); add(G.inlets, M.carbon, body, false); add(G.halo, M.carbon); add(G.susp, M.carbon, body, false);
  add(G.frontWing, M.carbon); add(G.rearWing, M.carbon);
  // bandes de livrée (accent) : sur le nez, le capot et les ailerons
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.012, 0.09), M.accent); stripe.position.set(1.35, 0.615, 0); stripe.rotation.z = -0.08; body.add(stripe);
  const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.012, 0.09), M.accent); stripe2.position.set(-1.5, 0.64, 0); stripe2.rotation.z = 0.12; body.add(stripe2);
  for (const sz of [-1, 1]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.012), M.accent); sp.position.set(-0.2, 0.46, sz * 0.66); body.add(sp); }
  const fwTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 1.74), M.accent); fwTop.position.set(2.58, 0.285, 0); fwTop.rotation.z = -0.16; body.add(fwTop);
  // aileron mobile (aéro active)
  const drsPivot = new THREE.Group(); drsPivot.position.set(-2.32, 0.995, 0); body.add(drsPivot); add(G.drs, M.accent, drsPivot);
  // pilote
  const helm = new THREE.MeshPhysicalMaterial({ color: driver.helmet || team.accent, metalness: 0.15, roughness: 0.22, clearcoat: 1 });
  add(G.helmet, helm); add(G.visor, new THREE.MeshPhysicalMaterial({ color: '#05070a', metalness: 0.9, roughness: 0.08, clearcoat: 1 }), body, false);
  add(G.torso, new THREE.MeshStandardMaterial({ color: team.suit, roughness: 0.7 }), body, false);
  // numéros
  const nTex = canvasTex(numberCanvas(driver.number, '#ffffff'), { wrap: false });
  const nMat = new THREE.MeshBasicMaterial({ map: nTex, transparent: true, depthWrite: false });
  const numTop = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), nMat); numTop.rotation.x = -Math.PI / 2; numTop.rotation.z = -Math.PI / 2; numTop.position.set(-1.15, 0.672, 0); body.add(numTop);
  const numNose = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), nMat); numNose.rotation.x = -Math.PI / 2; numNose.rotation.z = -Math.PI / 2; numNose.position.set(1.7, 0.405, 0); numNose.rotation.y = 0; body.add(numNose);
  for (const sz of [-1, 1]) { const ns = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), nMat); ns.position.set(-0.1, 0.38, sz * 0.662); ns.rotation.y = sz > 0 ? 0 : Math.PI; body.add(ns); }

  // feux arrière (stop / pluie)
  const tailMat = new THREE.MeshBasicMaterial({ color: '#550000' });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.1), tailMat); tail.position.set(-2.55, 0.46, 0); body.add(tail);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ff2020', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.6, 1.6, 1); glow.position.set(-2.7, 0.46, 0); body.add(glow);

  // roues
  const wheels = [];
  const faceMat = new THREE.MeshStandardMaterial({ map: tyreTexture(opts.compound || 'M'), roughness: 0.75, metalness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.92 });
  const discMat = new THREE.MeshBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0 });
  const defs = [[1.95, -0.78, true, 'FL'], [1.95, 0.78, true, 'FR'], [-1.65, -0.75, false, 'RL'], [-1.65, 0.75, false, 'RR']];
  for (const [x, z, front, id] of defs) {
    const steer = new THREE.Group(); steer.position.set(x, front ? 0.33 : 0.36, z); group.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    const tyre = new THREE.Mesh(front ? G.tyreF : G.tyreR, rubber); tyre.castShadow = true; spin.add(tyre);
    const f1 = new THREE.Mesh(front ? G.faceF : G.faceR, faceMat), f2 = f1.clone();
    const w = front ? 0.15 : 0.2; f1.position.z = w + 0.001; f2.position.z = -w - 0.001; f2.rotation.y = Math.PI; spin.add(f1, f2);
    const disc = new THREE.Mesh(G.disc, discMat); disc.position.z = z > 0 ? -0.05 : 0.05; spin.add(disc);
    wheels.push({ id, front, steer, spin, r: front ? 0.33 : 0.36, side: Math.sign(z) });
  }

  const info = { group, body, wheels, drsPivot, faceMat, discMat, tailMat, glow, helm, compound: opts.compound || 'M', spinA: 0, brakeHeat: 0, nameplate: null };

  info.setCompound = (c) => { if (c !== info.compound) { info.compound = c; faceMat.map = tyreTexture(c); faceMat.needsUpdate = true; } };
  info.update = (car, dt, env = {}) => {
    const V = car.v;
    group.position.set(V.x, 0, V.z); group.rotation.y = -V.phi;
    body.position.y = Math.max(-0.02, (V.heave || 0)); body.rotation.z = (V.pitch || 0); body.rotation.x = (V.roll || 0);
    const u = V.u || 0;
    for (const w of wheels) {
      w.spin.rotation.z -= (u / w.r) * dt * (w.side > 0 ? 1 : 1);
      if (w.front) w.steer.rotation.y = -V.steer;
    }
    drsPivot.rotation.z = (V.aero || 0) * 0.62;
    const braking = V.controls.brake > 0.2 && u > 8;
    tailMat.color.set(braking || car.status === 'retired' ? '#ff1a1a' : (env.rain > 0.2 ? '#ff2a2a' : '#4a0000'));
    glow.material.opacity += ((braking ? 0.85 : env.rain > 0.2 ? 0.35 : 0) - glow.material.opacity) * Math.min(1, dt * 14);
    info.brakeHeat += ((braking ? Math.min(1, V.controls.brake * Math.min(1, u / 40)) : 0) - info.brakeHeat) * Math.min(1, dt * (braking ? 3 : 0.8));
    discMat.opacity = info.brakeHeat * 0.9;
    info.setCompound(V.tyre.compound);
    // dommages : l'aileron avant s'incline
    if (V.damage > 35) { info.damaged = true; }
    group.visible = car.status !== 'removed';
  };
  info.dispose = () => { group.traverse((o) => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); }); };
  return info;
}

/** voiture de sécurité (silhouette générique jaune) */
export function buildSafetyCar() {
  const g = new THREE.Group();
  const yel = new THREE.MeshPhysicalMaterial({ color: '#f2c200', metalness: 0.3, roughness: 0.3, clearcoat: 1 }), blk = new THREE.MeshStandardMaterial({ color: '#0e0f12', roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(loft([[2.5, 0.2, 0.28, 0.5, 3], [1.8, 0.88, 0.2, 0.72, 4], [0.4, 0.95, 0.2, 0.86, 4], [-0.9, 0.95, 0.2, 0.84, 4], [-2.4, 0.85, 0.22, 0.7, 4]], 14), yel); body.material.side = THREE.DoubleSide; body.castShadow = true; g.add(body);
  const roof = new THREE.Mesh(loft([[0.6, 0.62, 0.8, 1.2, 3], [-0.6, 0.64, 0.8, 1.18, 3], [-1.3, 0.55, 0.8, 1.0, 3]], 12), blk); roof.material.side = THREE.DoubleSide; g.add(roof);
  for (const [x, z] of [[1.5, -0.88], [1.5, 0.88], [-1.5, -0.88], [-1.5, 0.88]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18).rotateX(Math.PI / 2), blk); w.position.set(x, 0.36, z); w.castShadow = true; g.add(w); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 1.2), new THREE.MeshBasicMaterial({ color: '#ff9a00' })); bar.position.set(-0.3, 1.26, 0); g.add(bar);
  const l1 = new THREE.MeshBasicMaterial({ color: '#ff9a00' }); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), l1); lamp.position.set(-0.3, 1.34, 0.4); g.add(lamp); const lamp2 = lamp.clone(); lamp2.position.z = -0.4; g.add(lamp2);
  return { group: g, update(sc, dt, t) { g.position.set(sc.v.x, 0, sc.v.z); g.rotation.y = -sc.v.phi; l1.color.set(Math.floor(t * 6) % 2 ? '#ff9a00' : '#3a2200'); } };
}

export const CAR_DIMS = { length: CAR.length, width: CAR.width };
