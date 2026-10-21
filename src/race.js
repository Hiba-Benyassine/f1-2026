// =====================================================================
//  RACE : logique complète d'une course (sans rendu, testable en Node)
//  grille -> 5 feux -> départ -> course -> arrivée -> classement
//  checkpoints ordonnés, tours valides, secteurs, pénalités, stands,
//  météo, drapeaux, VSC / Safety Car / drapeau rouge, obstacles (lézard…)
// =====================================================================
import { Vehicle, steerLimit } from './vehicle.js';
import { AIDriver } from './ai.js';
import { CAR, PIT_LIMIT, TRACK_CFG, G } from './constants.js';
import { DRIVERS, TEAMS, TYRES, POINTS, driverById, FASTEST_LAP_POINT } from './data.js';
import { mulberry32 } from './track.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const TAU = Math.PI * 2;
const wrapAng = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

const DIFF = { easy: { skill: 0.915, aggr: 0.35 }, medium: { skill: 0.955, aggr: 0.6 }, hard: { skill: 0.99, aggr: 0.85 } };

export class Race {
  constructor(cfg) {
    this.cfg = cfg;
    this.track = cfg.track;
    this.laps = cfg.laps || 3;
    this.rnd = mulberry32((cfg.seed || 1) * 7 + 13);
    this.t = 0; this.clock = 0;
    this.phase = 'grid';     // grid | lights | go | racing | finish | results
    this.phaseT = 0;
    this.neutral = 'none';   // none | vsc | sc | sc_in | red
    this.neutralT = 0;
    this.listeners = {};
    this.cars = [];
    this.obstacles = [];     // débris / lézard (hors voitures)
    this.events = [];        // journal
    this.radioCool = 0;
    this.lights = 0; this.lightsOutAt = 0; this.jumpStart = false;
    this.sc = null;
    this.wet = { rain: 0, wetness: 0, wetness0: 0 };
    this.profileCache = new Map();
    this.sectorFlags = [null, null, null];
    this.blueFor = new Set();
    this.fastest = { t: 1e9, car: null };
    this.finishedCount = 0; this.leaderFinishClock = null;
    this.lizardTimer = 14 + this.rnd() * 10;
    this.pitExitLight = 'green';
    this.playerInput = { steer: 0, throttle: 0, brake: 0, boost: false };
    this.autoAssist = cfg.assists === 'full' ? 2 : cfg.assists === 'none' ? 0 : 1;
    this.resultsData = null;
    this.step60 = 0;
    this.debug = false;
    this.vmax = (cfg.vmax || 340) / 3.6;
    this.vscSpeedWarn = 0;
    this._setupWeather();
    this._setupGrid();
  }

  on(n, f) { (this.listeners[n] ||= []).push(f); }
  emit(n, d) { (this.listeners[n] || []).forEach((f) => f(d)); }
  log(type, text, car) { this.events.push({ t: this.clock, type, text, car: car ? car.id : null }); this.emit('log', { type, text, car }); }
  radio(key, force = false) { if (!force && this.radioCool > 0) return; this.radioCool = 5; this.emit('radio', key); }

  // ------------------------------------------------------------------ setup
  _setupWeather() {
    const w = this.cfg.weather;
    if (w === 'wet') { this.wet.rain = 0.75; this.wet.wetness = 0.82; }
    else if (w === 'variable') { this.wet.rain = 0; this.wet.wetness = 0; this.rainOnAt = this.laps * 38 * 0.28; this.rainOffAt = this.laps * 38 * 0.78; }
    this.wet.wetness0 = this.wet.wetness;
  }

  _setupGrid() {
    const cfg = this.cfg, tr = this.track;
    const ids = [];
    const player = driverById(cfg.playerId);
    const ai = cfg.mode === 'timetrial' ? [] : (cfg.aiIds || []).slice(0, cfg.aiCount ?? 12);
    const diff = DIFF[cfg.difficulty || 'medium'];
    // ordre de grille : IA triée par talent + bruit ; joueur inséré selon choix
    const order = ai.map((id) => ({ id, k: -driverById(id).skill + (this.rnd() - 0.5) * 0.05 })).sort((a, b) => a.k - b.k).map((o) => o.id);
    let slot = cfg.gridPos === 'pole' ? 0 : cfg.gridPos === 'back' ? order.length : Math.min(Math.floor(order.length / 2), order.length);
    if (cfg.mode === 'timetrial') slot = 0;
    order.splice(slot, 0, player.id);
    const teamIdx = {}; let tcount = 0;
    order.forEach((id, k) => {
      const d = driverById(id), isPlayer = id === player.id;
      if (!(d.team in teamIdx)) teamIdx[d.team] = tcount++;
      const g = tr.grid[k];
      const V = new Vehicle({ compound: cfg.startTyre || 'M', fuel: 14 + this.laps * CAR.fuelPerLap });
      V.place(g.x, g.z, g.phi);
      V.assist.stability = isPlayer ? [0, 0.6, 1][this.autoAssist] : 0.5;
      const car = {
        id: d.id, driver: d, team: TEAMS[d.team], teamId: d.team, isPlayer, v: V, proj: {}, status: 'grid', grid: k + 1,
        dist: g.rel, lastS: g.s, nextGate: 0, lapsDone: 0, lapStart: 0, lapTimes: [], lapValid: [], curValid: true, best: 1e9, last: null,
        sectors: [null, null, null], bestSectors: [1e9, 1e9, 1e9], sectorStart: 0,
        penalties: [], penaltySec: 0, strikes: 0, offT: 0, offActive: false, pos: k + 1, lastPos: k + 1,
        pit: { request: false, tyre: null, phase: null, idx: 0, boxIdx: 0, t: 0, dur: 0, stops: 0, appliedTyre: false, light: 'red', stopTime: 0, approach: false, boxK: 0, lastStop: 0 },
        finished: false, finishClock: 0, finishLaps: 0, dsq: false, retT: 0, damageEvents: 0, hitCool: 0,
        crew: 0.92 + ((d.number * 37) % 40) / 100, topSpeed: 0, overtakes: 0, startPos: k + 1, stuckT: 0,
        stopPlan: [], flagsSeen: {},
      };
      car.pit.boxK = teamIdx[d.team] * 2 + (car.id === order.filter((o) => driverById(o).team === d.team)[0] ? 0 : 1);
      car.pit.boxK = Math.min(car.pit.boxK, tr.pitBoxes.length - 1);
      car.proj = {}; tr.project(V.x, V.z, 0, car.proj);
      // IA : pilote et profil
      const skill = d.skill * diff.skill / 0.97 * (isPlayer ? 0.965 : 1) * (0.985 + this.rnd() * 0.03);
      car.ai = new AIDriver(car, { skill: clamp(skill, 0.8, 1.01), aggr: diff.aggr, autopilot: isPlayer });
      // stratégie arrêt (IA)
      if (!isPlayer && this.laps >= 3 && cfg.aiPit !== false && this.rnd() < 0.55) car.stopPlan.push(1 + Math.floor(this.rnd() * (this.laps - 2)));
      this.cars.push(car);
    });
    this.player = this.cars.find((c) => c.isPlayer);
    this.driveAuto = cfg.drive === 'auto';
  }

  // -------------------------------------------------------- profils vitesse
  getProfile(muScale) {
    const key = Math.round(muScale * 40);
    let p = this.profileCache.get(key + '_' + Math.round(this.vmax));
    if (!p) { p = this.track.speedProfile({ muScale: key / 40, vmax: this.vmax }); this.profileCache.set(key + '_' + Math.round(this.vmax), p); }
    return p;
  }
  setVmax(kmh) { this.vmax = kmh / 3.6; this.profileCache.clear(); }

  // ------------------------------------------------------------- commandes
  startSequence() { if (this.phase === 'grid') { this.phase = 'lights'; this.phaseT = 0; this.lights = 0; this.jumpStart = false; this.lightsHold = (0.8 + this.rnd() * 2.0) * (this.cfg.startDelay ?? 1); this.radio('push', true); } }
  requestPit(tyre) {
    const c = this.player; if (c.status !== 'racing' || c.finished) return false;
    c.pit.request = !c.pit.request; if (tyre) c.pit.tyre = tyre;
    if (c.pit.request) { this.radio('boxbox', true); this.log('pit', `${c.driver.code} : demande d'arrêt`, c); } else this.radio('stayout', true);
    return c.pit.request;
  }
  setNextTyre(t) { this.player.pit.tyre = t; }

  scenario(name) {
    const lead = this.sortedCars()[0];
    switch (name) {
      case 'yellow': { const c = this.cars.find((x) => x !== this.player && x.status === 'racing'); if (c) this.retire(c, 'incident (scénario)'); break; }
      case 'vsc': this.startNeutral('vsc'); break;
      case 'sc': this.startNeutral('sc'); break;
      case 'red': this.startNeutral('red'); break;
      case 'resume': this.resumeRace(); break;
      case 'lizard': this.spawnLizard(lead); break;
      case 'debris': this.spawnDebris(lead); break;
      case 'rain': this.wet.rain = 0.8; this.cfg.weather = 'wet-forced'; this.radio('rain', true); break;
      case 'dry': this.wet.rain = 0; break;
      case 'finallap': this.cars.forEach((c) => { if (c.status !== 'retired') { c.dist = Math.max(c.dist, (this.laps - 1) * this.track.L + 5); c.nextGate = Math.max(c.nextGate, (this.laps - 1) * 3); c.lapsDone = Math.max(c.lapsDone, this.laps - 1); } }); break;
      case 'damage': this.player.v.damage = 70; this.radio('damage', true); break;
      case 'abort': this.abortStart(); break;
      case 'blue': break;
    }
  }

  abortStart() {
    if (this.phase !== 'lights' && this.phase !== 'go') return;
    this.cars.forEach((c, k) => { const g = this.track.grid[k]; c.v.place(g.x, g.z, g.phi); c.v.controls.throttle = 0; c.v.controls.brake = 1; c.dist = g.rel; c.lastS = g.s; c.nextGate = 0; c.lapsDone = 0; c.status = 'grid'; });
    this.phase = 'grid'; this.phaseT = -2; this.lights = 0; this.log('info', 'DÉPART AVORTÉ — retour sur la grille');
    this.emit('aborted', {});
  }

  // -------------------------------------------------------- neutralisations
  startNeutral(kind) {
    if (this.phase !== 'racing' && this.phase !== 'go') return;
    if (this.neutral !== 'none') { if (kind === 'red') { this.neutral = 'red'; this.neutralT = 0; this.emit('flag', 'red'); this.radio('red', true); } return; }
    this.neutral = kind; this.neutralT = 0; this.neutralLaps = 0;
    if (kind === 'sc') {
      const lead = this.sortedCars().find((c) => c.status === 'racing');
      const s0 = this.track.wrapS((lead ? lead.proj.s : 0) + 45);
      this.sc = { isSC: true, id: 'SC', s: s0, v: { x: 0, z: 0, phi: 0, u: 30, v: 0 }, proj: { s: s0, d: 0 }, status: 'racing', dist: (lead ? lead.dist : 0) + 45, speed: 30, laps0: lead ? lead.dist : 0 };
      this._syncSC();
      this.radio('safety', true); this.log('flag', 'SAFETY CAR DÉPLOYÉE');
    } else if (kind === 'vsc') { this.radio('vsc', true); this.log('flag', 'VIRTUAL SAFETY CAR'); }
    else if (kind === 'red') { this.radio('red', true); this.log('flag', 'DRAPEAU ROUGE'); }
    this.emit('neutral', kind);
  }
  endNeutral() {
    if (this.neutral === 'sc') { this.neutral = 'sc_in'; this.log('flag', 'SC rentre aux stands ce tour'); this.emit('neutral', 'sc_in'); return; }
    this.neutral = 'none'; this.sc = null; this.radio('green', true); this.log('flag', 'PISTE LIBRE (GREEN)'); this.emit('neutral', 'none');
    this.cars.forEach((c) => { if (c.status === 'retired') this.removeCar(c); });
  }
  resumeRace() {
    if (this.neutral !== 'red') return;
    this.phase = 'lights'; this.phaseT = 0; this.lights = 0; this.lightsHold = 1.2; this.restarting = true; this.emit('neutral', 'restart');
  }
  _syncSC() {
    const sc = this.sc, tr = this.track; const p = tr.posAt(sc.s, tr.lineOffsetAt(sc.s), {});
    sc.v.x = p.x; sc.v.z = p.z; sc.v.phi = p.phi; sc.v.u = sc.speed; sc.proj.s = tr.wrapS(sc.s); sc.proj.d = tr.lineOffsetAt(sc.s);
  }

  retire(car, why) {
    if (car.status === 'retired') return;
    car.status = 'retired'; car.retT = 0; car.v.noPower = true; car.v.controls.throttle = 0; car.v.controls.brake = 0.1; car.pit.request = false;
    this.log('retire', `${car.driver.code} abandonne (${why})`, car);
    this.emit('retire', car);
    if (this.cfg.incidents !== false && this.neutral === 'none' && this.phase === 'racing') {
      this.startNeutral(this.rnd() < 0.55 ? 'sc' : 'vsc');
    }
  }
  removeCar(car) { car.status = 'removed'; car.v.u = 0; this.emit('removed', car); }

  // ----------------------------------------------------------------- obstacles
  spawnLizard(ref) {
    const tr = this.track; const lead = ref || this.sortedCars()[0];
    const s = tr.wrapS((lead ? lead.proj.s : 0) + 140 + this.rnd() * 160 + (lead ? lead.v.u * 0.8 : 0));
    const side = this.rnd() < 0.5 ? -1 : 1; const hw = tr.halfW;
    const a = tr.posAt(s, side * (hw + 3.5), {}), b = tr.posAt(s, -side * (hw + 3.5), {});
    const T = (hw * 2 + 7) / 5.2;
    const lz = { kind: 'lizard', x: a.x, z: a.z, vx: (b.x - a.x) / T, vz: (b.z - a.z) / T, r: 0.7, life: T + 0.4, t: 0, s, hit: false, heading: Math.atan2(b.z - a.z, b.x - a.x), id: Math.random() };
    this.obstacles.push(lz); this.emit('lizard', lz); this.log('hazard', 'Un lézard traverse la piste !'); this.radio('lizard');
  }
  spawnDebris(ref, at) {
    const tr = this.track; const lead = ref || this.sortedCars()[0];
    const s = at ?? tr.wrapS((lead ? lead.proj.s : 0) + 180 + this.rnd() * 120);
    const d = (this.rnd() - 0.5) * tr.halfW * 1.1; const p = tr.posAt(s, d, {});
    const ob = { kind: 'debris', x: p.x, z: p.z, r: 0.9, vx: 0, vz: 0, life: 45, t: 0, s, id: Math.random() };
    this.obstacles.push(ob); this.emit('debris', ob); this.log('hazard', 'Débris sur la piste');
  }

  // ----------------------------------------------------------------- classement
  sortedCars() {
    return this.cars.filter((c) => c.status !== 'removed').slice().sort((a, b) => this._rank(b) - this._rank(a) || a.grid - b.grid);
  }
  _rank(c) {
    if (c.finished) return 1e9 - c.finishOrder * 1000 + 0;
    if (c.status === 'retired' || c.status === 'dsq') return c.dist - 1e5;
    return c.dist;
  }
  updatePositions() {
    const s = this.sortedCars(); s.forEach((c, i) => { c.lastPos = c.pos; c.pos = i + 1; });
    s.forEach((c, i) => {
      if (c.lastPos !== c.pos && this.phase === 'racing') { if (c.pos < c.lastPos) c.overtakes++; }
    });
    return s;
  }
  gapAhead(c) {
    const s = this.sortedCars(), i = s.indexOf(c); if (i <= 0) return null;
    const a = s[i - 1]; return (a.dist - c.dist) / Math.max(c.v.u, 25);
  }
  gapBehind(c) {
    const s = this.sortedCars(), i = s.indexOf(c); if (i < 0 || i >= s.length - 1) return null;
    const b = s[i + 1]; return (c.dist - b.dist) / Math.max(b.v.u, 25);
  }

  // ====================================================================== STEP
  step(dt) {
    this.t += dt; this.phaseT += dt;
    if (this.radioCool > 0) this.radioCool -= dt;
    const tr = this.track;
    // ---- phases -----------------------------------------------------
    if (this.phase === 'lights') {
      const k = Math.min(5, Math.floor(this.phaseT / 1.0) + 1);
      if (k !== this.lights && this.phaseT >= 0) { this.lights = k; this.emit('light', k); }
      if (this.lights >= 5 && this.phaseT >= 5 + this.lightsHold) {
        this.lights = 0; this.phase = 'go'; this.phaseT = 0; this.emit('lightsout', {});
        if (this.restarting) { this.neutral = 'none'; this.restarting = false; this.sc = null; this.radio('green', true); }
        this.cars.forEach((c) => { if (c.status === 'grid') c.status = 'racing'; });
        if (this.jumpStart) this.addPenalty(this.player, 5, 'Faux départ');
      }
      // détection de faux départ (joueur)
      if (this.phase === 'lights' && this.player && !this.restarting) {
        const g = tr.grid[this.player.grid - 1], V = this.player.v;
        const moved = Math.hypot(V.x - g.x, V.z - g.z);
        if (!this.jumpStart && (moved > 1.0 || V.u > 1.5) && this.lights > 0) { this.jumpStart = true; this.emit('jumpstart', {}); this.log('penalty', 'FAUX DÉPART détecté'); }
      }
    } else if (this.phase === 'go') { if (this.phaseT > 2) { this.phase = 'racing'; this.phaseT = 0; } }
    const running = (this.phase === 'go' || this.phase === 'racing' || this.phase === 'finish') && this.neutral !== 'red' || (this.phase === 'finish');
    if (this.phase === 'go' || this.phase === 'racing' || this.phase === 'finish') { if (this.neutral !== 'red') this.clock += dt; }

    // ---- environnement ------------------------------------------------
    this._updateWeather(dt);
    this._updateHazards(dt);
    if (this.neutral !== 'none') this._updateNeutral(dt);
    this.step60 += dt;
    if (this.step60 >= 0.12) { this.step60 = 0; this._slowTick(); }

    // ---- contrôle des voitures + physique ------------------------------
    const ctx = this._ctx || (this._ctx = {});
    ctx.track = tr; ctx.vmax = this.vmax; ctx.phase = this.phase; ctx.t = this.t; ctx.clock = this.clock; ctx.neutral = this.neutral === 'sc_in' ? 'sc' : this.neutral;
    ctx.scSpeed = this.sc ? this.sc.speed : 60; ctx.blueFor = this.blueFor; ctx.obstacles = this.obstacles; ctx.yellowAt = (s) => this._yellowAt(s);
    ctx.cars = this.sc ? this.cars.concat([this.sc]) : this.cars;

    for (const car of this.cars) {
      if (car.status === 'removed') continue;
      const V = car.v;
      tr.project(V.x, V.z, car.proj.i || 0, car.proj);
      if (V.u > car.topSpeed) car.topSpeed = V.u;
      this._control(car, dt, ctx);
      const surface = (car.status === 'pit') ? { type: 'track', grip: 1, drag: 0 } : tr.surface(car.proj.d, car.proj.s);
      V.update(dt, { surface, wetness: this.wet.wetness, vmax: car.status === 'pit' ? PIT_LIMIT + 3 : this.vmax, ambient: this.cfg.weather === 'dry' ? 30 : 20 });
      if (car.status === 'retired') { V.controls.throttle = 0; V.controls.brake = clamp(V.controls.brake + dt * 0.3, 0, 0.6); }
    }
    if (this.sc) this._stepSC(dt);
    this._collisions(dt);
    for (const car of this.cars) { if (car.status !== 'removed') this._progress(car, dt); }
    this._lizardCollide(dt);
  }

  // ------------------------------------------------------------- controllers
  _control(car, dt, ctx) {
    const V = car.v, c = V.controls, tr = this.track;
    if (car.status === 'grid' || (this.phase === 'grid' || this.phase === 'lights') && car.status === 'grid') {
      if (car.isPlayer && !this.driveAuto && this.phase === 'lights' && this.lights > 0) {
        // joueur : peut avancer (faux départ détecté), sinon frein
        const i = this.playerInput; c.steer = 0; c.throttle = i.throttle; c.brake = i.brake; c.boost = false; return;
      }
      c.throttle = 0; c.brake = 1; c.steer = 0; return;
    }
    if (car.status === 'retired') { c.steer = 0; c.throttle = 0; c.brake = 0.2; return; }
    if (this.phase === 'lights' && car.status === 'racing') { c.steer = 0; c.throttle = 0; c.brake = 1; return; }
    if (car.status === 'pit') { this._pitDrive(car, dt); return; }
    ctx.profile = this.getProfile(clamp(V.gripFactor * (this.cfg.weather === 'dry' ? 1 : 0.95), 0.35, 1.05));
    // approche des stands : limite de vitesse + côté droit
    this._pitApproach(car, ctx);
    if (car.isPlayer && !this.driveAuto && !car.finished && this.neutral !== 'red') { this._playerControl(car, dt, ctx); return; }
    if (car.isPlayer && this.neutral === 'red') { c.throttle = 0; c.brake = clamp(V.u / 8, 0, 1) ; c.steer = 0; if (V.u < 0.5) c.brake = 1; return; }
    car.ai.extraCap = car.pit.approach ? car.pit.allowed : Infinity;
    // wrap : IA avec cap pit
    const before = ctx.vmax; if (car.ai.extraCap < Infinity) ctx.vmax = Math.min(ctx.vmax, car.ai.extraCap);
    car.ai.pitSide = car.pit.approach;
    car.ai.update(dt, ctx);
    ctx.vmax = before;
  }

  _pitApproach(car, ctx) {
    const tr = this.track, p = this.track.pit, pit = car.pit;
    pit.approach = false; pit.allowed = Infinity;
    // décision IA
    if (!car.isPlayer && !pit.request && car.status === 'racing' && !car.finished && this.phase === 'racing') {
      const lapNow = car.lapsDone;   // tours terminés
      const wet = this.wet.wetness;
      const tyre = car.v.tyre.compound;
      const wrong = ('SMH'.includes(tyre) && wet > 0.38) || ((tyre === 'I' || tyre === 'W') && wet < 0.12 && this.neutral === 'none');
      const worn = car.v.tyre.wear > 72 && lapNow < this.laps - 1;
      const planned = car.stopPlan.length && lapNow >= car.stopPlan[0] && car.pit.stops < 1;
      const dmg = car.v.damage > 45;
      if ((wrong || worn || planned || dmg) && lapNow < this.laps - 0 && car.pit.stops < 3) {
        pit.request = true; car.stopPlan.shift();
        const rem = this.laps - lapNow;
        pit.tyre = wet > 0.65 ? 'W' : wet > 0.2 ? 'I' : (rem >= 2 ? 'H' : 'S');
      }
    }
    if (!pit.request || car.finished) return;
    const rel = tr.rel(car.proj.s);
    const toEntry = p.sIn - rel;          // >0 : avant l'entrée
    if (toEntry < 300 && toEntry > -6) {
      pit.approach = true;
      pit.allowed = Math.sqrt((PIT_LIMIT * 0.92) ** 2 + 2 * 26 * Math.max(0, toEntry - 3));
      // entrée effective : franchissement de la ligne d'entrée
      if (toEntry <= 0 && car.status === 'racing') this._enterPit(car);
    }
  }

  _enterPit(car) {
    const tr = this.track, path = tr.pitPath, pit = car.pit;
    car.status = 'pit'; pit.phase = 'entry'; pit.t = 0; pit.approach = false;
    pit.boxIdx = tr.pitBoxes[pit.boxK].idx;
    const rel = tr.rel(car.proj.s);
    pit.idx = clamp(Math.round((rel - tr.pit.sIn) / 2), 0, path.length - 1);
    if (!pit.tyre) pit.tyre = this.wet.wetness > 0.6 ? 'W' : this.wet.wetness > 0.2 ? 'I' : 'M';
    pit.entryClock = this.clock; pit.speedFlag = false;
    this.log('pit', `${car.driver.code} entre aux stands`, car);
  }

  _pitDrive(car, dt) {
    const tr = this.track, path = tr.pitPath, V = car.v, c = V.controls, pit = car.pit, box = path[pit.boxIdx];
    const u = Math.max(V.u, 0);
    let i = pit.idx;
    const d2 = (k) => (V.x - path[k].x) ** 2 + (V.z - path[k].z) ** 2;
    while (i + 1 < path.length && d2(i + 1) <= d2(i)) i++;
    pit.idx = i;
    const la = 5 + 0.45 * u, iT = Math.min(path.length - 1, i + Math.round(la / 2));
    // voie de travail : le stand est décalé de WORK m de la voie rapide ; on y entre/sort en douceur
    const WORK = 4.6, ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const boxRel = box.rel;
    const offAt = (rel) => pit.phase === 'entry' ? WORK * ss(boxRel - 24, boxRel - 5, rel)
      : (pit.phase === 'service' || pit.phase === 'release') ? WORK : WORK * (1 - ss(boxRel + 4, boxRel + 22, rel));
    const T0 = path[iT], oT = offAt(T0.rel);
    const T = { x: T0.x - Math.sin(T0.phi) * oT, z: T0.z + Math.cos(T0.phi) * oT };
    const cf = Math.cos(V.phi), sf = Math.sin(V.phi);
    const tx = T.x - V.x, tz = T.z - V.z, dist = Math.hypot(tx, tz) || 1;
    const lf = tx * cf + tz * sf, lr = -tx * sf + tz * cf, alpha = Math.atan2(lr, lf);
    const delta = Math.atan2(2 * CAR.wheelbase * Math.sin(alpha), dist);
    c.steer = clamp(delta / steerLimit(Math.max(u, 1)), -1, 1);
    c.boost = false;
    let vDes = PIT_LIMIT * 0.97;
    const bcos = Math.cos(box.phi), bsin = Math.sin(box.phi);
    const bxW = box.x - Math.sin(box.phi) * WORK, bzW = box.z + Math.cos(box.phi) * WORK;
    const toBox = (bxW - V.x) * bcos + (bzW - V.z) * bsin;
    if (pit.phase === 'entry') {
      const arrive = Math.sqrt(2 * 5.5 * Math.max(toBox - 0.15, 0));
      vDes = Math.min(vDes, arrive + 0.4);
      if (toBox < 4) vDes = Math.min(vDes, 1.2 + toBox * 0.5);
      if (toBox < 0.3 && u < 0.7) { pit.phase = 'service'; pit.t = 0; pit.appliedTyre = false; pit.stopStart = this.clock; pit.light = 'red';
        const dmgExtra = V.damage > 25 ? 3.2 : 0; pit.dur = 2.35 * car.crew + (this.rnd() < 0.08 ? 1.4 : 0) + dmgExtra; this.emit('pitstop', car); }
      // limite en voie
      if (u > PIT_LIMIT + 2.2 && !pit.speedFlag) { pit.speedFlag = true; this.addPenalty(car, 5, 'Excès de vitesse aux stands'); }
    } else if (pit.phase === 'service') {
      vDes = 0; c.throttle = 0; c.brake = 1; c.steer = 0;
      pit.t += dt;
      if (!pit.appliedTyre && pit.t > pit.dur * 0.6) { V.changeTyres(pit.tyre); pit.appliedTyre = true; if (V.damage > 0) V.damage = 0; }
      if (pit.t >= pit.dur) { pit.phase = 'release'; pit.t = 0; }
      return;
    } else if (pit.phase === 'release') {
      c.throttle = 0; c.brake = 1; c.steer = 0; pit.t += dt;
      // sécurité : voie libre devant/derrière dans la voie ?
      let clear = this.neutral !== 'red';
      for (const o of this.cars) { if (o !== car && o.status === 'pit' && (o.pit.phase === 'exit' || o.pit.phase === 'entry') ) { const dd = Math.hypot(o.v.x - V.x, o.v.z - V.z); if (dd < 24) clear = false; } }
      pit.light = clear ? 'green' : 'red';
      if (clear && pit.t > 0.2) { pit.phase = 'exit'; pit.light = 'green'; pit.stopTime = this.clock - pit.stopStart; pit.stops++; pit.request = false; pit.tyre = null; this.emit('pitrelease', car); this.log('pit', `${car.driver.code} arrêt ${pit.stopTime.toFixed(1)} s`, car); }
      return;
    } else if (pit.phase === 'exit') {
      if (i >= tr.pitExitIdx - 1) {
        // feu de sortie : rouge si une voiture arrive vite derrière / drapeau rouge
        const exitRel = tr.pit.sOut - tr.pit.ramp;
        let busy = this.neutral === 'red';
        for (const o of this.cars) { if (o === car || o.status !== 'racing') continue; const r = tr.rel(o.proj.s); const gap = exitRel - r; if (gap > -45 && gap < 40 + o.v.u * 3.4 && o.v.u > 14) busy = true; }
        this.pitExitLight = busy ? 'red' : 'green';
        if (busy && pit.exitWait < 9) { pit.exitWait += dt; vDes = 0; }
        else vDes = PIT_LIMIT * 0.97;
      } else { pit.exitWait = 0; }
      if (i > tr.pitExitIdx) vDes = Math.max(vDes, 58);
      if (u > PIT_LIMIT + 2.2 && i < tr.pitExitIdx && !pit.speedFlag) { pit.speedFlag = true; this.addPenalty(car, 5, 'Excès de vitesse aux stands'); }
      if (i >= path.length - 3) {
        car.status = car.finished ? 'finished' : 'racing'; pit.phase = null; pit.exitWait = 0; return;
      }
    }
    // file d'attente dans la voie des stands : ne jamais tamponner la voiture devant
    for (const o of this.cars) {
      if (o === car || o.status !== 'pit') continue;
      const ph = o.pit.phase; if (ph === 'service' || ph === 'release') continue;
      const dx = o.v.x - V.x, dz = o.v.z - V.z, f = dx * cf + dz * sf, l = -dx * sf + dz * cf;
      if (f > 0 && f < 50 && Math.abs(l) < 5.6) vDes = Math.min(vDes, Math.max(0, Math.max(o.v.u, 0) * 0.8 + (f - 12) * 0.7));
    }
    // remise en ligne : voiture tournée de travers (choc) -> les mécaniciens la replacent
    {
      const hErr = Math.abs(wrapAng(V.phi - path[Math.min(path.length - 1, i + 3)].phi));
      pit.sideT = (hErr > 1.1 && pit.phase !== 'service') ? (pit.sideT || 0) + dt : 0;
      if (pit.sideT > 1.2) {
        const P = path[Math.min(path.length - 1, i + 2)], off = pit.phase === 'entry' ? 0 : (pit.phase === 'exit' ? 0 : WORK);
        V.phi = P.phi; V.x = P.x - Math.sin(P.phi) * off; V.z = P.z + Math.cos(P.phi) * off; V.u = 0; V.v = 0; V.r = 0; pit.sideT = 0;
      }
    }
    const err = vDes - V.u;
    if (err > 0.4) { c.throttle = clamp(err / 3, 0, 0.85); c.brake = 0; }
    else if (err > -0.5) { c.throttle = 0.12; c.brake = 0; }
    else { c.throttle = 0; c.brake = clamp(-err / 1.2, 0, 1); }
  }

  _playerControl(car, dt, ctx) {
    const V = car.v, c = V.controls, i = this.playerInput, tr = this.track, p = car.proj;
    c.steer = i.steer; c.throttle = i.throttle; c.brake = i.brake; c.boost = !!i.boost;
    const vp = tr.profileAt(ctx.profile, p.s + V.u * 0.25);
    // aide au freinage (niveau 2)
    if (this.autoAssist >= 2 && c.brake < 0.7) {
      const over = V.u / Math.max(vp, 10) - 1.06;
      if (over > 0) { c.brake = Math.max(c.brake, clamp(over * 5, 0, 0.75)); c.throttle = 0; }
    }
    // aide traction / stabilité (niveau 1+) : limite l'accélération en virage serré
    if (this.autoAssist >= 1) { if (V.sliding && V.u > 12) c.throttle *= 0.55; }
    // contre-braquage assisté : aide à rattraper un survirage (niveau 1+)
    if (this.autoAssist >= 1 && V.u > 15) {
      const ar = Math.atan2(V.v - 1.7 * V.r * 0.6, Math.max(V.u, 6));
      const bet = Math.atan2(V.v, Math.max(V.u, 6));
      const lim = Math.max(0.035, 0.34 / (1 + (V.u / 30) ** 2));
      const k = this.autoAssist >= 2 ? 1.1 : 0.7;
      const dead = Math.abs(bet) - 0.07;
      if (dead > 0) c.steer = clamp(c.steer + Math.sign(bet) * dead * k * 3.0 / lim * 0.35, -1, 1);
      if (Math.abs(bet) > 0.2) c.throttle *= 0.3;
    }
    // approche des stands
    if (car.pit.approach && V.u > car.pit.allowed) { c.brake = Math.max(c.brake, clamp((V.u - car.pit.allowed) * 0.35, 0, 1)); c.throttle = 0; }
    // limite VSC
    if (this.neutral === 'vsc') {
      const lim = vp * 0.62 * 1.08;
      if (V.u > lim) { this.vscSpeedWarn += dt; if (this.vscSpeedWarn > 2.2) { this.addPenalty(car, 5, 'Excès de vitesse sous VSC'); this.vscSpeedWarn = -6; } }
    }
    if (V.u > car.topSpeed) car.topSpeed = V.u;
  }

  // ----------------------------------------------------------------- météo
  _updateWeather(dt) {
    const w = this.wet, cfg = this.cfg;
    if (cfg.weather === 'variable' && this.clock > 0) {
      const on = this.clock > this.rainOnAt && this.clock < this.rainOffAt;
      const tgt = on ? 0.8 : 0;
      w.rain += (tgt - w.rain) * Math.min(1, dt / 14);
      if (on && !this.rainWarned && this.clock > this.rainOnAt - 1) { this.rainWarned = true; this.radio('rain', true); this.log('weather', 'La pluie commence'); }
    }
    const dw = w.rain > 0.08 ? w.rain * 0.022 : -0.0085;
    w.wetness = clamp(w.wetness + dw * dt, 0, w.rain > 0.08 ? 0.5 + w.rain * 0.5 : 1);
    if (cfg.weather === 'dry' && w.rain === 0 && w.wetness < 0.001) w.wetness = 0;
  }

  _updateHazards(dt) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]; o.t += dt;
      if (o.kind === 'lizard') {
        // le lézard fuit (accélère) si une voiture est très proche
        o.x += o.vx * dt; o.z += o.vz * dt;
        if (o.t > o.life) this.obstacles.splice(i, 1);
      } else if (o.t > o.life) this.obstacles.splice(i, 1);
    }
    if (this.cfg.lizard && this.phase === 'racing' && this.neutral === 'none') {
      this.lizardTimer -= dt;
      if (this.lizardTimer <= 0) { this.spawnLizard(); this.lizardTimer = 18 + this.rnd() * 30; }
    }
    for (const car of this.cars) {
      if (car.status === 'retired') { car.retT += dt; if (car.retT > 26 && this.neutral === 'none') this.removeCar(car); }
    }
  }
  _lizardCollide(dt) {
    for (const o of this.obstacles) {
      for (const car of this.cars) {
        if (car.status === 'removed' || car.status === 'pit') continue;
        const d = Math.hypot(o.x - car.v.x, o.z - car.v.z);
        if (d < 1.9 && !o.touched) {
          o.touched = true;
          if (o.kind === 'lizard') { car.v.u *= 0.9; this.emit('lizardhit', { car, o }); this.log('hazard', `${car.driver.code} a touché le lézard`, car); o.vx *= 1.8; o.vz *= 1.8; }
          else { car.v.u *= 0.93; car.v.damage = Math.min(100, car.v.damage + 6); this.emit('sparks', { x: car.v.x, z: car.v.z, power: 0.6 }); }
        }
      }
    }
  }

  // ----------------------------------------------------------- neutralisation
  _updateNeutral(dt) {
    this.neutralT += dt;
    if (this.neutral === 'vsc' && this.neutralT > 26) this.endNeutral();
    if (this.neutral === 'sc' || this.neutral === 'sc_in') {
      // fin du SC : 2 tours minimum, voitures en train
      if (this.neutral === 'sc' && this.neutralT > 6) {
        const lead = this.sortedCars()[0];
        if (this.sc && lead && lead.dist - this.sc.laps0 > this.track.L * 1.7 && !this.cars.some((c) => c.status === 'retired' && c.retT < 20)) this.endNeutral();
        else if (this.neutralT > 80) this.endNeutral();
      }
    }
  }
  _stepSC(dt) {
    const sc = this.sc, tr = this.track;
    const prof = this.getProfile(0.9);
    const target = Math.min(tr.profileAt(prof, sc.s + 25) * 0.58, 54);
    sc.speed += clamp(target - sc.speed, -25 * dt, 9 * dt);
    sc.s = tr.wrapS(sc.s + sc.speed * dt); sc.dist += sc.speed * dt;
    this._syncSC();
    if (this.neutral === 'sc_in') {
      const rel = tr.rel(sc.s);
      if (rel > tr.pit.sIn + 6 && rel < tr.pit.sIn + 60) { this.endNeutral(); }
    }
  }

  _yellowAt(s) {
    const L = this.track.L; const sec = Math.floor(this.track.wrapS(s) / (L / 3));
    return this.sectorFlags[sec] === 'yellow' || this.sectorFlags[sec] === 'double';
  }

  // ------------------------------------------------------------- 10 Hz tick
  _slowTick() {
    const tr = this.track, L = tr.L;
    this.updatePositions();
    // drapeaux par secteur
    const flags = [null, null, null], pr = [0, 0, 0];
    const set = (sec, f, p) => { if (p > pr[sec]) { pr[sec] = p; flags[sec] = f; } };
    for (const c of this.cars) {
      if (c.status === 'removed') continue;
      const sec = Math.min(2, Math.floor(c.proj.s / (L / 3)));
      if (c.status === 'retired') set(sec, 'double', 5);
      else if (c.status === 'racing' && c.v.u < 8 && this.phase === 'racing' && c.retT === 0 && this.clock > 8) set(sec, 'white', 2);
      else if (c.status === 'racing' && Math.abs(c.v.v) > 0.6 * Math.max(c.v.u, 8) && c.v.u > 8) set(sec, 'yellow', 3);
    }
    for (const o of this.obstacles) { if (o.kind === 'debris') set(Math.min(2, Math.floor(tr.wrapS(o.s) / (L / 3))), 'surface', 1); }
    this.sectorFlags = flags;
    // drapeau bleu
    this.blueFor.clear();
    if (this.neutral === 'none' && this.phase === 'racing') {
      const sorted = this.cars.filter((c) => c.status === 'racing' && !c.finished);
      for (const b of sorted) for (const a of sorted) {
        if (a === b) continue;
        if (a.dist - b.dist > L * 0.98) { const gap = tr.wrapS(b.proj.s - a.proj.s); if (gap > 3 && gap < 90 && a.v.u > b.v.u - 4) { this.blueFor.add(b.id); } }
      }
    }
    if (this.player) { const pc = this.player; if (this.blueFor.has(pc.id) && !pc.flagsSeen.blue) { pc.flagsSeen.blue = true; this.radio('blue'); } if (!this.blueFor.has(pc.id)) pc.flagsSeen.blue = false; }
    // messages radio liés à la course (joueur)
    const pc = this.player;
    if (pc && this.phase === 'racing') {
      if (pc.v.tyre.wear > 58 && !pc.flagsSeen.manage) { pc.flagsSeen.manage = true; this.radio('manage'); }
      if ((pc.v.tyre.wear > 78 || this.wrongTyre(pc)) && !pc.flagsSeen.boxSug && !pc.pit.request) { pc.flagsSeen.boxSug = true; this.radio('boxbox'); this.emit('suggestpit', {}); }
      if (pc.v.damage > 40 && !pc.flagsSeen.dmg) { pc.flagsSeen.dmg = true; this.radio('damage'); }
    }
  }
  wrongTyre(c) { const t = c.v.tyre.compound, w = this.wet.wetness; return ('SMH'.includes(t) && w > 0.4) || ((t === 'I' || t === 'W') && w < 0.1); }

  // ----------------------------------------------------------- pénalités
  addPenalty(car, sec, reason) {
    car.penalties.push({ t: this.clock, sec, reason }); car.penaltySec += sec;
    this.log('penalty', `${car.driver.code} +${sec}s : ${reason}`, car);
    if (car.isPlayer) { this.radio('penalty', true); this.emit('penalty', { car, sec, reason }); }
    if (this.cfg.rules === 'advanced' && car.penaltySec >= 30 && !car.dsq) { car.dsq = true; car.status = car.status === 'pit' ? car.status : 'dsq'; this.log('flag', `${car.driver.code} DISQUALIFIÉ (drapeau noir)`, car); this.emit('black', car); }
  }

  // ---------------------------------------------------------------- collisions
  _circles(car, out) {
    const V = car.v, cf = Math.cos(V.phi), sf = Math.sin(V.phi);
    out[0] = [V.x + cf * 1.9, V.z + sf * 1.9]; out[1] = [V.x, V.z]; out[2] = [V.x - cf * 1.9, V.z - sf * 1.9];
    return out;
  }
  _collisions(dt) {
    const tr = this.track, cars = this.cars;
    const R = 1.05;
    // -- murs
    for (const car of cars) {
      if (car.status === 'removed' || car.status === 'pit') continue;
      car.hitCool = Math.max(0, car.hitCool - dt);
      const V = car.v, p = car.proj;
      const trk = Math.atan2(p.tz, p.tx), rel = wrapAng(V.phi - trk);
      const ls = [1.9, 0, -1.9];
      const bR = tr.rightBarrier(p.s), bL = tr.halfW + tr.runoff;
      for (const off of ls) {
        const dc = p.d + off * Math.sin(rel);
        let pen = 0, nx = 0, nz = 0;
        if (dc + R > bR) { pen = dc + R - bR; nx = -p.nx; nz = -p.nz; }
        else if (dc - R < -bL) { pen = -bL - (dc - R); nx = p.nx; nz = p.nz; }
        if (pen > 0) { this._wallHit(car, pen, nx, nz, off); break; }
      }
      // ligne droite pit-wall vue des voitures en piste : même logique via rightBarrier
    }
    // -- voiture / voiture
    const cA = [[0, 0], [0, 0], [0, 0]], cB = [[0, 0], [0, 0], [0, 0]];
    for (let i = 0; i < cars.length; i++) {
      const A = cars[i]; if (A.status === 'removed') continue;
      for (let j = i + 1; j < cars.length; j++) {
        const B = cars[j]; if (B.status === 'removed') continue;
        const dx = B.v.x - A.v.x, dz = B.v.z - A.v.z;
        if (dx * dx + dz * dz > 49) continue;
        this._circles(A, cA); this._circles(B, cB);
        let best = null;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const ex = cB[b][0] - cA[a][0], ez = cB[b][1] - cA[a][1], d = Math.hypot(ex, ez);
          if (d < 2 * R) { const pen = 2 * R - d; if (!best || pen > best.pen) best = { pen, nx: ex / (d || 1), nz: ez / (d || 1), px: (cA[a][0] + cB[b][0]) / 2, pz: (cA[a][1] + cB[b][1]) / 2 }; }
        }
        if (best) this._carHit(A, B, best);
      }
      // safety car : voitures ne la touchent pas (simplifié)
    }
  }
  /** le joueur ne finit pas hors-course sur un simple choc (sauf aides « aucune ») : voiture très abîmée mais pilotable */
  _lethal(car) { if (car.isPlayer && this.cfg.assists !== 'none') { car.v.damage = Math.min(car.v.damage, 94); return false; } return true; }
  _wallHit(car, pen, nx, nz, off) {
    const V = car.v;
    V.x += nx * pen; V.z += nz * pen;
    const cf = Math.cos(V.phi), sf = Math.sin(V.phi);
    const wu = V.u * cf - V.v * sf, wv = V.u * sf + V.v * cf;  // vitesse monde
    const vn = wu * nx + wv * nz;
    if (vn < 0) {
      const e = 0.18; const dvn = -(1 + e) * vn;
      const nwu = wu + nx * dvn, nwv = wv + nz * dvn;
      // friction tangentielle
      const tang = 0.93;
      const tu = nwu - nx * (nwu * nx + nwv * nz), tv = nwv - nz * (nwu * nx + nwv * nz);
      const fu = nx * (nwu * nx + nwv * nz) + tu * tang, fv = nz * (nwu * nx + nwv * nz) + tv * tang;
      V.u = fu * cf + fv * sf; V.v = -fu * sf + fv * cf;
      // couple : dépend de la position du point d'impact
      const arm = off, sign = (nx * -sf + nz * cf) > 0 ? 1 : -1;
      V.r += sign * -vn * 0.045 * Math.sign(arm || 0.0) * 0.8;
      const impact = -vn;
      if (impact > 3) {
        V.damage = Math.min(100, V.damage + impact * 1.35);
        this.emit('sparks', { x: V.x + nx * -0.8, z: V.z + nz * -0.8, power: clamp(impact / 20, 0.2, 1.5) });
        if (car.isPlayer) this.emit('impact', { power: impact });
        if (impact > 18 && this.rnd() < 0.7) this.spawnDebris(car, car.proj.s);
        if (V.damage >= 100 && car.status === 'racing' && this._lethal(car)) this.retire(car, 'dégâts');
        else if (V.damage > 45 && !car.flagsSeen.dmgFlag) { car.flagsSeen.dmgFlag = true; this.log('flag', `${car.driver.code} : drapeau noir/orange (dommages)`, car); }
      }
    }
  }
  _carHit(A, B, h) {
    const VA = A.v, VB = B.v;
    // séparation
    const push = h.pen / 2 + 0.002;
    VA.x -= h.nx * push; VA.z -= h.nz * push; VB.x += h.nx * push; VB.z += h.nz * push;
    const cfA = Math.cos(VA.phi), sfA = Math.sin(VA.phi), cfB = Math.cos(VB.phi), sfB = Math.sin(VB.phi);
    const vAx = VA.u * cfA - VA.v * sfA, vAz = VA.u * sfA + VA.v * cfA, vBx = VB.u * cfB - VB.v * sfB, vBz = VB.u * sfB + VB.v * cfB;
    const rvn = (vBx - vAx) * h.nx + (vBz - vAz) * h.nz;
    if (rvn < 0) {
      const mA = VA.mass, mB = VB.mass; const e = 0.12;
      const j = -(1 + e) * rvn / (1 / mA + 1 / mB);
      const dAx = -h.nx * j / mA, dAz = -h.nz * j / mA, dBx = h.nx * j / mB, dBz = h.nz * j / mB;
      const nAx = vAx + dAx, nAz = vAz + dAz, nBx = vBx + dBx, nBz = vBz + dBz;
      VA.u = nAx * cfA + nAz * sfA; VA.v = -nAx * sfA + nAz * cfA; VB.u = nBx * cfB + nBz * sfB; VB.v = -nBx * sfB + nBz * cfB;
      // lacet : bras de levier
      const rAx = h.px - VA.x, rAz = h.pz - VA.z, rBx = h.px - VB.x, rBz = h.pz - VB.z;
      VA.r += ((rAx * dAz - rAz * dAx) * mA / CAR.Iz) * 0.22; VB.r += ((rBx * dBz - rBz * dBx) * mB / CAR.Iz) * 0.22;
      const power = -rvn;
      if (power > 2.5) {
        this.emit('sparks', { x: h.px, z: h.pz, power: clamp(power / 14, 0.15, 1.4) });
        this.emit('carhit', { a: A, b: B, power });
        const dmg = Math.max(0, power - 2.5) * 0.9; VA.damage = Math.min(100, VA.damage + dmg); VB.damage = Math.min(100, VB.damage + dmg);
        if (A.isPlayer || B.isPlayer) this.emit('impact', { power });
        // pénalité : la voiture derrière (celle qui rattrape) en cas de contact violent
        if (power > 6 && this.phase === 'racing') {
          const aBehind = ((VB.x - VA.x) * cfA + (VB.z - VA.z) * sfA) > 0;   // B devant A
          const culprit = aBehind ? A : B;
          if (culprit.hitCool <= 0 && this.neutral === 'none') { culprit.hitCool = 6; if (culprit.isPlayer || this.cfg.rules === 'advanced') this.addPenalty(culprit, 5, 'Collision (conduite dangereuse)'); }
        }
        if (VA.damage >= 100 && A.status === 'racing' && this._lethal(A)) this.retire(A, 'collision');
        if (VB.damage >= 100 && B.status === 'racing' && this._lethal(B)) this.retire(B, 'collision');
      }
    }
  }

  // ------------------------------------------------- progression / checkpoints
  _progress(car, dt) {
    const tr = this.track, L = tr.L, p = car.proj;
    let delta = p.s - car.lastS; if (delta > L / 2) delta -= L; else if (delta < -L / 2) delta += L;
    car.lastS = p.s;
    if (Math.abs(delta) < 40) car.dist += delta;      // téléportation ignorée (> 40 m en 8 ms)
    // limites de piste : voiture entière hors du revêtement + vibreurs
    const limit = tr.halfW + tr.kerbW + 1.0;
    const out = Math.abs(p.d) > limit && car.status === 'racing' && this.phase !== 'grid';
    if (out) { car.offT += dt; if (!car.offActive && car.offT > 0.3) { car.offActive = true; car.curValid = false; car.strikes++; this.emit('tracklimit', car);
      if (car.isPlayer) { if (car.strikes === 3) { this.emit('flagwarn', 'bw'); } if (car.strikes >= 4 || (car.strikes === 3 && this.cfg.rules === 'advanced')) this.addPenalty(car, 5, 'Limites de piste (x' + car.strikes + ')'); }
      else if (car.strikes >= 6 && car.strikes % 3 === 0) this.addPenalty(car, 5, 'Limites de piste'); } }
    else { car.offT = 0; car.offActive = false; }
    // portes ordonnées : 0 = ligne ; 1,2 = secteurs
    if (car.status === 'grid' || car.finished) { if (car.finished) { /* continue cool-down */ } else return; }
    const third = L / 3;
    while (!car.finished && car.dist >= car.nextGate * third && this.phase !== 'grid' && this.phase !== 'lights') {
      const g = car.nextGate;
      if (g % 3 === 0) {
        // ligne d'arrivée / départ
        if (g >= 3) {
          const lt = this.clock - car.lapStart;
          car.lapsDone = g / 3;
          car.lapTimes.push(lt); car.lapValid.push(car.curValid && !car.v.cheat);
          car.last = lt;
          if (car.curValid && lt < car.best) { car.best = lt; this.emit('bestlap', car); }
          if (car.curValid && lt < this.fastest.t) { this.fastest = { t: lt, car }; this.emit('fastest', car); }
          this.emit('lap', car);
          if (car.isPlayer && car.lapsDone === this.laps - 1) { this.radio('finallap'); this.emit('finalLap', {}); }
          if (car.isPlayer && car.lapsDone >= 1 && car.pit.stops > 0 && !car.flagsSeen['push' + car.lapsDone]) { car.flagsSeen['push' + car.lapsDone] = 1; this.radio('push'); }
          car.curValid = true;
          // arrivée ?
          if (car.lapsDone >= this.laps && this.cfg.mode !== 'timetrial') { this._finish(car); }
          else if (car.lapsDone >= this.laps && this.cfg.mode === 'timetrial') { this._finish(car); }
          else if (this.leaderFinishClock !== null && !car.finished) { this._finish(car, true); }
        }
        car.lapStart = this.clock; car.sectors = [null, null, null]; car.sectorStart = this.clock;
      } else {
        const s = g % 3; const st = this.clock - car.sectorStart;
        car.sectors[s - 1] = st; car.sectorStart = this.clock; if (st < car.bestSectors[s - 1]) car.bestSectors[s - 1] = st;
        this.emit('sector', { car, sector: s, time: st });
      }
      car.nextGate++;
      if (car.finished) break;
    }
    // règle des "tours de retard" : à l'arrivée du leader, ceux qui franchissent la ligne terminent
    if (this.leaderFinishClock !== null && !car.finished && car.status !== 'retired' && car.status !== 'dsq' && car.status !== 'pit') {
      // déjà géré aux portes ; ici : timeouts
    }
  }

  _finish(car, lapped = false) {
    if (car.finished) return;
    car.finished = true; car.finishClock = this.clock; car.finishLaps = car.lapsDone; car.finishOrder = this.finishedCount++;
    car.pit.request = false;
    this.log('finish', `${car.driver.code} franchit la ligne (${lapped ? 'à ' + (this.laps - car.lapsDone) + ' tour(s)' : 'P' + (car.finishOrder + 1)})`, car);
    this.emit('carfinish', car);
    if (this.leaderFinishClock === null) {
      this.leaderFinishClock = this.clock; this.phase = 'finish'; this.phaseT = 0; this.emit('chequered', car);
      if (this.cfg.mode !== 'timetrial') { if (car.isPlayer) this.radio('win', true); }
    }
    if (car.isPlayer) { if (car.finishOrder < 3) this.radio('podium', true); this.emit('playerfinish', car); }
  }

  /** teste la fin de course : tous finis/abandons ou délai écoulé */
  checkEnd() {
    if (this.phase !== 'finish') return false;
    const active = this.cars.filter((c) => c.status !== 'removed' && c.status !== 'retired' && c.status !== 'dsq');
    const done = active.every((c) => c.finished);
    const timeout = this.clock - this.leaderFinishClock > (this.cfg.mode === 'timetrial' ? 0.1 : 90);
    if (done || timeout || (this.player && this.player.finished && this.clock - this.player.finishClock > 14 && this.cfg.mode !== 'timetrial' ? false : false)) {
      this.finalize(); return true;
    }
    return false;
  }

  finalize() {
    if (this.resultsData) return this.resultsData;
    // classement : tours terminés, puis temps final (+ pénalités)
    const rows = this.cars.map((c) => {
      const laps = c.finished ? c.finishLaps : c.lapsDone;
      const base = c.finished ? c.finishClock : 1e9;
      return { car: c, id: c.id, driver: c.driver, team: c.team, laps, finished: c.finished, time: base, pen: c.penaltySec, total: base + c.penaltySec, status: c.dsq ? 'DSQ' : c.status === 'retired' || c.status === 'removed' ? 'DNF' : (laps < this.laps ? '+' + (this.laps - laps) + ' T' : 'OK'), best: c.best, dist: c.dist, grid: c.grid, stops: c.pit.stops, overtakes: c.overtakes, topSpeed: c.topSpeed, strikes: c.strikes };
    });
    rows.sort((a, b) => {
      const ad = a.status === 'DSQ' ? 1 : 0, bd = b.status === 'DSQ' ? 1 : 0; if (ad !== bd) return ad - bd;
      const af = a.finished ? 0 : 1, bf = b.finished ? 0 : 1; if (af !== bf) return af - bf;
      if (a.laps !== b.laps) return b.laps - a.laps;
      if (a.finished) return a.total - b.total; return b.dist - a.dist;
    });
    rows.forEach((r, i) => { r.pos = i + 1; r.points = this.cfg.mode === 'timetrial' ? 0 : (r.status === 'DSQ' || r.status === 'DNF' ? 0 : (POINTS[i] || 0)); r.gained = r.grid - r.pos; });
    if (FASTEST_LAP_POINT && this.fastest.car) { const r = rows.find((x) => x.car === this.fastest.car); if (r && r.pos <= 10) r.points += FASTEST_LAP_POINT; }
    this.resultsData = { rows, fastest: this.fastest, laps: this.laps, mode: this.cfg.mode, assists: this.cfg.assists, drive: this.cfg.drive, weather: this.cfg.weather, circuit: this.cfg.circuitId };
    this.phase = 'results'; this.emit('results', this.resultsData);
    return this.resultsData;
  }
}
