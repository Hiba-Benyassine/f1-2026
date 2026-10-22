// =====================================================================
//  AI DRIVER — Steering Behaviors (Craig Reynolds) appliqués à la course.
//  steering force = vitesse désirée - vitesse actuelle  (cours Master MIAGE IA2)
//
//  Comportements réellement utilisés (par ordre de priorité) :
//   1. OBSTACLE AVOIDANCE : vecteur "ahead" prédictif (longueur ~ vitesse),
//      obstacles circulaires (voitures arrêtées, débris, lézard, murs de voitures)
//   2. EVADE / PURSUIT : position PRÉDITE des obstacles/voitures mobiles
//      (lézard qui traverse, voiture devant => dépassement côté libre)
//   3. SEPARATION : répulsion latérale des voitures voisines (côte à côte)
//   4. PATH FOLLOWING : poursuite d'un point (SEEK) devant sur la ligne de course
//      (projection sur la ligne + offset "look-ahead")
//   5. ARRIVE : approche douce du stand (pit box), arrêt drapeau rouge, SC
//   6. CONTAINMENT : bornes de piste (cible clampée, force de rappel)
//  Les forces latérales sont sommées en accélérations (m/s²) puis converties en
//  angle volant : delta = atan(L * a / v²). La force longitudinale vient du
//  profil de vitesse (freinage/vitesse de virage estimés par la courbure).
// =====================================================================
import { CAR } from './constants.js';
import { steerLimit } from './vehicle.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class AIDriver {
  constructor(car, o = {}) {
    this.car = car;
    this.skill = o.skill ?? 0.97;
    this.aggr = o.aggr ?? 0.6;
    this.autopilot = !!o.autopilot;
    this.offset = 0;              // décalage latéral courant (m, + = droite)
    this.offsetTarget = 0;
    this.state = 'LIGNE';
    this.overtake = { side: 0, until: 0, lead: null };
    this.cool = 0;
    this.stuckT = 0;
    this.reaction = 0.18 + Math.random() * 0.25;
    this.launchT = 0;
    this.defendT = 0; this.defendDir = 0; this.defendCool = 0;
    this.debug = { target: null, ahead: null, avoid: 0, sep: 0, state: 'LIGNE', obstacle: null, sensors: [] };
    this.vCapReason = '';
    this.noise = (Math.random() - 0.5) * 0.02;
  }

  update(dt, ctx) {
    const car = this.car, V = car.v, tr = ctx.track, p = car.proj;
    const c = V.controls;
    const phi = V.phi, cf = Math.cos(phi), sf = Math.sin(phi);
    const u = Math.max(V.u, 0.1);
    const halfW = tr.halfW, lim = halfW - 1.5;
    const dbg = this.debug; dbg.sensors.length = 0;

    // ------------------------- état de départ ------------------------------
    if (ctx.phase === 'grid' || ctx.phase === 'lights') { c.throttle = 0; c.brake = 1; c.steer = 0; this.launchT = 0; return; }
    if (ctx.phase === 'go') { this.launchT += dt; }
    const launching = ctx.phase === 'go' && this.launchT < this.reaction;
    if (launching) { c.throttle = 0; c.brake = 1; c.steer = 0; return; }

    // ------------------------- 1. vitesse cible ----------------------------
    let vt = tr.profileAt(ctx.profile, p.s + u * 0.10) * this.skill * (1 + this.noise);
    if (this.launchT < 9) vt *= 0.93 + 0.07 * clamp(this.launchT / 9, 0, 1);
    vt = Math.min(vt, ctx.vmax);
    let reason = '';

    // ------------------------- 2. cibles latérales -------------------------
    const Ld = clamp(7 + 0.40 * u, 9, 58);
    const sT = p.s + Ld;
    let dLine = tr.lineOffsetAt(sT);
    this.state = 'LIGNE';

    // voisins : coordonnées relatives dans le repère de ma voiture
    const neigh = [];
    for (const o of ctx.cars) {
      if (o === car || o.status === 'pit' || o.status === 'dns') continue;
      const dx = o.v.x - V.x, dz = o.v.z - V.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 120) continue;
      const f = dx * cf + dz * sf, l = -dx * sf + dz * cf;
      const ovf = o.v.u * Math.cos(o.v.phi - phi) + (o.v.v || 0) * -Math.sin(o.v.phi - phi);
      const ovr = o.v.u * Math.sin(o.v.phi - phi) + (o.v.v || 0) * Math.cos(o.v.phi - phi);
      neigh.push({ o, f, l, dist, ovf, ovr, d: o.proj ? o.proj.d : 0, retired: o.status === 'retired' });
    }
    // lead : voiture la plus proche devant, dans mon couloir
    let lead = null;
    for (const n of neigh) if (n.f > 1 && n.f < 70 && Math.abs(n.l) < 5 && !n.retired) { if (!lead || n.f < lead.f) lead = n; }
    const neutral = ctx.neutral;

    // ------------------------- 3. dépassement / défense --------------------
    let blue = ctx.blueFor && ctx.blueFor.has(car.id);
    const ov = this.overtake;
    const canOvertake = neutral === 'none' && !blue && ctx.phase !== 'finish';
    if (canOvertake && lead && !lead.retired && !lead.o.isSC) {
      const gapT = lead.f / Math.max(u, 8);
      const closing = u - lead.ovf;
      const sideTaken = (sg) => neigh.some((n) => n.o !== lead.o && Math.abs(n.f) < 9 && n.l * sg > 0.4 && n.l * sg < 4.2);
      if (!ov.side && this.cool <= 0 && gapT < 1.5 && lead.f > 8 && lead.f < 34 && (closing > 0.8) && ctx.clock > 18) {
        const roomR = (lim - lead.d), roomL = (lead.d + lim);
        const kAhead = tr.curvatureAt(p.s + 120);
        const bias = Math.sign(kAhead) * 1.6;           // intérieur du prochain virage (+ = droite)
        const side = (roomR + bias) > (roomL - bias) ? 1 : -1;
        if ((side > 0 ? roomR : roomL) > 3.3 && !sideTaken(side)) { ov.side = side; ov.until = ctx.t + 7; ov.lead = lead.o; }
      }
    }
    if (ov.side) {
      const ln = neigh.find((n) => n.o === ov.lead);
      const passed = !ln || ln.f < -7 || ln.dist > 60;
      const sideBusy = neigh.some((n) => Math.abs(n.f) < 4.8 && n.l * ov.side > 0.4 && n.l * ov.side < 3.6 && n.o !== ov.lead);
      if (passed || ctx.t > ov.until || neutral !== 'none' || sideBusy) { ov.side = 0; this.cool = passed ? 0.8 : 2.5; this.offsetTarget = 0; }
      else {
        const base = ln ? ln.d : dLine;
        this.offsetTarget = clamp(base + ov.side * 3.5, -lim, lim) - dLine;
        this.state = ov.side > 0 ? 'DÉPASSE →' : '← DÉPASSE';
      }
    } else {
      this.cool -= dt;
      // défense légale : un seul mouvement par ligne droite
      const chaser = neigh.find((n) => n.f < -2 && n.f > -13 && Math.abs(n.l) < 3.2 && !n.o.isSC && !n.retired);
      this.defendCool -= dt;
      if (this.defendDir === 0 && chaser && this.defendCool <= 0 && chaser.f < -6 && Math.abs(chaser.l) > 2.2 && ctx.clock > 25 && u > 35 && Math.abs(tr.curvatureAt(p.s)) < 0.003 && neutral === 'none' && !this.autopilot) {
        this.defendDir = chaser.l > 0 ? 1 : -1; this.defendT = 4; this.defendCool = 9;
      }
      if (this.defendDir !== 0) {
        this.defendT -= dt;
        if (this.defendT <= 0 || !chaser) { this.defendDir = 0; this.offsetTarget = 0; }
        else if (Math.abs(chaser.l) < 2.4) { this.defendDir = 0; this.offsetTarget = 0; }
        else { this.offsetTarget = clamp(this.defendDir * 1.2, -4, 4); this.state = 'DÉFENSE'; }
      } else if (!ov.side) this.offsetTarget = 0;
    }
    // drapeau bleu : se pousser hors de la trajectoire
    if (blue) { this.offsetTarget = clamp((dLine > 0 ? -1 : 1) * (lim - 0.5) - dLine, -9, 9); vt *= 0.9; this.state = 'DRAPEAU BLEU'; }
    this.offset += (this.offsetTarget - this.offset) * Math.min(1, dt * 1.7);
    let dTarget = clamp(dLine + this.offset, -lim, lim);
    if (car.pit && car.pit.approach) { dTarget = lim * 0.92; this.state = 'VERS STANDS'; }

    // ------------------------- 4. PATH FOLLOWING (+ SEEK de secours) -------
    // Path following de Reynolds : on projette la position de la voiture sur le chemin
    // (ligne de course + offset), on mesure l'erreur latérale e et sa dérivée, et on
    // ajoute l'anticipation de courbure (feed-forward). Le SEEK pur (poursuite d'un
    // point devant) sert à la récupération quand on est très loin du chemin.
    const sNow = p.s, offs = this.offset;
    let dT0 = clamp(tr.lineOffsetAt(sNow) + offs, -lim, lim), dT1 = clamp(tr.lineOffsetAt(sNow + 5) + offs, -lim, lim);
    if (car.pit && car.pit.approach) { dT0 = lim * 0.92; dT1 = dT0; }
    const q1 = tr.posAt(sNow, dT0, this._q1 || (this._q1 = {})), q2 = tr.posAt(sNow + 5, dT1, this._q2 || (this._q2 = {}));
    const phiT = Math.atan2(q2.z - q1.z, q2.x - q1.x);
    const eLat = p.d - dT0;
    const vwx = V.u * cf - V.v * sf, vwz = V.u * sf + V.v * cf;
    const eDot = -vwx * Math.sin(phiT) + vwz * Math.cos(phiT);
    const kff = tr.lineKappaAt(sNow + 0.10 * u + 2);
    const W0 = clamp(0.25 + 0.032 * u, 0.5, 1.9), ZETA = 0.95;
    let aPath = u * u * kff - W0 * W0 * clamp(eLat, -9, 9) - 2 * ZETA * W0 * clamp(eDot, -16, 16);
    // cible visuelle / SEEK
    const T = tr.posAt(sT, dTarget, {});
    dbg.target = { x: T.x, z: T.z };
    const tx = T.x - V.x, tz = T.z - V.z;
    const dist = Math.hypot(tx, tz) || 1;
    const lf = tx * cf + tz * sf, lr = -tx * sf + tz * cf;
    const alpha = Math.atan2(lr, lf);
    if (Math.abs(eLat) > 7 || Math.abs(V.v) > 0.35 * u || this.state === 'RÉCUPÈRE') aPath = (2 * u * u * Math.sin(alpha)) / dist;

    // ------------------------- 5. OBSTACLE AVOIDANCE / EVADE ---------------
    const aheadLen = clamp(9 + u * 1.15, 14, 130);
    dbg.ahead = { len: aheadLen };
    let aAvoid = 0, vCap = Infinity, threat = null, minTTC = 1e9;
    const consider = (ob) => {
      const dx = ob.x - V.x, dz = ob.z - V.z;
      const f = dx * cf + dz * sf, l = -dx * sf + dz * cf;
      if (f < -1.5 || f > aheadLen + ob.r) return;
      const ovf = ob.vx !== undefined ? ob.vx * cf + ob.vz * sf : (ob.vf || 0);
      const ovr = ob.vx !== undefined ? -ob.vx * sf + ob.vz * cf : (ob.vr || 0);
      ob = { ...ob, vf: ovf, vr: ovr };
      const rvf = Math.max(u - ovf, 1.5);
      const t = Math.max(f, 0.1) / rvf;
      const lp = l + ovr * (Math.min(t, 3.5)) ;             // EVADE : position prédite
      const safe = ob.r + 1.05 + (ob.margin ?? 0.7);
      dbg.sensors.push({ x: ob.x, z: ob.z, r: ob.r, hit: Math.abs(lp) < safe });
      if (Math.abs(lp) >= safe) return;
      if (t < minTTC) { minTTC = t; threat = { ob, f, lp, rvf, safe, t }; }
    };
    for (const ob of ctx.obstacles) consider(ob);
    for (const n of neigh) {
      if (n.o.isSC) continue;
      if (n.f > 0 && n.f < aheadLen && (n.retired || (ov.side === 0 && Math.abs(n.l) < 1.7 && n.ovf < 6))) {
        consider({ x: n.o.v.x, z: n.o.v.z, r: 1.15, vf: n.ovf, vr: n.ovr, margin: n.retired ? 0.9 : 0.3 });
      }
    }
    if (threat) {
      const { ob, f, lp, rvf, safe } = threat;
      const need = safe - Math.abs(lp);
      let side;
      if (Math.abs(lp) > 0.45) side = -Math.sign(lp);
      else { const d0 = p.d; side = (lim - d0) > (d0 + lim) ? 1 : -1; }
      // l'obstacle est-il hors piste d'un côté ? (containment)
      const dDest = p.d + side * (need + 0.4);
      if (Math.abs(dDest) > lim + 0.8) side = -side;
      const aReq = (2 * need * rvf * rvf) / Math.max(f * f, 4);
      aAvoid = side * clamp(aReq, 0, 34);
      this.state = ob.kind === 'lizard' ? 'ÉVITE LÉZARD' : 'ÉVITEMENT';
      dbg.obstacle = { x: ob.x, z: ob.z, side };
      // si impossible de s'écarter à temps : freiner (vitesse sûre)
      if (aReq > 26 || threat.t < 0.9) {
        const dec = 36;
        vCap = Math.min(vCap, Math.max((ob.vf || 0) + 2, Math.sqrt(2 * dec * Math.max(f - ob.r - 3, 0)) + (ob.vf || 0)));
        reason = 'obstacle';
      }
    } else dbg.obstacle = null;

    // ------------------------- 6. SEPARATION (côte à côte) -----------------
    let aSep = 0;
    let blockR = false, blockL = false;
    for (const n of neigh) {
      if (n.o.isSC || n.retired) continue;
      if (Math.abs(n.f) < 5.2 && Math.abs(n.l) < 3.6) {
        const w = Math.pow(Math.max(0, (4.2 - Math.abs(n.l)) / 4.2), 2);
        aSep += -Math.sign(n.l || 0.01) * 20 * w;
        if (n.l > 0.3) blockR = true; else if (n.l < -0.3) blockL = true;
      }
    }
    aSep = clamp(aSep, -16, 16);
    dbg.avoid = aAvoid; dbg.sep = aSep;

    // ------------------------- 7. CONTAINMENT ------------------------------
    let aCont = 0;
    if (p.d > halfW - 0.9) aCont = -clamp((p.d - (halfW - 0.9)) * 6, 0, 14);
    else if (p.d < -(halfW - 0.9)) aCont = clamp((-(halfW - 0.9) - p.d) * 6, 0, 14);
    // la force d'évitement a priorité absolue ; sinon somme pondérée
    let aTot = threat && Math.abs(aAvoid) > 6 ? aAvoid * 1.0 + 0.5 * aSep + 0.3 * aPath : aPath + aAvoid + 0.9 * aSep + aCont;
    if (aTot > 0 && blockR) aTot *= 0.25;
    if (aTot < 0 && blockL) aTot *= 0.25;
    const aMax = V.muNow * (9.81 + (0.5 * 1.2 * CAR.ClA * u * u) / V.mass) * 0.95;
    aTot = clamp(aTot, -aMax, aMax);

    // ------------------------- 8. longitudinal -----------------------------
    // suivi du véhicule devant (ARRIVE derrière lui) quand on ne dépasse pas
    if (lead && !(ov.side && Math.abs(lead.l) > 2.4)) {
      const gapDes = (neutral === 'sc' ? 9 : 7) + u * (ctx.clock < 25 ? 0.2 : 0.14);
      const capF = lead.ovf + (lead.f - gapDes) * (neutral === 'sc' ? 0.7 : 0.9);
      if (capF < vt) { vCap = Math.min(vCap, Math.max(capF, 0)); reason = reason || 'suivi'; }
    }
    if (neutral === 'vsc') { vt *= 0.56; reason = 'VSC'; }
    else if (neutral === 'sc') { vt = Math.min(vt * 0.62, ctx.scSpeed + 12); reason = 'SC'; }
    else if (neutral === 'red') { vt = 0; reason = 'DRAPEAU ROUGE'; }
    else if (ctx.yellowAt && ctx.yellowAt(p.s + u * 1.5)) { vt *= 0.7; reason = reason || 'JAUNE'; }
    if (ctx.phase === 'finish' || car.finished) { vt = Math.min(vt * 0.6, 55); }
    // récupération : voiture très hors piste ou en perdition
    const off = Math.abs(p.d) > halfW + 5;
    const spin = Math.abs(V.v) > 0.55 * u && u > 6;
    if (off || spin) { vt = Math.min(vt, 26); this.state = 'RÉCUPÈRE'; }
    vt = Math.min(vt, vCap);
    this.vTarget = vt;
    this.vCapReason = reason;

    // erreur latérale : ralentir si on est loin de la trajectoire voulue
    const latErr = Math.abs(p.d - dTarget);
    if (latErr > 2.5 && this.state === 'LIGNE') vt *= clamp(1 - 0.045 * (latErr - 2.5), 0.62, 1);
    const err = vt - V.u;
    let thr = 0, brk = 0;
    if (err > 0.6) thr = clamp(err / 4, 0.0, 1);
    else if (err > -0.8) thr = clamp(0.25 + err * 0.2, 0, 0.35);
    else brk = clamp((-err - 0.4) / 2.2, 0, 1);
    // si on glisse fort : lever le pied
    if (V.sliding && Math.abs(V.v) > 3) thr *= 0.3;
    // boost énergie (IA : sur les lignes droites)
    c.boost = V.battery > 0.8 && Math.abs(tr.curvatureAt(p.s + 40)) < 0.0015 && err > 2 && neutral === 'none';
    // cercle de friction : l'accélération disponible diminue avec l'appui latéral demandé
    {
      const aLat = Math.max(Math.abs(u * V.r), Math.abs(aTot));
      const aLong = Math.sqrt(Math.max(0, Math.pow(aMax * 0.92, 2) - aLat * aLat));
      const aFull = (CAR.power / (V.mass * Math.max(u, 8))) * 0.85;
      thr = Math.min(thr, clamp(aLong / Math.max(aFull, 1), 0, 1));
    }
    // cercle de friction : moins de frein quand l'appui latéral est déjà sollicité
    const latFrac = clamp(Math.abs(aTot) / Math.max(aMax, 1), 0, 1);
    brk *= 1 - 0.55 * latFrac * latFrac;
    if (Math.abs(V.v) > 0.12 * Math.max(u, 8)) brk *= 0.4;
    c.throttle = thr; c.brake = brk;

    // ------------------------- 9. volant -----------------------------------
    const dCmd = Math.atan((CAR.wheelbase * aTot) / Math.max(u * u, 18));
    const rDes = aTot / Math.max(u, 5);
    const beta = Math.atan2(V.v, Math.max(u, 5));
    const gS = clamp((u - 14) / 22, 0, 1);
    const dTot = dCmd + (0.10 + 0.12 * gS) * (rDes - V.r) + 0.9 * gS * beta;
    c.steer = clamp(dTot / steerLimit(u), -1, 1);
    dbg.state = this.state;
    c.aeroAuto = true;
  }
}
