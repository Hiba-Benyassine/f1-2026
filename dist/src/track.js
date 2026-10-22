// =====================================================================
//  TRACK : spline fermée, échantillonnage uniforme, projection rapide,
//  ligne de course, profil de vitesse, stands, grille, générateur procédural.
//  Repère : x, z dans le plan ; la voiture regarde (cos phi, sin phi) ;
//  "droite" = (-sin phi, cos phi). phi qui augmente = virage à droite.
// =====================================================================
import { CAR, G, RHO, TRACK_CFG } from './constants.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU = Math.PI * 2;
const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- Catmull-Rom centripétale (même formule que three.js) -----------
function nonuniform(x0, x1, x2, x3, dt0, dt1, dt2, t) {
  let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
  let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
  t1 *= dt1; t2 *= dt1;
  const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2, c3 = 2 * x1 - 2 * x2 + t1 + t2;
  return x1 + t1 * t + c2 * t * t + c3 * t * t * t;
}
export function splineClosed(pts, per = 28) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    let d0 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5) || 1;
    let d1 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5) || 1;
    let d2 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5) || 1;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([nonuniform(p0[0], p1[0], p2[0], p3[0], d0, d1, d2, t), nonuniform(p0[1], p1[1], p2[1], p3[1], d0, d1, d2, t)]);
    }
  }
  return out;
}
function polyLength(pts) { let L = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
function resampleUniform(pts, N) {
  const n = pts.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[n], out = []; let j = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * L;
    while (cum[j + 1] < target) j++;
    const a = pts[j], b = pts[(j + 1) % n], f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

// =====================================================================
export class Track {
  /**
   * @param ctrl  points de contrôle [[x,z],...]
   * @param opts  { width, targetLength (m), name, label }
   */
  constructor(ctrl, opts = {}) {
    this.name = opts.name || 'track';
    this.label = opts.label || '';
    this.width = opts.width || 15;
    this.halfW = this.width / 2;
    this.kerbW = TRACK_CFG.kerbW; this.apronW = TRACK_CFG.apronW; this.runoff = TRACK_CFG.runoff;

    let dense = splineClosed(ctrl, 28);
    if (opts.targetLength) {
      const k = opts.targetLength / polyLength(dense);
      dense = dense.map((p) => [p[0] * k, p[1] * k]);
    }
    const L0 = polyLength(dense);
    const N = Math.round(L0 / 3);
    let pts = resampleUniform(dense, N);
    // 1ère passe pour trouver la ligne droite la plus longue
    let tmp = this._derive(pts);
    const st = this._findStart(tmp);
    pts = pts.slice(st.index).concat(pts.slice(0, st.index));
    this._derive(pts, true);
    this._buildLine();
    this._buildPit(st);
    this._buildCorners();
    this._buildGrid();
  }

  _derive(pts, commit = false) {
    const N = pts.length;
    const x = new Float32Array(N), z = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N);
    const nx = new Float32Array(N), nz = new Float32Array(N), kap = new Float32Array(N), s = new Float32Array(N);
    for (let i = 0; i < N; i++) { x[i] = pts[i][0]; z[i] = pts[i][1]; }
    let L = 0;
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; L += Math.hypot(x[j] - x[i], z[j] - z[i]); }
    const ds = L / N;
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l; nx[i] = -tz[i]; nz[i] = tx[i]; s[i] = i * ds;
    }
    const phi = new Float32Array(N);
    for (let i = 0; i < N; i++) phi[i] = Math.atan2(tz[i], tx[i]);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = (i - 2 + N) % N, b = (i + 2) % N; raw[i] = wrapAngle(phi[b] - phi[a]) / (4 * ds); }
    for (let i = 0; i < N; i++) { let sum = 0; for (let k = -3; k <= 3; k++) sum += raw[(i + k + N) % N]; kap[i] = sum / 7; }
    const r = { x, z, tx, tz, nx, nz, kap, s, L, ds, N, phi };
    if (commit) Object.assign(this, r);
    return r;
  }

  _findStart(t) {
    // plus longue séquence quasi droite (|kappa| < 0.0012)
    const { N, kap, ds } = t;
    let best = 0, bestStart = 0, run = 0, runStart = 0;
    const thr = 0.0019;
    // double parcours pour gérer le wrap
    for (let i = 0; i < 2 * N; i++) {
      if (Math.abs(kap[i % N]) < thr) { if (run === 0) runStart = i; run++; if (run > best && run <= N) { best = run; bestStart = runStart; } }
      else run = 0;
    }
    const mid = Math.round(bestStart + best * 0.5) % N;
    return { index: mid, straightLen: best * ds, before: best * 0.5 * ds, after: best * 0.5 * ds };
  }

  // ---------- accès -------------------------------------------------
  wrapS(s) { const L = this.L; s %= L; return s < 0 ? s + L : s; }
  rel(s) { const L = this.L; s = this.wrapS(s + L / 2) - L / 2; return s; } // [-L/2, L/2)
  posAt(s, d = 0, out = {}) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l; out.tz = tz / l; out.nx = -out.tz; out.nz = out.tx;
    out.cx = this.x[i] + (this.x[j] - this.x[i]) * t; out.cz = this.z[i] + (this.z[j] - this.z[i]) * t;
    out.x = out.cx + out.nx * d; out.z = out.cz + out.nz * d; out.phi = Math.atan2(out.tz, out.tx);
    return out;
  }
  curvatureAt(s) { s = this.wrapS(s); const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f); return this.kap[i] * (1 - t) + this.kap[j] * t; }
  lineOffsetAt(s) { s = this.wrapS(s); const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f); return this.lineD[i] * (1 - t) + this.lineD[j] * t; }
  lineKappaAt(s) { s = this.wrapS(s); const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f); return this.lineKappa[i] * (1 - t) + this.lineKappa[j] * t; }
  profileAt(prof, s) { s = this.wrapS(s); const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f); return prof[i] * (1 - t) + prof[j] * t; }

  /** projection d'un point sur la ligne centrale. hint = indice voisin. */
  project(px, pz, hint, out = {}) {
    const N = this.N, x = this.x, z = this.z;
    let best = 1e18, bi = hint | 0;
    const W = 34;
    let start = ((hint | 0) - W + N * 4) % N;
    for (let k = 0; k <= 2 * W; k++) {
      const i = (start + k) % N, dx = px - x[i], dz = pz - z[i], d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    if (best > 90 * 90) { // téléportation / première fois : recherche globale
      best = 1e18;
      for (let i = 0; i < N; i += 2) { const dx = px - x[i], dz = pz - z[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
      for (let i = bi - 2; i <= bi + 2; i++) { const ii = (i + N) % N, dx = px - x[ii], dz = pz - z[ii], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = ii; } }
    }
    // raffinement : segment (bi-1,bi) ou (bi,bi+1)
    const prev = (bi - 1 + N) % N, next = (bi + 1) % N;
    const segs = [[prev, bi], [bi, next]];
    let bs = 0, bf = 0, bd = 1e18;
    for (let q = 0; q < 2; q++) {
      const a = segs[q][0], b = segs[q][1];
      const ex = x[b] - x[a], ez = z[b] - z[a], el2 = ex * ex + ez * ez || 1;
      let f = ((px - x[a]) * ex + (pz - z[a]) * ez) / el2; f = Math.max(0, Math.min(1, f));
      const cx = x[a] + ex * f, cz = z[a] + ez * f, d2 = (px - cx) ** 2 + (pz - cz) ** 2;
      if (d2 < bd) { bd = d2; bs = a; bf = f; }
    }
    let s = (bs + bf) * this.ds; if (s >= this.L) s -= this.L;
    out.i = bs; out.s = s;
    const j = (bs + 1) % N;
    const tx = this.tx[bs] + (this.tx[j] - this.tx[bs]) * bf, tz = this.tz[bs] + (this.tz[j] - this.tz[bs]) * bf;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l; out.tz = tz / l; out.nx = -out.tz; out.nz = out.tx;
    const cx = x[bs] + (x[j] - x[bs]) * bf, cz = z[bs] + (z[j] - z[bs]) * bf;
    out.cx = cx; out.cz = cz;
    out.d = (px - cx) * out.nx + (pz - cz) * out.nz;
    return out;
  }

  // ---------- zones / surfaces --------------------------------------
  pitZoneFactor(s) { // 1 dans la zone stands, 0 ailleurs (transitions douces)
    const r = this.rel(s), pit = this.pit;
    return smoothstep(pit.sIn - 40, pit.sIn + 10, r) * (1 - smoothstep(pit.sOut - 10, pit.sOut + 40, r));
  }
  rightBarrier(s) {
    const base = this.halfW + this.runoff;
    const r = this.rel(s), pit = this.pit;
    const zone = this.pitZoneFactor(s);
    if (zone <= 0) return base;
    // mur des stands entre sIn+110 et sOut-110, sinon dégagement large
    const wall = smoothstep(pit.sIn + 105, pit.sIn + 120, r) * (1 - smoothstep(pit.sOut - 120, pit.sOut - 105, r));
    const wide = this.halfW + TRACK_CFG.pitBarrier;
    const pitWall = this.halfW + TRACK_CFG.pitWallOffset;
    return base * (1 - zone) + (wide * (1 - wall) + pitWall * wall) * zone;
  }
  /** surface sous une voiture : retourne {type, grip, drag} */
  surface(d, s) {
    const ad = Math.abs(d), hw = this.halfW;
    if (ad <= hw) return SURF.track;
    if (ad <= hw + this.kerbW) return SURF.kerb;
    if (ad <= hw + this.kerbW + this.apronW) return SURF.apron;
    return SURF.grass;
  }

  // ---------- ligne de course & profil -------------------------------
  _buildLine() {
    const N = this.N, k = 2, M = Math.floor(N / k);
    const d = new Float32Array(M); const lim = this.halfW - 2.4;
    const px = new Float32Array(M), pz = new Float32Array(M), nx = new Float32Array(M), nz = new Float32Array(M), cx = new Float32Array(M), cz = new Float32Array(M);
    for (let m = 0; m < M; m++) { const i = m * k; cx[m] = this.x[i]; cz[m] = this.z[i]; nx[m] = this.nx[i]; nz[m] = this.nz[i]; }
    for (let it = 0; it < 500; it++) {
      for (let m = 0; m < M; m++) {
        const a = (m - 1 + M) % M, b = (m + 1) % M;
        const ax = cx[a] + nx[a] * d[a], az = cz[a] + nz[a] * d[a], bx = cx[b] + nx[b] * d[b], bz = cz[b] + nz[b] * d[b];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const target = (mx - cx[m]) * nx[m] + (mz - cz[m]) * nz[m];
        d[m] += 0.7 * (target - d[m]);
        if (d[m] > lim) d[m] = lim; if (d[m] < -lim) d[m] = -lim;
        // rayon mini de la ligne : on ne colle pas à la corde dans les épingles serrées
        const kc = this.kap[m * k];
        if (Math.abs(kc) > 1e-4) {
          const inMax = Math.max(-lim, Math.min(lim, 1 / Math.abs(kc) - 26)), sg = Math.sign(kc);
          if (d[m] * sg > inMax) d[m] = sg * inMax;
        }
      }
    }
    // lissage
    const d2 = new Float32Array(M);
    for (let p = 0; p < 3; p++) { for (let m = 0; m < M; m++) d2[m] = (d[(m - 1 + M) % M] + 2 * d[m] + d[(m + 1) % M]) / 4; d.set(d2); }
    this.lineD = new Float32Array(N);
    for (let i = 0; i < N; i++) { const f = i / k, m = Math.floor(f) % M, m2 = (m + 1) % M, t = f - Math.floor(f); this.lineD[i] = d[m] * (1 - t) + d[m2] * t; }
    // courbure de la ligne (cercle circonscrit sur 12 m)
    const lx = new Float32Array(N), lz = new Float32Array(N);
    for (let i = 0; i < N; i++) { lx[i] = this.x[i] + this.nx[i] * this.lineD[i]; lz[i] = this.z[i] + this.nz[i] * this.lineD[i]; }
    this.lineX = lx; this.lineZ = lz;
    const kl = new Float32Array(N), w = 4;
    for (let i = 0; i < N; i++) {
      const a = (i - w + N) % N, b = (i + w) % N;
      const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
      const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(lx[b] - lx[a], lz[b] - lz[a]);
      kl[i] = (2 * cr) / (la * lb * lc + 1e-9); // signé
    }
    const kls = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s2 = 0; for (let q = -2; q <= 2; q++) s2 += kl[(i + q + N) % N]; kls[i] = s2 / 5; }
    this.lineKappa = kls;
  }

  /** profil de vitesse (m/s) selon adhérence relative (météo/pneus) et vitesse max */
  speedProfile({ muScale = 1, vmax = 94, safety = 0.82 } = {}) {
    const N = this.N, ds = this.ds, m = CAR.mass + 40;
    const mu = CAR.mu0 * muScale * safety;
    const q = (mu * RHO * CAR.ClA) / (2 * m);
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(this.lineKappa[i]), den = k - q;
      v[i] = Math.min(vmax, den > 1e-6 ? Math.sqrt((mu * G) / den) : vmax);
      v[i] = Math.max(v[i], 9);
    }
    const brakeDecel = (u) => ((mu * 0.95) * (m * G + 0.5 * RHO * CAR.ClA * u * u) + 0.5 * RHO * CAR.CdA * u * u) / m * 0.92;
    const accel = (u) => Math.max(1.2, Math.min(0.62 * mu * (G + (0.5 * RHO * CAR.ClA * u * u) / m), (CAR.power / Math.max(u, 9) - 0.5 * RHO * CAR.CdA * u * u) / m));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 2 * N - 1; i >= 0; i--) { const a = i % N, b = (i + 1) % N; const lim = Math.sqrt(v[b] * v[b] + 2 * brakeDecel(v[b]) * ds); if (lim < v[a]) v[a] = lim; }
      for (let i = 0; i < 2 * N; i++) { const a = i % N, b = (i + 1) % N; const lim = Math.sqrt(v[a] * v[a] + 2 * accel(v[a]) * ds); if (lim < v[b]) v[b] = lim; }
    }
    return v;
  }

  _buildCorners() {
    // virages significatifs = minima locaux de |kappa| de la ligne > seuil
    const N = this.N, ds = this.ds, corners = [];
    const k = (i) => Math.abs(this.kap[(i + N) % N]);
    const win = Math.round(40 / ds);
    for (let i = 0; i < N; i++) {
      const v = k(i); if (v < 0.007) continue;
      let isMax = true; for (let q = -win; q <= win; q++) if (k(i + q) > v) { isMax = false; break; }
      if (!isMax) continue;
      if (corners.length && Math.abs(i * ds - corners[corners.length - 1].apex) < 60) continue;
      let e = i; while (k(e - 1) > 0.0035 && i - e < 200) e--;
      let x = i; while (k(x + 1) > 0.0035 && x - i < 200) x++;
      corners.push({ apex: i * ds, entry: ((e + N) % N) * ds, exit: ((x + N) % N) * ds, dir: Math.sign(this.kap[i]), kappa: v, radius: 1 / v });
    }
    this.corners = corners;
  }

  // ---------- stands ------------------------------------------------
  _buildPit(st) {
    const before = st.before, after = st.after;
    const cfg = TRACK_CFG;
    const sIn = -Math.max(110, Math.min(before - 25, 330));
    const sOut = Math.max(240, Math.min(after - 25, 330));
    const dLane = this.halfW + cfg.pitLaneOffset;
    const ramp = 105;
    const boxN = 14;
    const box0 = 30;
    const spacing = Math.max(7, Math.min(9, (sOut - ramp - 12 - box0) / boxN));
    this.pit = { sIn, sOut, dLane, ramp, box0, spacing, boxN, laneWidth: 10, limit: 80 / 3.6 };
    // chemin des stands
    const path = [], step = 2;
    const d0 = this.halfW - 1.5;
    for (let r = sIn; r <= sOut; r += step) {
      const eIn = smoothstep(sIn, sIn + ramp, r), eOut = 1 - smoothstep(sOut - ramp, sOut, r);
      const d = d0 + (dLane - d0) * Math.min(eIn, eOut);
      const p = this.posAt(r < 0 ? this.L + r : r, d, {});
      path.push({ x: p.x, z: p.z, phi: p.phi, rel: r, d });
    }
    // phi réel par différences
    for (let i = 0; i < path.length; i++) { const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]; path[i].phi = Math.atan2(b.z - a.z, b.x - a.x); }
    this.pitPath = path;
    this.pitBoxes = [];
    for (let k = 0; k < boxN; k++) {
      const r = box0 + k * spacing;
      const idx = Math.round((r - sIn) / step);
      this.pitBoxes.push({ rel: r, idx, ...path[idx] });
    }
    this.pitEntryIdx = Math.round(20 / step);
    this.pitExitIdx = Math.min(path.length - 4, Math.round((sOut - ramp - sIn) / step) + 2);   // ligne de sortie = début de la jonction avec la piste
  }

  _buildGrid() {
    this.grid = [];
    for (let k = 0; k < 20; k++) {
      const rel = -14 - k * 8.5; const d = (k % 2 === 0 ? -1 : 1) * (this.halfW * 0.22);
      const p = this.posAt(this.L + rel, d, {});
      this.grid.push({ x: p.x, z: p.z, phi: p.phi, s: this.wrapS(this.L + rel), rel, d });
    }
  }

  /** points pour minimap */
  outline(step = 4) { const o = []; for (let i = 0; i < this.N; i += step) o.push([this.x[i], this.z[i]]); return o; }
  bounds() {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (let i = 0; i < this.N; i++) { a = Math.min(a, this.x[i]); b = Math.min(b, this.z[i]); c = Math.max(c, this.x[i]); d = Math.max(d, this.z[i]); }
    return { minX: a, minZ: b, maxX: c, maxZ: d };
  }
  /** longueur de ligne droite autour du départ (m) */
  straightAroundStart() {
    const thr = 0.0019; let a = 0, b = 0;
    for (let i = 0; i < this.N / 2; i++) { if (Math.abs(this.kap[i]) < thr) b++; else break; }
    for (let i = 1; i < this.N / 2; i++) { if (Math.abs(this.kap[this.N - i]) < thr) a++; else break; }
    return { before: a * this.ds, after: b * this.ds };
  }
}

export const SURF = {
  track: { type: 'track', grip: 1.0, drag: 0 },
  kerb:  { type: 'kerb',  grip: 0.93, drag: 0.002 },
  apron: { type: 'apron', grip: 0.78, drag: 0.012 },
  grass: { type: 'grass', grip: 0.5,  drag: 0.07 },
};

// =====================================================================
//  VALIDATION (auto-intersection, rayon mini, longueur)
// =====================================================================
export function validateTrack(tr) {
  const problems = [];
  const step = 4, n = Math.floor(tr.N / step);
  const minGap = tr.width + 28;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      let ds = (b - a) * step * tr.ds; ds = Math.min(ds, tr.L - ds);
      if (ds < 110) continue;
      const i = a * step, j = b * step;
      const d = Math.hypot(tr.x[i] - tr.x[j], tr.z[i] - tr.z[j]);
      if (d < minGap) { problems.push(`proche/intersection s=${(i * tr.ds) | 0} & s=${(j * tr.ds) | 0} (${d.toFixed(0)}m)`); a = n; break; }
    }
  }
  let kmax = 0; for (let i = 0; i < tr.N; i++) kmax = Math.max(kmax, Math.abs(tr.kap[i]));
  if (1 / kmax < 20) problems.push(`rayon mini ${(1 / kmax).toFixed(1)}m`);
  const sg = tr.straightAroundStart();
  if (sg.before + sg.after < 380) problems.push(`ligne droite départ courte (${(sg.before + sg.after) | 0}m)`);
  return { ok: problems.length === 0, problems, length: tr.L, minRadius: 1 / kmax, straight: sg };
}

// =====================================================================
//  TRACÉS NOMMÉS — STYLISÉS APPROXIMATIFS (unité arbitraire, mis à l'échelle)
// =====================================================================
export const LAYOUTS = {
  monza: [
    [-2, 0], [3, 0], [8, 0], [13, 0], [14.7, 0.02], [15.5, 0.55], [16.3, 0.4], [17.2, 0.95],
    [18.6, 1.5], [20.0, 2.5], [20.7, 4.0], [21.0, 5.3], [20.7, 6.3], [21.2, 7.2], [20.2, 8.4],
    [18.4, 9.0], [17.2, 9.9], [15.6, 10.4], [14.0, 10.9], [13.0, 10.4], [12.0, 11.0], [10.8, 10.6],
    [8.0, 10.7], [3.0, 10.7], [-1.5, 10.6], [-4.2, 10.0], [-6.2, 8.4], [-6.8, 6.0], [-6.2, 3.4], [-4.6, 1.0],
  ],
  monaco: [
    [-3, 0], [1, 0], [5, 0], [7, 0.2], [8.1, 1.2], [8.0, 2.8], [7.2, 4.0], [6.0, 4.4], [4.9, 3.9],
    [3.6, 4.4], [2.6, 5.6], [2.7, 6.9], [3.7, 7.5], [4.6, 6.8], [5.8, 7.3], [6.6, 8.6], [6.0, 10.0],
    [4.5, 10.8], [2.8, 10.4], [1.2, 11.0], [-0.6, 10.3], [-1.4, 8.8], [-0.6, 7.6], [-1.8, 6.4], [-3.4, 5.4],
    [-4.6, 3.6], [-4.4, 1.6], [-3.7, 0.5],
  ],
  silverstone: [
    [-3, 0], [3, 0], [8, 0], [11, 0.2], [12.6, 1.0], [13.2, 2.4], [12.4, 3.7], [11.5, 4.9],
    [12.6, 5.9], [12.8, 7.6], [11.4, 8.8], [9.0, 9.2], [7.0, 8.6], [5.4, 9.4], [4.0, 10.8], [2.2, 11.2],
    [0.2, 10.2], [-1.4, 8.8], [-2.0, 7.0], [-1.0, 5.4], [-2.4, 4.2], [-4.4, 4.0], [-6.0, 2.8], [-6.2, 1.0], [-5.0, -0.4],
  ],
  redbullring: [
    [-3, 0], [2, 0], [6, 0], [8.5, 0], [9.9, 0.6], [10.4, 2.0], [9.8, 3.2], [8.2, 3.7], [7.0, 3.0],
    [6.2, 3.8], [6.6, 5.4], [8.0, 6.4], [8.4, 8.0], [7.2, 9.2], [5.2, 9.3], [3.6, 8.2], [2.4, 6.4],
    [0.6, 5.8], [-1.4, 6.4], [-3.0, 5.4], [-3.4, 3.4], [-4.2, 1.8], [-4.4, 0.4],
  ],
};

export function buildNamedTrack(circuit, width = 15) {
  const pts = LAYOUTS[circuit.id];
  return new Track(pts, { width, targetLength: circuit.gameKm * 1000, name: circuit.id, label: `Tracé stylisé approximatif de ${circuit.name} (non officiel)` });
}

// =====================================================================
//  GÉNÉRATEUR PROCÉDURAL (reproductible par seed)
// =====================================================================
export function generateTrack({ seed = 2026, complexity = 0.5, width = 15, targetKm = 3.0 } = {}) {
  let attempt = 0, tr = null, report = null, usedSeed = seed;
  while (attempt < 40) {
    usedSeed = seed + attempt * 7919;
    const rnd = mulberry32(usedSeed);
    const cxEff = attempt > 32 ? complexity * 0.5 : attempt > 24 ? complexity * 0.65 : attempt > 15 ? complexity * 0.8 : attempt > 8 ? complexity * 0.9 : complexity;
    const n = Math.round(9 + cxEff * 11);          // nombre de points de contrôle
    const R = 1;
    const pts = [];
    // base : grande boucle stylisée avec une corde (la future ligne droite)
    const jit = 0.18 + cxEff * 0.42;
    const aspect = 1.4 + rnd() * 0.8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = R * (1 + (rnd() * 2 - 1) * jit * (i % 2 === 0 ? 1 : 0.55));
      pts.push([Math.cos(a) * rr * aspect * 2.2, Math.sin(a) * rr * 1.5]);
    }
    // ligne droite : on aplatit 3 points consécutifs alignés
    const k = Math.floor(rnd() * n);
    const A = pts[k], B = pts[(k + 2) % n];
    pts[(k + 1) % n] = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const mid = pts[(k + 1) % n];
    const ex = B[0] - A[0], ez = B[1] - A[1];
    pts.splice(k + 1, 0, [A[0] + ex * 0.25, A[1] + ez * 0.25]);
    pts.splice(k + 3, 0, [A[0] + ex * 0.75, A[1] + ez * 0.75]);
    try {
      tr = new Track(pts, { width, targetLength: targetKm * 1000, name: 'procedural', label: `Circuit généré — seed ${usedSeed} (itération ${attempt + 1})` });
      report = validateTrack(tr);
      if (report.ok) break;
    } catch (e) { report = { ok: false, problems: [String(e)] }; }
    attempt++;
  }
  tr.seed = usedSeed; tr.iterations = attempt + 1; tr.validation = report;
  return tr;
}
