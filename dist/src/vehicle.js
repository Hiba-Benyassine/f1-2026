// =====================================================================
//  VEHICLE : modèle bicyclette (u avant, v droite, r lacet) à pas fixe.
//  Adhérence = pneu x météo x usure x température x surface, cercle de friction,
//  appui aéro (u²), traînée, boîte 7 rapports, énergie (ERS) simplifiée.
// =====================================================================
import { CAR, G, RHO, GEARS, RPM_MIN, RPM_MAX } from './constants.js';
import { TYRES, wetGrip } from './data.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function steerLimit(u) { return Math.max(0.035, CAR.maxSteer / (1 + (u / 30) * (u / 30))); }

export class Vehicle {
  constructor(o = {}) {
    this.x = 0; this.z = 0; this.phi = 0; this.u = 0; this.v = 0; this.r = 0;
    this.steer = 0;          // angle des roues (rad), + = droite
    this.controls = { steer: 0, throttle: 0, brake: 0, boost: false };
    this.gear = 1; this.rpm = 4500; this.shiftT = 0; this.lastGear = 1;
    this.battery = CAR.ersCapacity * 0.75; this.deploying = false;
    this.tyre = { compound: o.compound || 'M', wear: 0, temp: 72 };
    this.fuel = o.fuel ?? 40;
    this.damage = 0;
    this.assist = { stability: 0, tc: 0 };
    this.aero = 0;            // 0 = mode virage (appui), 1 = ligne droite
    this.aeroMode = 'corner';
    this.speed = 0; this.ax = 0; this.ay = 0; this.slipLoad = 0;
    this.wheelSpin = 0; this.surfType = 'track'; this.kerbT = 0; this.heave = 0; this.pitch = 0; this.roll = 0;
    this.muNow = 1; this.gripFactor = 1; this.sliding = false; this.braking = false;
    this.mass = CAR.mass + this.fuel;
    this._axPrev = 0;
    this.noPower = false;
  }
  place(x, z, phi) { this.x = x; this.z = z; this.phi = phi; this.u = 0; this.v = 0; this.r = 0; this.steer = 0; }
  setSpeed(u) { this.u = u; this.v = 0; this.r = 0; }

  /** facteur d'adhérence du pneu hors surface */
  tyreFactor(wetness) {
    const t = TYRES[this.tyre.compound];
    const w = this.tyre.wear;
    const wearF = 1 - 0.30 * Math.pow(w / 100, 1.4) - (w > 70 ? 0.22 * (w - 70) / 30 : 0);
    const dT = Math.abs(this.tyre.temp - t.optT) / 22;
    const tempF = 1 - 0.11 * Math.pow(Math.min(dT, 2.2), 1.25);
    return t.grip * wetGrip(this.tyre.compound, wetness) * wearF * tempF;
  }
  changeTyres(compound) { this.tyre.compound = compound; this.tyre.wear = 0; this.tyre.temp = 62; }

  update(dt, env) {
    const c = this.controls;
    const surf = env.surface || { grip: 1, drag: 0, type: 'track' };
    this.surfType = surf.type;
    const u = this.u, v = this.v, r = this.r;
    const sp = Math.hypot(u, v);
    const mass = CAR.mass + this.fuel; this.mass = mass;

    // ---- aéro (mode auto : ligne droite / virage) -------------------------
    const straight = c.throttle > 0.85 && Math.abs(this.steer) < 0.035 && c.brake < 0.05 && u > 48;
    this.aero += ((straight ? 1 : 0) - this.aero) * Math.min(1, dt * 3.5);
    this.aeroMode = this.aero > 0.5 ? 'straight' : 'corner';
    const dmg = 1 - 0.35 * (this.damage / 100);
    const ClA = (CAR.ClA + (CAR.ClAStraight - CAR.ClA) * this.aero) * dmg;
    const CdA = CAR.CdA + (CAR.CdAStraight - CAR.CdA) * this.aero;
    const q = 0.5 * RHO;
    const down = q * ClA * u * u;
    const drag = q * CdA * sp * sp;

    // ---- adhérence --------------------------------------------------------
    const tf = this.tyreFactor(env.wetness || 0);
    this.gripFactor = tf;
    const mu = CAR.mu0 * tf * surf.grip;
    this.muNow = mu;
    // transfert de charge longitudinal (ax lissé)
    const dFz = clamp(mass * this._axPrev * 0.30 / CAR.wheelbase, -3500, 3500);
    const FzF = Math.max(500, mass * G * (CAR.b / CAR.wheelbase) + down * 0.42 - dFz);
    const FzR = Math.max(500, mass * G * (CAR.a / CAR.wheelbase) + down * 0.58 + dFz);
    const availF = mu * FzF, availR = mu * FzR;

    // ---- direction ---------------------------------------------------------
    const lim = steerLimit(u);
    let target = clamp(c.steer, -1, 1) * lim;
    if (this.assist.stability > 0) {   // limiteur de glissement avant : jamais au-delà du pic d'adhérence
      const bf = Math.atan2(v + CAR.a * r, Math.max(u, 3));
      const l2 = 0.115 + 0.07 * (1 - this.assist.stability);
      const lo = Math.max(-lim, bf - l2), hi = Math.min(lim, bf + l2);
      if (lo <= hi) target = clamp(target, lo, hi);
    }
    this.steer += (target - this.steer) * Math.min(1, dt * 9);
    const delta = this.steer;

    // ---- moteur / frein ----------------------------------------------------
    let P = CAR.power * (this.noPower ? 0 : 1);
    this.deploying = false;
    if (c.boost && this.battery > 0.02 && c.throttle > 0.3 && u > 8 && !this.noPower) { P += CAR.ersPower; this.battery = Math.max(0, this.battery - (CAR.ersPower * dt) / 1e6); this.deploying = true; }
    let Fdrive = c.throttle * Math.min(P / Math.max(u, 6), 42000);
    const vmax = env.vmax || 94;
    Fdrive *= clamp((vmax - u) / 4, 0, 1);
    if (this.assist.stability > 0) {   // contrôle de traction : la poussée ne dépasse pas le cercle de friction arrière
      const latUse = Math.min(1, Math.abs(Math.atan2(v - CAR.b * r, Math.max(u, 3))) / 0.12);
      Fdrive = Math.min(Fdrive, availR * (0.9 - 0.55 * latUse) * (0.85 + 0.15 * (1 - this.assist.stability)));
    }
    if (u < 0) Fdrive = 0;
    const brakeTotal = c.brake * (mu * (mass * G + down)) * 0.985;
    const bf = clamp(FzF / (FzF + FzR) + 0.035, 0.38, 0.8);   // répartition suivant la charge dynamique (type EBD)
    let Fxf = -brakeTotal * bf;
    let Fxr = Fdrive - brakeTotal * (1 - bf);
    if (c.throttle < 0.05 && c.brake < 0.05 && u > 3) Fxr -= 1100 + 0.0014 * u * u * mass * 0.1; // frein moteur + récupération
    // cercle de friction
    const Fxf_c = clamp(Fxf, -availF, availF), Fxr_c = clamp(Fxr, -availR, availR);
    this.braking = c.brake > 0.2 && u > 5;
    const capF = Math.sqrt(Math.max(availF * availF - Fxf_c * Fxf_c, (0.18 * availF) ** 2));
    const capR = Math.sqrt(Math.max(availR * availR - Fxr_c * Fxr_c, (0.18 * availR) ** 2));
    // (traction control : réduit la poussée si le cercle est saturé)
    // ---- glissements -------------------------------------------------------
    const ue = Math.max(u, 3);
    const af = Math.atan2(v + CAR.a * r, ue) - delta;
    const ar = Math.atan2(v - CAR.b * r, ue);
    const sat = (a, k) => Math.sin(1.5 * Math.atan(k * a));
    const low = smooth(0.2, 4.5, Math.max(u, 0));
    let Fyf = -capF * sat(af, 12.0) * low;
    let Fyr = -capR * sat(ar, 12.5 + 2 * this.assist.stability) * low * (1 + 0.08 * this.assist.stability);
    // amortissement latéral à très basse vitesse
    Fyf -= 0.35 * mass * v * (1 - low) * 0.5; Fyr -= 0.35 * mass * v * (1 - low) * 0.5;
    this.sliding = Math.abs(ar) > 0.13 || Math.abs(af) > 0.13;

    // ---- résistances -------------------------------------------------------
    const roll = (0.012 + surf.drag) * mass * G;
    const dragX = sp > 0.01 ? drag * (u / sp) : 0, dragY = sp > 0.01 ? drag * (v / sp) : 0;
    const rollX = u > 0.2 ? roll : u < -0.2 ? -roll : 0;

    // ---- dynamique ---------------------------------------------------------
    const cosd = Math.cos(delta), sind = Math.sin(delta);
    const FxB = Fxf_c * cosd - Fyf * sind + Fxr_c - dragX - rollX;
    const FyB = Fyf * cosd + Fxf_c * sind + Fyr - dragY - 0.5 * roll * Math.sign(v) * Math.min(1, Math.abs(v));
    const du = FxB / mass + r * v;
    const dv = FyB / mass - r * u;
    let dr = (CAR.a * (Fyf * cosd + Fxf_c * sind) - CAR.b * Fyr) / CAR.Iz;
    dr -= r * 0.35 * (1 - low * 0.6) + this.assist.stability * r * 0.5;
    this.u += du * dt; this.v += dv * dt; this.r += dr * dt;
    if (this.u < 0) { this.u = 0; }
    const cp = Math.cos(this.phi), sphi = Math.sin(this.phi);
    this.x += (this.u * cp - this.v * sphi) * dt;
    this.z += (this.u * sphi + this.v * cp) * dt;
    this.phi += this.r * dt;
    if (!isFinite(this.u + this.v + this.r + this.x + this.z)) { this.u = 0; this.v = 0; this.r = 0; this.x = isFinite(this.x) ? this.x : 0; this.z = isFinite(this.z) ? this.z : 0; }
    this.speed = Math.hypot(this.u, this.v);
    const axNow = FxB / mass;
    this._axPrev += (axNow - this._axPrev) * Math.min(1, dt * 8);
    this.ax = axNow / G; this.ay = (FyB / mass + 0 * u * r) / G;
    this.ayCentri = (u * r) / G;

    // ---- boîte de vitesses -------------------------------------------------
    let g = this.gear;
    if (g < 7 && u > GEARS[g] * 0.965) g++;
    else if (g > 1 && u < GEARS[g - 1] * 0.84) g--;
    if (g !== this.gear) { this.lastGear = this.gear; this.gear = g; this.shiftT = 0.18; }
    this.shiftT = Math.max(0, this.shiftT - dt);
    const lo = GEARS[g - 1] * 0.88, hi = GEARS[g];
    let rpmT = RPM_MIN + (RPM_MAX - RPM_MIN) * clamp((u - lo) / (hi - lo), 0, 1);
    if (u < 6) rpmT = 4300 + c.throttle * 6500 + u * 250;
    if (this.shiftT > 0) rpmT -= 900;
    if (u >= vmax - 1) rpmT = Math.min(rpmT, 14500);
    this.rpm += (rpmT - this.rpm) * Math.min(1, dt * 14);

    // ---- énergie / pneus / carburant --------------------------------------
    const brakePower = brakeTotal * Math.max(u, 0);
    if (c.brake > 0.05) this.battery = Math.min(CAR.ersCapacity, this.battery + Math.min(brakePower * 0.30, 350e3) * dt / 1e6);
    else if (c.throttle < 0.1 && u > 35) this.battery = Math.min(CAR.ersCapacity, this.battery + 0.05 * dt);
    const slipLoad = clamp((Math.abs(Fyf) + Math.abs(Fyr) + Math.abs(Fxr_c) * 0.7 + Math.abs(Fxf_c) * 0.7) / Math.max(1, mu * (FzF + FzR)) * 0.62, 0, 1.6);
    this.slipLoad = slipLoad;
    const T = TYRES[this.tyre.compound];
    const wetMul = (env.wetness || 0) > 0.15 && 'SMH'.includes(this.tyre.compound) ? 0.8 : 1;
    this.tyre.wear = Math.min(100, this.tyre.wear + 1.6 * T.wear * Math.pow(slipLoad, 1.5) * wetMul * dt * (env.wearMul || 1));
    const amb = env.ambient ?? 28;
    this.tyre.temp += (17 * slipLoad - 0.12 * (this.tyre.temp - amb)) * dt;
    this.fuel = Math.max(0, this.fuel - (CAR.fuelPerLap / 40) * (c.throttle * 0.7 + 0.3) * dt * 0.8);

    // ---- visuel : roues, suspension ---------------------------------------
    this.wheelSpin += (u / CAR.wheelR) * dt;
    const kerb = surf.type === 'kerb' && u > 8;
    this.kerbT += dt * (kerb ? 1 : 0);
    const heaveT = kerb ? Math.sin(this.kerbT * 90) * 0.012 * Math.min(1, u / 40) : 0;
    this.heave += (heaveT - this.heave) * Math.min(1, dt * 40);
    this.pitch += ((-this._axPrev / G) * 0.025 - this.pitch) * Math.min(1, dt * 6);
    this.roll += ((this.ayCentri) * 0.03 - this.roll) * Math.min(1, dt * 6);
  }
}
