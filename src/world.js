// =====================================================================
//  WORLD : environnement 3D construit à partir du tracé (Track)
//  piste, vibreurs, dégagements, murs, stands (voie, mur, garages, feux), portique de départ,
//  tribunes + public animé, arbres / bâtiments / collines selon le thème, ciel, météo (pluie),
//  panneaux de freinage, commissaires + drapeaux, équipes de mécaniciens, lézard.
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { TRACK_CFG } from './constants.js';
import { TEAMS } from './data.js';
import { makeHuman, makePitCrew, makeLizard, poses } from './characters.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rand(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Grid {
  constructor(cell = 60) { this.cell = cell; this.m = new Map(); }
  key(x, z) { return ((Math.floor(x / this.cell) + 4096) << 13) | (Math.floor(z / this.cell) + 4096); }
  add(x, z) { const k = this.key(x, z); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(x, z); }
  near(x, z, r) {
    const c = this.cell, rr = r * r, n = Math.ceil(r / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const a = this.m.get(((cx + i + 4096) << 13) | (cz + j + 4096)); if (!a) continue;
      for (let q = 0; q < a.length; q += 2) { const dx = a[q] - x, dz = a[q + 1] - z; if (dx * dx + dz * dz < rr) return true; }
    }
    return false;
  }
}

export const QUALITY = {
  low:    { pixel: 1.0, shadow: 0,    trees: 250,  crowd: 0,   rain: 1200, bloom: false, buildings: 60,  fence: false, dist: 700 },
  medium: { pixel: 1.0, shadow: 1024, trees: 900,  crowd: 500, rain: 2400, bloom: false, buildings: 140, fence: true,  dist: 1100 },
  high:   { pixel: 1.5, shadow: 2048, trees: 2200, crowd: 1400, rain: 4200, bloom: true,  buildings: 240, fence: true,  dist: 1600 },
};

export class World {
  constructor(scene, renderer, track, circuit, opts = {}) {
    this.scene = scene; this.renderer = renderer; this.tr = track; this.circuit = circuit;
    this.q = QUALITY[opts.quality] || QUALITY.high; this.opts = opts;
    this.boxTeams = opts.boxTeams || [];
    this.t = 0; this.excite = 0.25; this.exciteTarget = 0.25;
    this.group = new THREE.Group(); this.group.name = 'world'; scene.add(this.group);
    this.grid = new Grid(60);
    this.rnd = rand(circuit && circuit.id ? circuit.id.length * 977 + 31 : 5);
    this.mats = {}; this.animated = []; this.crews = {}; this.marshals = []; this.lights = null;
    this.theme = (circuit && circuit.theme) || 'flat';
    this._indexTrack();
    this._lighting();
    this._sky();
    this._ground();
    this._road();
    this._pitlane();
    this._walls();
    this._startLine();
    this._gantry();
    this._stands();
    this._scenery();
    this._signs();
    this._marshals();
    this._rain();
    this.lizardRig = null;
  }

  _indexTrack() {
    const tr = this.tr; this.bounds = tr.bounds();
    for (let i = 0; i < tr.N; i += 2) this.grid.add(tr.x[i], tr.z[i]);
    // zone des stands et des garages : on ne plante rien dedans
    for (const p of tr.pitPath) this.grid.add(p.x - Math.sin(p.phi) * 14, p.z + Math.cos(p.phi) * 14);
  }

  // ---------------------------------------------------------------- lumière & ciel
  _lighting() {
    const s = this.scene, R = this.renderer;
    this.hemi = new THREE.HemisphereLight('#bcd7ff', '#5a6048', 0.85); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.6); this.sun.position.set(180, 260, 120);
    if (this.q.shadow) {
      this.sun.castShadow = true; this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
      const c = this.sun.shadow.camera; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 20; c.far = 700; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    }
    s.add(this.sun); s.add(this.sun.target);
    // reflets : ciel procédural -> PMREM
    const pm = new THREE.PMREMGenerator(R); const tex = new THREE.CanvasTexture(TX.envCanvas()); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    this.envMap = pm.fromEquirectangular(tex).texture; s.environment = this.envMap; s.environmentIntensity = 0.9; pm.dispose(); tex.dispose();
    s.fog = new THREE.FogExp2('#b9d3ee', 0.00055);
  }

  _sky() {
    const tex = new THREE.CanvasTexture(TX.skyCanvas('#2c6bd0', '#86bdf0', '#e8f1fa')); tex.colorSpace = THREE.SRGBColorSpace;
    this.skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 16), this.skyMat); this.sky.renderOrder = -10; this.group.add(this.sky);
    const sunTex = new THREE.CanvasTexture(TX.glowCanvas());
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: '#fff4cf', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.set(380, 380, 1); this.group.add(this.sunSprite);
    // nuages : quelques plans haute altitude
    const cTex = new THREE.CanvasTexture(TX.cloudCanvas()); cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping; cTex.repeat.set(3, 2);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.cloudMat); this.clouds.rotation.x = -Math.PI / 2; this.clouds.position.y = 900; this.group.add(this.clouds);
    this.skyColors = { clear: new THREE.Color('#b9d3ee'), rain: new THREE.Color('#6d7683') };
  }

  _ground() {
    const gt = TX.canvasTex(TX.grassCanvas(256, this.theme === 'alpine'), { repeat: [900, 900] });
    this.grassMat = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0, color: this.theme === 'city' ? '#8c9c70' : this.theme === 'alpine' ? '#a9bf98' : '#a4b78f' });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.grassMat); g.rotation.x = -Math.PI / 2; g.position.y = -0.15; g.receiveShadow = true; this.group.add(g); this.ground = g;
  }

  // ---------------------------------------------------------------- ruban de piste
  _ribbon(i0, i1, dA, dB, y, vScale, step = 1) {
    const tr = this.tr, N = tr.N, pos = [], uv = [], idx = [];
    const fa = typeof dA === 'function' ? dA : () => dA, fb = typeof dB === 'function' ? dB : () => dB;
    let k = 0;
    for (let i = i0; i <= i1; i += step) {
      const ii = ((i % N) + N) % N, nx = tr.nx[ii], nz = tr.nz[ii], cx = tr.x[ii], cz = tr.z[ii], a = fa(ii), b = fb(ii), v = (i * tr.ds) / vScale;
      pos.push(cx + nx * a, y, cz + nz * a, cx + nx * b, y, cz + nz * b); uv.push(0, v, 1, v);
      if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      k++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // normales vers le haut
    const n = g.attributes.normal; for (let q = 0; q < n.count; q++) n.setXYZ(q, 0, 1, 0);
    return g;
  }

  _road() {
    const tr = this.tr, N = tr.N, hw = tr.halfW, aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const asp = TX.canvasTex(TX.asphaltCanvas(512), { aniso });
    this.roadMat = new THREE.MeshStandardMaterial({ map: asp, roughness: 0.93, metalness: 0.0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const road = new THREE.Mesh(this._ribbon(0, N, -hw, hw, 0.0, hw * 2), this.roadMat); road.receiveShadow = true; this.group.add(road); this.road = road;
    // apron (dégagement asphalte) des deux côtés
    const apT = TX.canvasTex(TX.asphaltCanvas(256, 38), { aniso: 4 });
    this.apronMat = new THREE.MeshStandardMaterial({ map: apT, roughness: 0.95, color: '#b4b8bc', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const k0 = hw, k1 = hw + tr.kerbW, a1 = k1 + tr.apronW;
    const pz = (i) => tr.pitZoneFactor(i * tr.ds);
    const apL = new THREE.Mesh(this._ribbon(0, N, -a1, -k1, -0.005, 12), this.apronMat); apL.receiveShadow = true; this.group.add(apL);
    const apR = new THREE.Mesh(this._ribbon(0, N, k1, a1, -0.005, 12), this.apronMat); apR.receiveShadow = true; this.group.add(apR);
    // vibreurs : à l'intérieur des virages
    const kt = TX.canvasTex(TX.kerbCanvas(), { aniso: 4 });
    this.kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6, emissive: '#000', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const segs = [];
    for (const side of [-1, 1]) {
      let run = null;
      for (let i = 0; i <= N; i++) {
        const k = tr.kap[i % N], inside = side * k > 0.0042 || (side * k < -0.012);       // intérieur + sortie très serrée
        const okSide = !(side > 0 && tr.pitZoneFactor((i % N) * tr.ds) > 0.5);
        if (inside && okSide) { if (!run) run = { side, a: i }; } else if (run) { run.b = i; if (run.b - run.a > 3) segs.push(run); run = null; }
      }
      if (run) { run.b = N; segs.push(run); }
    }
    const kg = [];
    for (const sg of segs) {
      const a = sg.side > 0 ? hw : -hw, b = sg.side > 0 ? hw + tr.kerbW : -hw - tr.kerbW;
      kg.push(this._ribbon(sg.a, sg.b, a, b, 0.018, 4.2));
    }
    if (kg.length) { const m = new THREE.Mesh(mergeGeometries(kg), this.kerbMat); m.receiveShadow = true; this.group.add(m); }
    // bandes d'herbe tondue / gravier dans les virages (extérieur)
    const gv = TX.canvasTex(TX.gravelCanvas(), { repeat: [1, 1] }); this.gravelMat = new THREE.MeshStandardMaterial({ map: gv, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const gg = [];
    for (let i = 0, run = null; i <= N; i++) {
      const k = tr.kap[i % N], out = Math.abs(k) > 0.0055;
      if (out) { if (!run) run = { a: i, side: -Math.sign(k) }; } else if (run) { if (i - run.a > 8) { const s = run.side, inner = s * (hw + tr.kerbW + tr.apronW), outer = s * (hw + tr.runoff - 1.2); if (!(s > 0 && tr.pitZoneFactor(run.a * tr.ds) > 0.2)) gg.push(this._ribbon(run.a, i, inner, outer, -0.01, 8)); } run = null; }
    }
    if (gg.length) { const m = new THREE.Mesh(mergeGeometries(gg), this.gravelMat); m.receiveShadow = true; this.group.add(m); }
  }

  // ---------------------------------------------------------------- stands
  _pitlane() {
    const tr = this.tr, P = tr.pit, path = tr.pitPath; this.pitObjs = {};
    const plT = TX.canvasTex(TX.pitLaneCanvas(), { aniso: 4 }); const mat = new THREE.MeshStandardMaterial({ map: plT, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mk = (offA, offB, y = 0.01, vs = 14, i0 = 0, i1 = path.length - 1) => {
      const pos = [], uv = [], idx = []; let k = 0;
      for (let i = i0; i <= i1; i++) { const p = path[i], nx = -Math.sin(p.phi), nz = Math.cos(p.phi); pos.push(p.x + nx * offA, y, p.z + nz * offA, p.x + nx * offB, y, p.z + nz * offB); uv.push(0, (i * 2) / vs, 1, (i * 2) / vs); if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } k++; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); const n = g.attributes.normal; for (let q = 0; q < n.count; q++) n.setXYZ(q, 0, 1, 0); return g;
    };
    const lane = new THREE.Mesh(mk(-5.2, 5.0), mat); lane.receiveShadow = true; this.group.add(lane);
    // voie de travail devant les garages (plus claire)
    const wm = new THREE.MeshStandardMaterial({ color: '#6a6e73', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const boxA = Math.max(0, Math.floor((P.box0 - 14 - P.sIn) / 2)), boxB = Math.min(path.length - 1, Math.ceil((P.box0 + P.boxN * P.spacing + 12 - P.sIn) / 2));
    const work = new THREE.Mesh(mk(4.9, 11.8, 0.008, 14, boxA, boxB), wm); work.receiveShadow = true; this.group.add(work);
    // jonction entrée / sortie : bitume entre la piste et la voie (déjà couverte par le ruban de la voie)
    // mur des stands (côté piste)
    const wallI = Math.max(0, Math.floor((P.ramp + 4) / 2)), wallE = Math.min(path.length - 1, path.length - Math.floor((P.ramp + 4) / 2));
    const pw = []; const wmat = new THREE.MeshStandardMaterial({ color: '#cfd2d6', roughness: 0.6 });
    for (let i = wallI; i < wallE; i += 3) { const p = path[i], q = path[Math.min(path.length - 1, i + 3)]; const nx = -Math.sin(p.phi), nz = Math.cos(p.phi); const g = new THREE.BoxGeometry(6.2, 1.05, 0.5); g.rotateY(-p.phi); g.translate(p.x - nx * 5.6, 0.52, p.z - nz * 5.6); pw.push(g); }
    if (pw.length) { const m = new THREE.Mesh(mergeGeometries(pw), wmat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    // garages
    this.garages = [];
    const gb = [], doors = [];
    for (let k = 0; k < tr.pitBoxes.length; k++) {
      const b = tr.pitBoxes[k], nx = -Math.sin(b.phi), nz = Math.cos(b.phi), tx = Math.cos(b.phi), tz = Math.sin(b.phi);
      const w = P.spacing - 0.5, depth = 11, base = 12.3 + depth / 2;
      const team = this.boxTeams[k] ? TEAMS[this.boxTeams[k]] : null;
      const cx = b.x + nx * base, cz = b.z + nz * base;
      // coque : fond + côtés + toit
      const back = new THREE.BoxGeometry(w, 4.6, 0.3); back.rotateY(-b.phi); back.translate(cx + nx * depth / 2, 2.3, cz + nz * depth / 2); gb.push(back);
      for (const sg of [-1, 1]) { const sd = new THREE.BoxGeometry(0.25, 4.6, depth); sd.rotateY(-b.phi); sd.translate(cx + tx * sg * (w / 2), 2.3, cz + tz * sg * (w / 2)); gb.push(sd); }
      const roof = new THREE.BoxGeometry(w + 0.3, 0.4, depth + 1.2); roof.rotateY(-b.phi); roof.translate(cx - nx * 0.4, 4.8, cz - nz * 0.4); gb.push(roof);
      // bandeau coloré aux couleurs de l'équipe
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.1, 0.2), new THREE.MeshStandardMaterial({ color: team ? team.body : '#444', emissive: team ? team.glow : '#000', emissiveIntensity: team ? 0.35 : 0, roughness: 0.5 }));
      band.rotation.y = -b.phi; band.position.set(cx - nx * (depth / 2 + 0.3), 4.2, cz - nz * (depth / 2 + 0.3)); this.group.add(band);
      // intérieur éclairé
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 3.8), new THREE.MeshBasicMaterial({ color: team ? new THREE.Color(team.dark).lerp(new THREE.Color('#ffffff'), 0.22) : '#2a2d31' }));
      inner.rotation.y = -b.phi + Math.PI / 2 + Math.PI; inner.position.set(cx + nx * (depth / 2 - 0.1), 2.1, cz + nz * (depth / 2 - 0.1)); this.group.add(inner);
      // numéro de box
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: TX.canvasTex(TX.numberCanvas(k + 1, '#fff', '#111'), { wrap: false }) }));
      num.rotation.y = -b.phi + Math.PI / 2 + Math.PI; num.position.set(cx - nx * (depth / 2 + 0.5), 3.4, cz - nz * (depth / 2 + 0.5)); this.group.add(num);
      // feu de box (rouge/vert)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff1a1a' })); lamp.position.set(b.x + nx * 8.2, 2.6, b.z + nz * 8.2); this.group.add(lamp);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#333' })); pole.position.set(b.x + nx * 8.2, 1.3, b.z + nz * 8.2); this.group.add(pole);
      this.garages.push({ k, lamp, x: cx, z: cz, phi: b.phi });
    }
    if (gb.length) { const m = new THREE.Mesh(mergeGeometries(gb), new THREE.MeshStandardMaterial({ color: '#8f949b', roughness: 0.7 })); m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    // ingénieur de piste sur le mur des stands (équipe du joueur) + mécaniciens statiques devant les garages
    const myTeam = this.opts.playerTeam, boxK = this.opts.playerBox ?? 0;
    if (myTeam && this.tr.pitBoxes[boxK]) {
      const b = tr.pitBoxes[boxK], nx = -Math.sin(b.phi), nz = Math.cos(b.phi);
      const eng = makeHuman({ suit: TEAMS[myTeam].suit, trim: TEAMS[myTeam].accent, hat: 'cap', gloves: '#222' }); eng.root.position.set(b.x - nx * 5.9, 0.0, b.z - nz * 5.9); eng.root.rotation.y = -b.phi - Math.PI / 2 + Math.PI; eng.pose('watch', 0); this.group.add(eng.root); this.engineer = eng; this.animated.push({ rig: eng, pose: 'watch' });
      // écrans sur le mur
      const scr = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.08), new THREE.MeshBasicMaterial({ color: '#27d3ff' })); scr.position.set(b.x - nx * 5.3, 1.45, b.z - nz * 5.3 - 0.0); scr.rotation.y = -b.phi + Math.PI / 2; scr.rotation.z = 0.0; this.group.add(scr);
    }
    // quelques mécaniciens « statiques » en attente
    this.idleHumans = [];
    const nStatic = this.q.crowd ? Math.min(14, tr.pitBoxes.length) : 4;
    for (let k = 0; k < nStatic; k++) {
      const b = tr.pitBoxes[k], tId = this.boxTeams[k]; if (!tId) continue; const T = TEAMS[tId], nx = -Math.sin(b.phi), nz = Math.cos(b.phi), tx = Math.cos(b.phi), tz = Math.sin(b.phi);
      for (let j = 0; j < 2; j++) {
        const h = makeHuman({ suit: T.suit === '#15191c' ? '#222831' : T.suit, trim: T.accent, hat: j ? 'cap' : 'helmet', helmetColor: T.accent, gloves: '#222' });
        h.root.position.set(b.x + nx * (14.2 + j * 1.0) + tx * (j ? 1.6 : -1.6), 0, b.z + nz * (14.2 + j * 1.0) + tz * (j ? 1.6 : -1.6)); h.root.rotation.y = -b.phi - Math.PI / 2 + Math.PI + (j ? 0.3 : -0.3);
        h.pose(j ? 'idle' : 'watch', k * 3 + j); this.group.add(h.root); this.animated.push({ rig: h, pose: j ? 'idle' : 'watch', amp: 1 });
      }
    }
    // panneaux entrée / sortie des stands + limite 80
    const signAt = (rel, txt, bg) => { const i = clamp(Math.round((rel - P.sIn) / 2), 0, path.length - 1), p = path[i], nx = -Math.sin(p.phi), nz = Math.cos(p.phi); const s = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ map: TX.canvasTex(TX.boardCanvas(txt, bg, '#fff', '#fff', 512, 128), { wrap: false }) })); s.position.set(p.x + nx * 8.2, 2.6, p.z + nz * 8.2); s.rotation.y = -p.phi - Math.PI / 2; this.group.add(s); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#222' })); post.position.set(s.position.x, 1.3, s.position.z); this.group.add(post); };
    signAt(P.sIn + 40, 'PIT LANE', '#1d4ed8'); signAt(P.sIn + P.ramp + 20, 'LIMIT 80', '#c81e1e'); signAt(P.sOut - P.ramp - 20, 'PIT EXIT', '#168a3a');
    // feu de sortie des stands
    const ei = clamp(Math.round((P.sOut - P.ramp - P.sIn) / 2), 0, path.length - 1), ep = path[ei], enx = -Math.sin(ep.phi), enz = Math.cos(ep.phi);
    const exitPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), new THREE.MeshStandardMaterial({ color: '#222' })); exitPost.position.set(ep.x + enx * 6.2, 2, ep.z + enz * 6.2); this.group.add(exitPost);
    this.exitLamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), new THREE.MeshBasicMaterial({ color: '#19d24a' })); this.exitLamp.position.set(ep.x + enx * 6.2, 4.1, ep.z + enz * 6.2); this.group.add(this.exitLamp);
    this.exitGlow = new THREE.PointLight('#19d24a', 0, 14); this.exitGlow.position.copy(this.exitLamp.position); this.group.add(this.exitGlow);
  }

  // ---------------------------------------------------------------- murs & publicité
  _walls() {
    const tr = this.tr, N = tr.N, hw = tr.halfW;
    const step = 6, count = Math.floor(tr.L / step);
    const geo = new THREE.BoxGeometry(6.15, 1.1, 0.5); geo.translate(0, 0.55, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.0 });
    const inst = new THREE.InstancedMesh(geo, mat, count * 2); inst.castShadow = true; inst.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const out = {}; let n = 0; const boards = [[], [], [], [], [], []];
    for (let k = 0; k < count; k++) {
      const s = k * step + step / 2, pp = tr.posAt(s, 0, out), kap = Math.abs(tr.curvatureAt(s));
      for (const side of [-1, 1]) {
        const dist = side < 0 ? hw + tr.runoff : tr.rightBarrier(s);
        // dans la zone des stands à droite : pas de mur extérieur (garages)
        if (side > 0 && tr.pitZoneFactor(s) > 0.55 && dist > hw + 20) continue;
        p.set(pp.cx + pp.nx * side * dist, 0, pp.cz + pp.nz * side * dist); e.set(0, -pp.phi, 0); q.setFromEuler(e); m.compose(p, q, sc); inst.setMatrixAt(n, m);
        const stripe = kap > 0.0042 ? (k % 2 ? '#d71920' : '#f4f4f4') : (k % 8 < 4 ? '#eceff1' : '#cfd3d6');
        col.set(stripe); inst.setColorAt(n, col); n++;
        // panneaux publicitaires (fictifs) devant le mur, orientés vers la piste
        if (k % 5 === 2 && boards.length) boards[(k * 7 + (side > 0 ? 3 : 0)) % boards.length].push({ x: p.x - pp.nx * side * 0.28, z: p.z - pp.nz * side * 0.28, phi: pp.phi, side });
      }
    }
    inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; this.group.add(inst);
    const names = ['VELOCITA', 'NOVA FUEL', 'APEX', 'TURBO-X', 'AEROLINE', 'KINETIC', 'ORBITAL', 'HYPERION'];
    const bgs = ['#c81e1e', '#0b3d91', '#111111', '#f2a900', '#0a7d4d', '#6b21a8', '#e5e7eb', '#0e7490'];
    boards.forEach((list, i) => {
      if (!list.length) return;
      const bt = TX.canvasTex(TX.boardCanvas(names[i], bgs[i], bgs[i] === '#e5e7eb' ? '#111' : '#fff', '#fff', 512, 96), { wrap: false });
      const bm = new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide }); const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.4, 0.9), bm, list.length);
      list.forEach((b, j) => { p.set(b.x, 0.58, b.z); e.set(0, -b.phi + (b.side > 0 ? Math.PI : 0), 0); q.setFromEuler(e); m.compose(p, q, sc); im.setMatrixAt(j, m); }); this.group.add(im);
    });
    // grillage de protection (virages rapides)
    if (this.q.fence) {
      const fc = TX.makeCanvas(64, 64), g = fc.getContext('2d'); g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 1.2; for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
      const ft = TX.canvasTex(fc, { repeat: [1, 1] }); const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.2 });
      const fg = [];
      for (let k = 0; k < count; k++) { const s = k * step + step / 2; const kap = tr.curvatureAt(s); if (Math.abs(kap) < 0.0016) continue; const pp = tr.posAt(s, 0, out); for (const side of [-1, 1]) { if (side > 0 && tr.pitZoneFactor(s) > 0.3) continue; const dist = (side < 0 ? hw + tr.runoff : tr.rightBarrier(s)) + 0.5; const gg = new THREE.PlaneGeometry(6.15, 3.2); gg.rotateY(Math.PI / 2 - pp.phi + Math.PI / 2); gg.translate(pp.cx + pp.nx * side * dist, 2.7, pp.cz + pp.nz * side * dist); fg.push(gg); } }
      if (fg.length) { const mm = new THREE.Mesh(mergeGeometries(fg), fm); this.group.add(mm); }
    }
  }

  // ---------------------------------------------------------------- ligne de départ & grille
  _startLine() {
    const tr = this.tr, hw = tr.halfW;
    const ck = TX.canvasTex(TX.checkerCanvas(14), { wrap: false }); ck.center.set(0.5, 0.5); ck.rotation = Math.PI / 2; const cm = new THREE.MeshBasicMaterial({ map: ck, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.8, hw * 2), cm); const p = tr.posAt(0, 0, {}); line.rotation.x = -Math.PI / 2; line.rotation.z = -p.phi + Math.PI / 2 * 0; line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, 0, 0); line.rotation.y = 0;
    // orientation : largeur le long de la normale
    const g = new THREE.PlaneGeometry(1.8, hw * 2); g.rotateX(-Math.PI / 2); g.rotateY(-p.phi); const sl = new THREE.Mesh(g, cm); sl.position.set(p.x, 0.02, p.z); this.group.add(sl);
    // cases de grille
    const gc = TX.makeCanvas(128, 256), gx = gc.getContext('2d'); gx.clearRect(0, 0, 128, 256); gx.strokeStyle = '#fff'; gx.lineWidth = 8; gx.strokeRect(14, 34, 100, 200); gx.fillStyle = '#fff'; gx.fillRect(14, 34, 100, 8);
    const gm = new THREE.MeshBasicMaterial({ map: TX.canvasTex(gc, { wrap: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    tr.grid.slice(0, 20).forEach((s, k) => { const gp = new THREE.PlaneGeometry(2.4, 5.2); gp.rotateX(-Math.PI / 2); gp.rotateY(-s.phi - Math.PI / 2 * 0 + Math.PI / 2); gp.rotateY(-Math.PI / 2 + Math.PI / 2); const gmm = new THREE.Mesh(gp, gm); gmm.position.set(s.x, 0.022, s.z); gmm.rotation.y = 0; this.group.add(gmm); });
  }

  // ---------------------------------------------------------------- portique de départ
  _gantry() {
    const tr = this.tr, hw = tr.halfW, p = tr.posAt(0, 0, {}), tx = Math.cos(p.phi), tz = Math.sin(p.phi);
    const grp = new THREE.Group(); grp.position.set(p.x, 0, p.z); grp.rotation.y = -p.phi; this.group.add(grp);
    const steel = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.7, roughness: 0.4 });
    const W = hw + tr.kerbW + 3.4;
    for (const sz of [-1, 1]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9.4, 0.9), steel); pil.position.set(0, 4.7, sz * W); pil.castShadow = true; grp.add(pil); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, W * 2 + 1), steel); beam.position.set(0, 9.3, 0); beam.castShadow = true; grp.add(beam);
    // 5 modules x 2 feux
    this.startLights = [];
    const lm = (on) => new THREE.MeshBasicMaterial({ color: on ? '#ff2a1a' : '#2b0a08' });
    for (let k = 0; k < 5; k++) {
      const z = (k - 2) * 2.5, pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 1.9), new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.5 })); pod.position.set(0.95, 9.3, z); grp.add(pod);
      const row = [];
      for (const dy of [-0.2, 0.2]) for (const dz of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), lm(false)); l.position.set(1.22, 9.3 + dy, z + dz); l.rotation.y = Math.PI / 2; grp.add(l); row.push(l); }
      this.startLights.push(row);
    }
    this.gantryGlow = new THREE.PointLight('#ff2a1a', 0, 26); this.gantryGlow.position.set(3, 8, 0); grp.add(this.gantryGlow);
    // écran « FAUX DÉPART / feux » : bande lumineuse
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, W * 2 - 2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); strip.position.set(1.0, 8.55, 0); grp.add(strip);
  }
  setStartLights(n) { if (!this.startLights) return; this.startLights.forEach((row, k) => row.forEach((l) => l.material.color.set(k < n ? '#ff2a1a' : '#2b0a08'))); this.gantryGlow.intensity = n > 0 ? 60 : 0; }

  // ---------------------------------------------------------------- tribunes
  _stands() {
    const tr = this.tr, hw = tr.halfW, out = {};
    const crowdTex = TX.canvasTex(TX.crowdCanvas(), { repeat: [1, 1] }); this.crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    const concrete = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.85 }), roofM = new THREE.MeshStandardMaterial({ color: '#e8e8ea', roughness: 0.5, metalness: 0.2 });
    // emplacements : ligne droite des stands (côté gauche), et le long de quelques virages
    const spots = [];
    spots.push({ s: 0, len: 150, side: -1, rows: 8 });
    spots.push({ s: tr.L - 260, len: 110, side: -1, rows: 6 }); spots.push({ s: 190, len: 110, side: -1, rows: 6 });
    const corners = (tr.corners || []).slice(0, 7);
    corners.forEach((c, i) => { const side = -Math.sign(c.dir) || -1; spots.push({ s: c.apex, len: 70 + (i % 3) * 20, side: c.dir > 0 ? -1 : 1, rows: 5 }); });
    const sg = [], roofG = [], people = [];
    const rowH = 0.42, rowD = 0.85;
    for (const sp of spots) {
      const L = sp.len, step = 10, nSeg = Math.ceil(L / step);
      // vérifie dégagement : le terrain côté extérieur doit être libre
      const base = hw + tr.runoff + 5.5;
      const pc = tr.posAt(sp.s, 0, out);
      const sx = pc.cx + pc.nx * sp.side * (base + 6), sz = pc.cz + pc.nz * sp.side * (base + 6);
      if (sp.s !== 0 && this._tooCloseToOtherTrack(sx, sz, sp.s, 60)) continue;
      if (sp.side > 0 && tr.pitZoneFactor(sp.s) > 0.02) continue;
      for (let r = 0; r < sp.rows; r++) {
        for (let k = 0; k < nSeg; k++) {
          const s = sp.s - L / 2 + k * step + step / 2; const pp = tr.posAt(s, 0, out);
          const d = base + r * rowD + rowD / 2;
          const g = new THREE.BoxGeometry(step + 0.05, rowH * (r + 1), rowD); g.rotateY(-pp.phi + (sp.side > 0 ? 0 : 0)); g.translate(pp.cx + pp.nx * sp.side * d, rowH * (r + 1) / 2, pp.cz + pp.nz * sp.side * d); sg.push(g);
        }
      }
      // toit
      for (let k = 0; k < nSeg; k++) {
        const s = sp.s - L / 2 + k * step + step / 2; const pp = tr.posAt(s, 0, out); const d = base + sp.rows * rowD / 2 + 1.2;
        const g = new THREE.BoxGeometry(step + 0.05, 0.25, sp.rows * rowD + 3.2); g.rotateY(-pp.phi); g.translate(pp.cx + pp.nx * sp.side * d, rowH * sp.rows + 3.4 + sp.rows * 0.12, pp.cz + pp.nz * sp.side * d); roofG.push(g);
        for (const e of [0, 1]) { const pg = new THREE.BoxGeometry(0.2, rowH * sp.rows + 3.4, 0.2); const dd = base + sp.rows * rowD + 1.6; pg.translate(pp.cx + pp.nx * sp.side * dd + pp.tx * (e ? 4.5 : -4.5), (rowH * sp.rows + 3.4) / 2, pp.cz + pp.nz * sp.side * dd + pp.tz * (e ? 4.5 : -4.5)); roofG.push(pg); }
      }
      // spectateurs : rangées avant
      for (let r = 0; r < Math.min(sp.rows, 4); r++) for (let x = 0; x < L; x += 0.62) {
        if (this.rnd() < 0.12) continue;
        const s = sp.s - L / 2 + x; const pp = tr.posAt(s, 0, out); const d = base + r * rowD + rowD * 0.5 + (this.rnd() - 0.5) * 0.15;
        people.push({ x: pp.cx + pp.nx * sp.side * d, y: rowH * (r + 1), z: pp.cz + pp.nz * sp.side * d, phi: pp.phi + (sp.side > 0 ? Math.PI : 0) });
      }
    }
    if (sg.length) { const m = new THREE.Mesh(mergeGeometries(sg), this.crowdMat); m.castShadow = false; m.receiveShadow = true; this.group.add(m); }
    if (roofG.length) { const m = new THREE.Mesh(mergeGeometries(roofG), roofM); m.castShadow = true; this.group.add(m); }
    // public animé (instances) — limité par la qualité
    const maxP = this.q.crowd; this.spectators = null;
    if (maxP && people.length) {
      const list = people.length > maxP ? people.filter((_, i) => i % Math.ceil(people.length / maxP) === 0) : people;
      const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.3, 3, 6); bodyGeo.translate(0, 0.38, 0);
      const headGeo = new THREE.SphereGeometry(0.11, 8, 6); headGeo.translate(0, 0.78, 0);
      const mkMat = (hex) => { const mt = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }); mt.onBeforeCompile = (sh) => { sh.uniforms.uT = this.crowdU.uT; sh.uniforms.uEx = this.crowdU.uEx; sh.vertexShader = 'uniform float uT; uniform float uEx;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n float ph = float(gl_InstanceID) * 1.731; float jump = max(0.0, sin(uT * (5.0 + fract(ph) * 4.0) + ph)); transformed.y += jump * 0.22 * uEx * step(0.25, fract(ph * 0.37)); transformed.x += sin(uT * 2.0 + ph) * 0.02 * uEx;`); }; return mt; };
      this.crowdU = { uT: { value: 0 }, uEx: { value: 0.25 } };
      const bodies = new THREE.InstancedMesh(bodyGeo, mkMat('#ffffff'), list.length), heads = new THREE.InstancedMesh(headGeo, mkMat('#e8b98f'), list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
      const shirts = ['#d62828', '#f77f00', '#fcbf49', '#eae2b7', '#2a9d8f', '#4361ee', '#ffffff', '#e5383b', '#222222', '#8338ec', '#06d6a0', '#ffd400'];
      const skins = ['#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#ffdbb4'];
      list.forEach((p, i) => { pos.set(p.x, p.y, p.z); e.set(0, -p.phi + Math.PI / 2 + Math.PI, 0); q.setFromEuler(e); const s = 0.9 + this.rnd() * 0.25; sc.set(s, s, s); m.compose(pos, q, sc); bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m); bodies.setColorAt(i, col.set(shirts[(this.rnd() * shirts.length) | 0])); heads.setColorAt(i, col.set(skins[(this.rnd() * skins.length) | 0])); });
      this.group.add(bodies, heads); this.spectators = { bodies, heads };
    }
  }
  _tooCloseToOtherTrack(x, z, s0, minD) {
    const tr = this.tr;
    for (let i = 0; i < tr.N; i += 3) { const s = i * tr.ds; let ds = Math.abs(s - s0); ds = Math.min(ds, tr.L - ds); if (ds < 140) continue; const dx = tr.x[i] - x, dz = tr.z[i] - z; if (dx * dx + dz * dz < minD * minD) return true; }
    return false;
  }

  // ---------------------------------------------------------------- décor (arbres, bâtiments, collines, eau)
  _scenery() {
    const b = this.bounds, tr = this.tr, theme = this.theme, rnd = this.rnd, out = {};
    const minD = tr.halfW + tr.runoff + 10;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, rx = (b.maxX - b.minX) / 2 + 380, rz = (b.maxZ - b.minZ) / 2 + 380;
    // arbres
    const nT = Math.round(this.q.trees * (theme === 'forest' ? 1.4 : theme === 'city' ? 0.35 : theme === 'alpine' ? 1.1 : 0.6));
    const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 3, 6); trunkG.translate(0, 1.5, 0);
    const leafG = mergeGeometries([new THREE.ConeGeometry(2.6, 5.5, 8).translate(0, 5.2, 0), new THREE.ConeGeometry(2.0, 4.2, 8).translate(0, 7.8, 0), new THREE.ConeGeometry(1.3, 3.2, 8).translate(0, 9.9, 0)]);
    const roundG = new THREE.IcosahedronGeometry(3.2, 1); roundG.translate(0, 6.2, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }), nT);
    const leaves = new THREE.InstancedMesh(theme === 'alpine' || theme === 'forest' ? leafG : roundG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), nT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < nT * 6 && n < nT; tries++) {
      const x = cx + (rnd() * 2 - 1) * rx, z = cz + (rnd() * 2 - 1) * rz;
      if (this.grid.near(x, z, minD + 6)) continue;
      const sc = 0.7 + rnd() * 1.1; p.set(x, 0, z); e.set(0, rnd() * TAU, 0); q.setFromEuler(e); s.set(sc, sc * (0.9 + rnd() * 0.4), sc); m.compose(p, q, s);
      trunks.setMatrixAt(n, m); leaves.setMatrixAt(n, m);
      const tone = theme === 'alpine' ? [0.34, 0.6, 0.22 + rnd() * 0.12] : theme === 'forest' ? [0.28 + rnd() * 0.06, 0.55, 0.22 + rnd() * 0.12] : [0.25 + rnd() * 0.08, 0.5, 0.28 + rnd() * 0.12];
      leaves.setColorAt(n, col.setHSL(tone[0], tone[1], tone[2])); n++;
    }
    trunks.count = n; leaves.count = n; trunks.castShadow = false; leaves.castShadow = this.q.shadow > 1024; this.group.add(trunks, leaves);
    // bâtiments (Monaco)
    if (theme === 'city') {
      const bg = [], pal = ['#e9d7b4', '#e3b9a0', '#d9c2a4', '#f1e3c8', '#cda98b', '#dcc7a0', '#f4ead7'];
      const win = TX.makeCanvas(64, 128), wg = win.getContext('2d'); wg.fillStyle = '#ffffff'; wg.fillRect(0, 0, 64, 128); wg.fillStyle = '#3b556e'; for (let y = 6; y < 124; y += 16) for (let x = 6; x < 60; x += 14) wg.fillRect(x, y, 8, 10);
      const wt = TX.canvasTex(win, { wrap: true }); const bm = new THREE.MeshStandardMaterial({ map: wt, vertexColors: true, roughness: 0.85 });
      let cnt = 0; const target = this.q.buildings;
      for (let tries = 0; tries < target * 12 && cnt < target; tries++) {
        const x = cx + (rnd() * 2 - 1) * (rx - 120), z = cz + (rnd() * 2 - 1) * (rz - 120);
        if (this.grid.near(x, z, minD + 24)) continue;
        const w = 12 + rnd() * 22, d = 12 + rnd() * 22, h = 14 + rnd() * 52;
        const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 12), uv.getY(i) * (h / 16));
        const colr = new THREE.Color(pal[(rnd() * pal.length) | 0]); const arr = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = colr.r; arr[i + 1] = colr.g; arr[i + 2] = colr.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        g.rotateY(rnd() * 0.25 - 0.12); g.translate(x, 0, z); bg.push(g); cnt++;
      }
      if (bg.length) { const mm = new THREE.Mesh(mergeGeometries(bg), bm); mm.castShadow = this.q.shadow > 1024; mm.receiveShadow = true; this.group.add(mm); }
      // port : plan d'eau + yachts
      const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), new THREE.MeshStandardMaterial({ color: '#1d6c9b', roughness: 0.12, metalness: 0.25 }));
      water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.02, b.maxZ + 420); this.group.add(water); this.water = water;
      const hull = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 2.2, 4.4), new THREE.MeshStandardMaterial({ color: '#f6f6f6', roughness: 0.4 }), 70);
      for (let i = 0; i < 70; i++) { p.set(cx + (rnd() * 2 - 1) * 560, 1.2, b.maxZ + 180 + rnd() * 460); e.set(0, rnd() * 0.5 - 0.25, 0); q.setFromEuler(e); const k = 0.7 + rnd() * 1.1; s.set(k, k, k); m.compose(p, q, s); hull.setMatrixAt(i, m); }
      this.group.add(hull);
    }
    // collines lointaines (alpin / forêt / port)
    const hillN = theme === 'alpine' ? 26 : theme === 'forest' ? 12 : theme === 'city' ? 18 : 8;
    const hillM = new THREE.MeshStandardMaterial({ color: theme === 'alpine' ? '#5a7a52' : theme === 'city' ? '#7d8a74' : '#6f8f5a', roughness: 1, flatShading: true });
    const R0 = Math.max(rx, rz) + 600;
    for (let i = 0; i < hillN; i++) {
      const a = (i / hillN) * TAU + rnd() * 0.2, r = R0 + rnd() * 700, h = (theme === 'alpine' ? 260 : 120) + rnd() * (theme === 'alpine' ? 420 : 160);
      const g = new THREE.ConeGeometry(260 + rnd() * 360, h, 9); g.translate(0, h / 2, 0); const mesh = new THREE.Mesh(g, hillM); mesh.position.set(cx + Math.cos(a) * r, -2, cz + Math.sin(a) * r); mesh.rotation.y = rnd() * 3; this.group.add(mesh);
      if (theme === 'alpine' && h > 420) { const cap = new THREE.Mesh(new THREE.ConeGeometry(70 + h * 0.12, h * 0.22, 9), new THREE.MeshStandardMaterial({ color: '#f2f5f7', roughness: 0.9, flatShading: true })); cap.position.set(mesh.position.x, h * 0.89, mesh.position.z); this.group.add(cap); }
    }
  }

  // ---------------------------------------------------------------- panneaux de freinage
  _signs() {
    const tr = this.tr, out = {}; const hw = tr.halfW;
    const mats = [['200', 150], ['150', 100], ['100', 50]].map(([t]) => new THREE.MeshBasicMaterial({ map: TX.canvasTex(TX.brakeBoardCanvas(t), { wrap: false }) }));
    const cs = (tr.corners || []).filter((c) => c.kappa > 0.006).slice(0, 12);
    for (const c of cs) {
      [[200, 0], [150, 1], [100, 2]].forEach(([dist, mi]) => {
        const s = tr.wrapS(c.entry - dist * 0.55); const pp = tr.posAt(s, 0, out); const side = -c.dir || 1;
        const d = side * (hw + tr.kerbW + 3.0);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), mats[mi]); mesh.position.set(pp.cx + pp.nx * d, 1.5, pp.cz + pp.nz * d); mesh.rotation.y = -pp.phi - Math.PI / 2 + (side > 0 ? Math.PI : 0) + Math.PI; this.group.add(mesh);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), new THREE.MeshStandardMaterial({ color: '#222' })); post.position.set(mesh.position.x, 0.75, mesh.position.z); this.group.add(post);
      });
    }
  }

  // ---------------------------------------------------------------- commissaires + drapeaux
  _marshals() {
    const tr = this.tr, out = {}, hw = tr.halfW;
    const n = this.q.crowd ? 14 : 6; this.marshals = [];
    for (let i = 0; i < n; i++) {
      const s = (i / n) * tr.L + 45; const pp = tr.posAt(s, 0, out);
      const side = (i % 2) ? -1 : 1; if (side > 0 && tr.pitZoneFactor(s) > 0.05) continue;
      const dist = (side < 0 ? hw + tr.runoff : tr.rightBarrier(s)) + 1.8;
      const x = pp.cx + pp.nx * side * dist, z = pp.cz + pp.nz * side * dist;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.8), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 })); booth.position.set(0, 1.1, side * 1.9); booth.rotation.y = -pp.phi; g.add(booth);
      const h = makeHuman({ suit: '#ff7a00', trim: '#ffffff', hat: 'cap', gloves: '#fff' }); h.root.position.set(0, 0, 0); h.root.rotation.y = -pp.phi + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI; g.add(h.root);
      const flagMat = new THREE.MeshBasicMaterial({ color: '#19d24a', side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6, 6, 1), flagMat); flag.position.set(0.0, 2.5, 0); h.root.add(flag); flag.position.set(0.5, 2.2, 0); flag.visible = false;
      this.group.add(g); this.marshals.push({ s, rig: h, flag, flagMat, side, phase: i * 1.3, g });
    }
  }
  /** drapeaux par secteur : état ('none'|'yellow'|'double'|'red') pour chaque commissaire selon sa position */
  updateMarshals(dt, flagAt) {
    for (const m of this.marshals) {
      const f = flagAt(m.s) || 'none'; const show = f !== 'none';
      m.flag.visible = show; if (show) m.flagMat.color.set(f === 'red' ? '#ff1f1f' : f === 'blue' ? '#2f7bff' : f === 'green' ? '#19d24a' : '#ffd500');
      m.rig.pose(show ? 'wave' : 'idle', this.t * (show ? 1 : 0.4) + m.phase);
      if (show) { m.flag.rotation.z = Math.sin(this.t * 10 + m.phase) * 0.35; m.flag.rotation.y = Math.sin(this.t * 7) * 0.4; }
    }
  }

  // ---------------------------------------------------------------- pluie
  _rain() {
    const N = this.q.rain; this.rainN = N; this.rainPos = new Float32Array(N * 6); this.rainW = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.rainW[i * 3] = (Math.random() - 0.5) * 80; this.rainW[i * 3 + 1] = Math.random() * 40; this.rainW[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d6e6', transparent: true, opacity: 0.35, fog: false, depthWrite: false })); this.rainMesh.visible = false; this.rainMesh.frustumCulled = false; this.group.add(this.rainMesh);
  }

  // ---------------------------------------------------------------- météo + boucle
  setWeather(rain, wet) {
    this.rainLevel = rain; this.wetLevel = wet;
    const r = clamp(rain, 0, 1), w = clamp(wet, 0, 1);
    this.roadMat.roughness = lerp(0.93, 0.22, w); this.roadMat.metalness = lerp(0, 0.18, w); this.roadMat.envMapIntensity = lerp(0.25, 1.4, w); this.roadMat.color.setScalar(lerp(1, 0.62, w));
    this.apronMat.roughness = lerp(0.95, 0.35, w); this.grassMat.color.setScalar(lerp(1, 0.72, w));
    const k = Math.max(r, w * 0.6);
    this.skyMat.color.setRGB(lerp(1, 0.55, k), lerp(1, 0.58, k), lerp(1, 0.64, k));
    this.cloudMat.opacity = lerp(0.5, 0.95, k); this.cloudMat.color.setScalar(lerp(1, 0.55, k));
    this.scene.fog.color.copy(this.skyColors.clear).lerp(this.skyColors.rain, k); this.scene.fog.density = lerp(0.00055, 0.0023, k);
    this.sun.intensity = lerp(2.6, 0.7, k); this.hemi.intensity = lerp(0.85, 0.7, k); this.scene.environmentIntensity = lerp(0.9, 0.55, k);
    this.sunSprite.material.opacity = lerp(1, 0.1, k);
    this.rainMesh.visible = r > 0.03; this.rainMesh.material.opacity = 0.18 + r * 0.3;
  }

  setExcite(v) { this.exciteTarget = v; }

  /** boxTeams / flags etc. sont fournis par main */
  update(dt, ctx) {
    this.t += dt; const cam = ctx.camera, tgt = ctx.focus;
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * 1.5);
    if (this.crowdU) { this.crowdU.uT.value = this.t; this.crowdU.uEx.value = this.excite; }
    // soleil : suit la cible pour garder des ombres nettes
    if (tgt) { this.sun.target.position.set(tgt.x, 0, tgt.z); this.sun.position.set(tgt.x + 140, 220, tgt.z + 90); this.sun.target.updateMatrixWorld(); }
    this.sky.position.copy(cam.position); this.sunSprite.position.set(cam.position.x + 2500, 1700, cam.position.z + 1700); this.clouds.position.x = cam.position.x; this.clouds.position.z = cam.position.z; this.cloudMat.map.offset.x += dt * 0.0009;
    // pluie
    if (this.rainMesh.visible) {
      const P = this.rainPos, W = this.rainW, N = this.rainN, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, fall = 32 * dt, sp = ctx.speed || 0, tilt = 0.4;
      const sx = Math.cos(ctx.heading || 0) * -sp * 0.015, sz = Math.sin(ctx.heading || 0) * -sp * 0.015;
      for (let i = 0; i < N; i++) {
        let x = W[i * 3], y = W[i * 3 + 1] - fall, z = W[i * 3 + 2];
        if (y < -2) y += 42; x -= (x - (cx - 40) + 80 * 1000) % 80 - ((x - (cx - 40) + 80 * 1000) % 80 - 0) * 0;
        // enroulement autour de la caméra
        const rx = ((x - cx + 40) % 80 + 80) % 80 - 40, rz = ((z - cz + 40) % 80 + 80) % 80 - 40;
        W[i * 3] = cx + rx; W[i * 3 + 1] = y; W[i * 3 + 2] = cz + rz;
        const o = i * 6, len = 0.9 + (this.rainLevel || 0) * 0.7;
        P[o] = cx + rx; P[o + 1] = y + cy * 0 ; P[o + 2] = cz + rz; P[o + 3] = cx + rx + sx * len * 0.05 + tilt * 0.12; P[o + 4] = y + len; P[o + 5] = cz + rz + sz * len * 0.05;
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    }
    // humains animés (idle)
    for (const a of this.animated) a.rig.pose(a.pose, this.t * (a.amp || 1));
    // feux de box / sortie
    if (ctx.pitExitLight) { const g = ctx.pitExitLight === 'green'; this.exitLamp.material.color.set(g ? '#19d24a' : '#ff1a1a'); this.exitGlow.color.set(g ? '#19d24a' : '#ff1a1a'); this.exitGlow.intensity = 25; }
    if (ctx.boxLights) for (const g of this.garages) { const c = ctx.boxLights[g.k]; if (c) g.lamp.material.color.set(c); }
  }

  /** équipe de mécaniciens (créée à la demande, partagée par équipe) */
  crewFor(teamId) {
    if (this.crews[teamId]) return this.crews[teamId];
    const c = makePitCrew(teamId); c.group.visible = false; this.group.add(c.group); c.teamId = teamId; this.crews[teamId] = c; return c;
  }
}
