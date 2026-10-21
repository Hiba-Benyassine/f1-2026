// =====================================================================
//  CHARACTERS : personnages 3D procéduraux animés (pilotes, mécaniciens, ingénieur,
//  commissaires, public), trophée doré, lézard animé.
//  ⚠ Ce sont des personnages STYLISÉS (placeholders). Pour des humains photoréalistes, remplace-les
//  par des modèles glTF rigués sous licence (voir docs/ASSET_REPLACEMENT.md).
// =====================================================================
import * as THREE from 'three';
import { TEAMS } from './data.js';

const SKIN = ['#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#ffdbb4', '#a46a3d'];
const shared = { geo: null, skinMats: {}, cloth: {} };
const clothMat = (hex) => (shared.cloth[hex] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0.02 }));
const skinMat = (hex) => (shared.skinMats[hex] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 }));

function geos() {
  if (shared.geo) return shared.geo;
  const G = {};
  G.torso = new THREE.CapsuleGeometry(0.17, 0.32, 4, 10); G.hips = new THREE.CapsuleGeometry(0.16, 0.08, 4, 8);
  G.head = new THREE.SphereGeometry(0.11, 14, 12);
  G.arm = new THREE.CapsuleGeometry(0.05, 0.22, 3, 8); G.fore = new THREE.CapsuleGeometry(0.045, 0.2, 3, 8);
  G.leg = new THREE.CapsuleGeometry(0.075, 0.3, 3, 8); G.shin = new THREE.CapsuleGeometry(0.065, 0.3, 3, 8);
  G.hand = new THREE.SphereGeometry(0.05, 8, 8); G.foot = new THREE.BoxGeometry(0.2, 0.07, 0.1);
  G.helmet = new THREE.SphereGeometry(0.135, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  G.cap = new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.visor = new THREE.SphereGeometry(0.138, 12, 8, -0.8, 1.6, 1.1, 0.55);
  return (shared.geo = G);
}

/**
 * Humanoïde articulé.
 * opts : { suit, trim, skin, helmetColor, hat:'cap'|'helmet'|'none', scale, visor }
 */
export function makeHuman(opts = {}) {
  const G = geos();
  const suit = clothMat(opts.suit || '#cc2222'), trim = clothMat(opts.trim || '#ffffff'), skin = skinMat(opts.skin || SKIN[(Math.random() * SKIN.length) | 0]);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const hipM = new THREE.Mesh(G.hips, suit); hips.add(hipM);
  const torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
  const torsoM = new THREE.Mesh(G.torso, suit); torsoM.position.y = 0.25; torso.add(torsoM);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.04, 12), trim); belt.position.y = 0.02; torso.add(belt);
  const neck = new THREE.Group(); neck.position.y = 0.55; torso.add(neck);
  const head = new THREE.Mesh(G.head, skin); head.position.y = 0.1; neck.add(head);
  if (opts.hat === 'helmet') {
    const h = new THREE.Mesh(G.helmet, new THREE.MeshPhysicalMaterial({ color: opts.helmetColor || '#e10600', roughness: 0.25, clearcoat: 1 })); h.position.y = 0.1; h.rotation.y = 0; neck.add(h);
    const v = new THREE.Mesh(G.visor, new THREE.MeshPhysicalMaterial({ color: '#0a0c10', roughness: 0.05, metalness: 0.9 })); v.position.y = 0.1; v.rotation.y = Math.PI / 2 - 0.0; neck.add(v);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), new THREE.MeshPhysicalMaterial({ color: opts.helmetColor || '#e10600', roughness: 0.25 })); chin.position.y = 0.1; neck.add(chin);
  } else if (opts.hat === 'cap') {
    const c = new THREE.Mesh(G.cap, trim); c.position.y = 0.115; neck.add(c);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.14), trim); brim.position.set(0.1, 0.12, 0); neck.add(brim);
  }
  // visage : yeux
  const eyeM = new THREE.MeshBasicMaterial({ color: '#111' });
  for (const sz of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), eyeM); e.position.set(0.1, 0.12, sz * 0.04); neck.add(e); }
  // bras
  const arm = (sz) => {
    const sh = new THREE.Group(); sh.position.set(0, 0.46, sz * 0.2); torso.add(sh);
    const up = new THREE.Mesh(G.arm, suit); up.position.y = -0.15; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const lo = new THREE.Mesh(G.fore, suit); lo.position.y = -0.14; el.add(lo);
    const hd = new THREE.Mesh(G.hand, opts.gloves ? clothMat(opts.gloves) : skin); hd.position.y = -0.3; el.add(hd);
    return { sh, el, hand: hd };
  };
  const armL = arm(-1), armR = arm(1);
  // jambes
  const leg = (sz) => {
    const hp = new THREE.Group(); hp.position.set(0, -0.02, sz * 0.09); hips.add(hp);
    const up = new THREE.Mesh(G.leg, suit); up.position.y = -0.2; hp.add(up);
    const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
    const lo = new THREE.Mesh(G.shin, suit); lo.position.y = -0.2; kn.add(lo);
    const ft = new THREE.Mesh(G.foot, clothMat('#15151a')); ft.position.set(0.05, -0.43, 0); kn.add(ft);
    return { hp, kn };
  };
  const legL = leg(-1), legR = leg(1);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const s = opts.scale || 1; root.scale.setScalar(s);
  const rig = { root, hips, torso, neck, armL, armR, legL, legR, s, t0: Math.random() * 10 };
  rig.pose = (name, t, extra) => poses[name] && poses[name](rig, t + rig.t0, extra);
  poses.idle(rig, 0);
  return rig;
}

const reset = (r) => {
  r.hips.position.y = 0.95; r.hips.rotation.set(0, 0, 0); r.torso.rotation.set(0, 0, 0); r.neck.rotation.set(0, 0, 0);
  for (const a of [r.armL, r.armR]) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  for (const l of [r.legL, r.legR]) { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); }
};
export const poses = {
  idle(r, t) { reset(r); r.torso.rotation.z = Math.sin(t * 1.6) * 0.02; r.neck.rotation.y = Math.sin(t * 0.5) * 0.25; r.armL.sh.rotation.z = 0.05; r.armR.sh.rotation.z = -0.05; },
  /** mains levées + saut (célébration) */
  celebrate(r, t) {
    reset(r); const j = Math.abs(Math.sin(t * 5)); r.hips.position.y = 0.95 + j * 0.16;
    r.armL.sh.rotation.z = 2.7 + Math.sin(t * 9) * 0.25; r.armR.sh.rotation.z = -2.7 - Math.sin(t * 9 + 1) * 0.25;
    r.armL.el.rotation.z = 0.2; r.armR.el.rotation.z = -0.2; r.legL.kn.rotation.z = j * 0.5; r.legR.kn.rotation.z = j * 0.5; r.torso.rotation.z = Math.sin(t * 5) * 0.08;
  },
  /** soulève le trophée */
  trophy(r, t) {
    reset(r); const k = 0.5 + 0.5 * Math.sin(t * 2.4);
    r.armR.sh.rotation.z = -2.5 - k * 0.5; r.armR.el.rotation.z = -0.4; r.armL.sh.rotation.z = 2.3 + Math.sin(t * 4) * 0.3; r.armL.el.rotation.z = 0.25;
    r.hips.position.y = 0.95 + Math.abs(Math.sin(t * 4)) * 0.05; r.neck.rotation.z = -0.1;
  },
  /** applaudit */
  clap(r, t) {
    reset(r); const c = (Math.sin(t * 9) + 1) / 2; r.armL.sh.rotation.z = 0.2; r.armR.sh.rotation.z = -0.2; r.armL.sh.rotation.x = -1.1; r.armR.sh.rotation.x = -1.1;
    r.armL.el.rotation.z = 0.9 - c * 0.4; r.armR.el.rotation.z = -0.9 + c * 0.4; r.armL.sh.rotation.y = c * 0.3; r.armR.sh.rotation.y = -c * 0.3;
  },
  /** mécanicien qui visse (accroupi) */
  gun(r, t) {
    reset(r); r.hips.position.y = 0.62; r.hips.rotation.z = 0.0; r.torso.rotation.z = -0.35; r.legL.hp.rotation.z = 1.2; r.legR.hp.rotation.z = 0.8; r.legL.kn.rotation.z = -1.5; r.legR.kn.rotation.z = -1.3;
    const v = Math.sin(t * 26) * 0.04; r.armL.sh.rotation.z = 1.0 + v; r.armR.sh.rotation.z = -1.0 - v; r.armL.sh.rotation.x = -0.5; r.armR.sh.rotation.x = -0.5; r.armL.el.rotation.z = 0.5; r.armR.el.rotation.z = -0.5;
  },
  /** tient un pneu devant lui */
  tyre(r, t) {
    reset(r); r.hips.position.y = 0.7; r.torso.rotation.z = -0.25; r.legL.kn.rotation.z = -0.9; r.legR.kn.rotation.z = -0.9; r.legL.hp.rotation.z = 0.8; r.legR.hp.rotation.z = 0.8;
    r.armL.sh.rotation.z = 1.2; r.armR.sh.rotation.z = -1.2; r.armL.sh.rotation.x = -0.3; r.armR.sh.rotation.x = 0.3;
  },
  /** panneau « Stop » (lollipop) levé */
  lollipop(r, t) { reset(r); r.armR.sh.rotation.z = -2.3; r.armR.el.rotation.z = -0.3; r.armL.sh.rotation.z = 0.1; r.hips.position.y = 0.95 + Math.sin(t * 2) * 0.01; },
  /** bras croisés, regarde l'écran (ingénieur) */
  watch(r, t) { reset(r); r.armL.sh.rotation.x = -1.2; r.armR.sh.rotation.x = -1.2; r.armL.sh.rotation.z = 0.5; r.armR.sh.rotation.z = -0.5; r.armL.el.rotation.z = 1.2; r.armR.el.rotation.z = -1.2; r.neck.rotation.y = Math.sin(t * 0.4) * 0.3; r.neck.rotation.z = 0.05; },
  /** commissaire agite un drapeau */
  wave(r, t) { reset(r); r.armR.sh.rotation.z = -2.4 + Math.sin(t * 7) * 0.4; r.armR.el.rotation.z = -0.3; r.armL.sh.rotation.z = 0.1; r.torso.rotation.z = Math.sin(t * 7) * 0.06; },
  /** marche sur place */
  walk(r, t) { reset(r); const s = Math.sin(t * 6); r.legL.hp.rotation.z = s * 0.6; r.legR.hp.rotation.z = -s * 0.6; r.legL.kn.rotation.z = Math.max(0, -s) * 0.7; r.legR.kn.rotation.z = Math.max(0, s) * 0.7; r.armL.sh.rotation.z = -s * 0.5; r.armR.sh.rotation.z = s * 0.5; r.hips.position.y = 0.95 + Math.abs(Math.cos(t * 6)) * 0.03; },
  /** s'assoit / pose droite pour l'hymne sur le podium */
  stand(r, t) { reset(r); r.armL.sh.rotation.z = 0.12; r.armR.sh.rotation.z = -0.12; r.neck.rotation.z = Math.sin(t * 0.8) * 0.04; r.torso.rotation.z = Math.sin(t * 1.3) * 0.02; },
};

/** équipement de la voie des stands pour une équipe (6 mécaniciens + panneau) */
export function makePitCrew(teamId) {
  const T = TEAMS[teamId], group = new THREE.Group();
  const mk = (extra = {}) => makeHuman({ suit: T.suit === '#15191c' ? '#222831' : T.suit, trim: T.accent, hat: 'helmet', helmetColor: T.accent === '#ffffff' ? '#eeeeee' : T.accent, ...extra });
  const crew = [];
  // 4 mécaniciens aux roues (positions relatives à la voiture : x avant, z droite)
  const spots = [[1.95, -1.35, 0], [1.95, 1.35, Math.PI], [-1.65, -1.35, 0], [-1.65, 1.35, Math.PI]];
  spots.forEach(([x, z, ry], i) => { const h = mk(); h.root.position.set(x, 0, z); h.root.rotation.y = ry === 0 ? Math.PI / 2 : -Math.PI / 2; group.add(h.root); crew.push({ rig: h, role: 'wheel', i, home: new THREE.Vector3(x, 0, z), side: z > 0 ? 1 : -1, front: x > 0 }); });
  const jf = mk(); jf.root.position.set(3.4, 0, 0); jf.root.rotation.y = -Math.PI / 2; group.add(jf.root); crew.push({ rig: jf, role: 'jackF', home: new THREE.Vector3(3.4, 0, 0) });
  const jr = mk(); jr.root.position.set(-3.5, 0, 0); jr.root.rotation.y = Math.PI / 2; group.add(jr.root); crew.push({ rig: jr, role: 'jackR', home: new THREE.Vector3(-3.5, 0, 0) });
  // lollipop
  const lp = mk(); lp.root.position.set(5.2, 0, -1.2); lp.root.rotation.y = -Math.PI / 2; group.add(lp.root); crew.push({ rig: lp, role: 'lolli', home: new THREE.Vector3(5.2, 0, -1.2) });
  const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff1a1a' }));
  sign.position.set(0.28, 2.35, 0.0); lp.root.add(sign); lp.sign = sign;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), clothMat('#ddd')); pole.position.set(0.28, 1.55, 0); lp.root.add(pole);
  // pneus de rechange (empilés) : meshes simples
  const tyreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 22), tyreM = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
  const spare = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(tyreGeo, tyreM); m.rotation.x = Math.PI / 2; m.position.set(0, 0.2, 0); m.visible = false; m.castShadow = true; group.add(m); spare.push(m); }
  return { group, crew, spare, lollipop: lp };
}

/** trophée doré */
export function makeTrophy() {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: '#ffc928', metalness: 1, roughness: 0.22, emissive: '#3a2600', emissiveIntensity: 0.4 });
  const pts = [[0.001, 0], [0.16, 0], [0.16, 0.04], [0.07, 0.08], [0.05, 0.2], [0.055, 0.3], [0.12, 0.36], [0.17, 0.5], [0.19, 0.62], [0.16, 0.7], [0.001, 0.68]].map((p) => new THREE.Vector2(p[0], p[1]));
  const lathe = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), gold); lathe.castShadow = true; g.add(lathe);
  for (const sz of [-1, 1]) { const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 18, Math.PI), gold); handle.position.set(0, 0.55, sz * 0.19); handle.rotation.y = Math.PI / 2; handle.rotation.z = sz > 0 ? 0.0 : 0; g.add(handle); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 22), new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.5, roughness: 0.4 })); base.position.y = -0.03; g.add(base);
  g.scale.setScalar(1.15); return g;
}

/** lézard animé : se déplace dans la direction +X local */
export function makeLizard() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const green = new THREE.MeshStandardMaterial({ color: '#4fa33a', roughness: 0.55 }), dk = new THREE.MeshStandardMaterial({ color: '#2d6d25', roughness: 0.6 }), belly = new THREE.MeshStandardMaterial({ color: '#b9d77a', roughness: 0.7 });
  const segs = [];
  const sizes = [[0.12, 0.09], [0.15, 0.1], [0.17, 0.11], [0.16, 0.1], [0.13, 0.085], [0.11, 0.07], [0.09, 0.055], [0.07, 0.042], [0.055, 0.03], [0.04, 0.02]];
  let x = 0.34;
  sizes.forEach((s, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), i % 2 ? dk : green); m.scale.set(s[0], s[1] * 0.75, s[1] * 1.1); m.position.set(x, 0.05, 0); m.castShadow = true; body.add(m); segs.push(m); x -= s[0] * 1.35; });
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), green); head.scale.set(0.15, 0.065, 0.085); head.position.set(0.5, 0.06, 0); body.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), green); snout.scale.set(0.1, 0.045, 0.06); snout.position.set(0.62, 0.05, 0); body.add(snout);
  for (const sz of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffcc00' })); eye.position.set(0.52, 0.11, sz * 0.05); body.add(eye); const p = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), new THREE.MeshBasicMaterial({ color: '#000' })); p.position.set(0.535, 0.11, sz * 0.058); body.add(p); }
  const legs = [];
  for (const [lx, sz] of [[0.32, -1], [0.32, 1], [-0.02, -1], [-0.02, 1]]) {
    const hip = new THREE.Group(); hip.position.set(lx, 0.05, sz * 0.11); body.add(hip);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.12, 6), dk); up.rotation.x = sz * 1.0; up.position.set(0, -0.02, sz * 0.05); hip.add(up);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.1, 6), dk); lo.position.set(0, -0.06, sz * 0.12); hip.add(lo);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.04), dk); ft.position.set(0.02, -0.1, sz * 0.12); hip.add(ft);
    legs.push({ hip, sz, ph: legs.length % 2 ? Math.PI : 0 });
  }
  g.scale.setScalar(1.7);   // plus visible que nature (lisibilité de jeu)
  return {
    group: g,
    update(t, speed) {
      const w = t * (4 + speed * 2);
      segs.forEach((s, i) => { s.position.z = Math.sin(w - i * 0.7) * 0.03 * (1 + i * 0.25); });
      head.position.z = Math.sin(w + 0.7) * 0.02; snout.position.z = Math.sin(w + 0.9) * 0.025;
      legs.forEach((l, i) => { l.hip.rotation.z = Math.sin(w * 1.3 + l.ph + (i > 1 ? 0.6 : 0)) * 0.7; l.hip.rotation.x = Math.cos(w * 1.3 + l.ph) * 0.25 * l.sz; });
    },
  };
}

export { SKIN };
