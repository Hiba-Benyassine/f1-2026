// =====================================================================
//  AUDIO : tout est synthétisé avec WebAudio (aucun fichier audio, aucun droit d'auteur)
//  moteur (RPM, charge, doppler, voitures proches), pneus, vent, vibreurs, pluie, foule,
//  impacts, radio (bip + voix du navigateur), musique (menu, course, podium), fanfare.
//  Les volumes viennent des réglages : master / sfx / musique / radio / foule.
// =====================================================================
import { settings } from './settings.js';
import { RADIO } from './data.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class AudioSystem {
  constructor() {
    this.ctx = null; this.ready = false; this.muted = false;
    this.music = { name: null, timer: null, step: 0, nextT: 0 };
    this.others = [];
    this.lastRadioTime = 0;
    this.sub = null;
  }

  // doit être appelé après un geste utilisateur (clic / touche)
  unlock() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.bus = {};
    for (const n of ['sfx', 'music', 'radio', 'crowd']) { this.bus[n] = c.createGain(); this.bus[n].connect(this.master); }
    // bruit blanc / rose partagé (2 s en boucle)
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    this.noiseBuf = buf;
    this._buildEngine(); this._buildAmbience();
    this.ready = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : s.masterVol, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.sfxVol, t, 0.05);
    this.bus.music.gain.setTargetAtTime(s.musicVol * 0.55, t, 0.05);
    this.bus.radio.gain.setTargetAtTime(s.radioVol, t, 0.05);
    this.bus.crowd.gain.setTargetAtTime(s.crowdVol, t, 0.05);
  }
  toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }

  _noise(loop = true) { const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = loop; return n; }

  // ------------------------------------------------------------ moteur joueur
  _buildEngine() {
    const c = this.ctx, E = (this.eng = {});
    E.out = c.createGain(); E.out.gain.value = 0; E.pan = c.createGain();
    E.lp = c.createBiquadFilter(); E.lp.type = 'lowpass'; E.lp.frequency.value = 1800; E.lp.Q.value = 1.2;
    E.hp = c.createBiquadFilter(); E.hp.type = 'highpass'; E.hp.frequency.value = 70;
    E.shaper = c.createWaveShaper();
    const curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(2.4 * x); } E.shaper.curve = curve;
    E.osc = [];
    const spec = [[1, 'sawtooth', 0.5], [2, 'sawtooth', 0.32], [3, 'square', 0.16], [0.5, 'triangle', 0.3], [4.01, 'sawtooth', 0.1]];
    for (const [m, type, g] of spec) { const o = c.createOscillator(); o.type = type; const gn = c.createGain(); gn.gain.value = g; o.connect(gn); gn.connect(E.shaper); o.start(); E.osc.push({ o, m, gn }); }
    // souffle d'admission / turbo
    E.nz = this._noise(); E.nzF = c.createBiquadFilter(); E.nzF.type = 'bandpass'; E.nzF.frequency.value = 2400; E.nzF.Q.value = 0.7; E.nzG = c.createGain(); E.nzG.gain.value = 0;
    E.nz.connect(E.nzF); E.nzF.connect(E.nzG); E.nzG.connect(E.lp); E.nz.start();
    // sifflement ERS
    E.ers = c.createOscillator(); E.ers.type = 'sine'; E.ersG = c.createGain(); E.ersG.gain.value = 0; E.ers.connect(E.ersG); E.ersG.connect(E.out); E.ers.start();
    E.shaper.connect(E.hp); E.hp.connect(E.lp); E.lp.connect(E.out); E.out.connect(this.bus.sfx);
    E.crackleT = 0;
  }

  _buildOther() {
    const c = this.ctx, o = { osc: [], g: c.createGain(), pan: c.createStereoPanner ? c.createStereoPanner() : null, lp: c.createBiquadFilter() };
    o.lp.type = 'lowpass'; o.lp.frequency.value = 1400; o.g.gain.value = 0;
    for (const [m, type, gv] of [[1, 'sawtooth', 0.5], [2, 'sawtooth', 0.28], [0.5, 'triangle', 0.3]]) { const x = c.createOscillator(); x.type = type; const g = c.createGain(); g.gain.value = gv; x.connect(g); g.connect(o.lp); x.start(); o.osc.push({ x, m }); }
    o.lp.connect(o.g); if (o.pan) { o.g.connect(o.pan); o.pan.connect(this.bus.sfx); } else o.g.connect(this.bus.sfx);
    return o;
  }

  // ------------------------------------------------------------ ambiances
  _buildAmbience() {
    const c = this.ctx, A = (this.amb = {});
    const mk = (type, f, q) => { const n = this._noise(); const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q || 0.7; const g = c.createGain(); g.gain.value = 0; n.connect(flt); flt.connect(g); g.connect(this.bus.sfx); n.start(); return { n, flt, g }; };
    A.wind = mk('lowpass', 400, 0.6);
    A.tyre = mk('bandpass', 2300, 7);
    A.rain = mk('highpass', 2200, 0.5);
    A.kerb = mk('lowpass', 220, 1.2);
    // foule : bruit filtré + modulation lente
    const n = this._noise(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 0.5; f2.type = 'lowpass'; f2.frequency.value = 2600; g.gain.value = 0;
    n.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.bus.crowd); n.start();
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 140; lfo.connect(lg); lg.connect(f1.frequency); lfo.start();
    A.crowd = { n, f1, f2, g, base: 0 };
  }

  // ------------------------------------------------------------ mise à jour par frame
  /** player : car joueur ; cars : toutes les voitures ; env : { rain, wetness, camMode, onKerb, crowdLevel } */
  update(dt, player, cars, env) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const V = player.v, E = this.eng;
    const rpm = V.rpm, thr = V.controls.throttle, brk = V.controls.brake;
    const f0 = rpm / 60 * 3;
    const cockpit = env.camMode === 'cockpit';
    for (const o of E.osc) o.o.frequency.setTargetAtTime(f0 * o.m, t, 0.025);
    E.lp.frequency.setTargetAtTime((cockpit ? 900 : 1500) + rpm * 0.22 + thr * 1400, t, 0.05);
    const retired = player.status === 'retired' || player.status === 'removed';
    const gridIdle = player.status === 'grid';
    E.out.gain.setTargetAtTime((retired ? 0 : (0.16 + thr * 0.2 + clamp(V.u / 90, 0, 1) * 0.06) * (cockpit ? 0.8 : 1)), t, 0.06);
    E.nzG.gain.setTargetAtTime(retired ? 0 : (0.02 + thr * 0.09), t, 0.08);
    E.nzF.frequency.setTargetAtTime(1800 + rpm * 0.1, t, 0.1);
    E.ers.frequency.setTargetAtTime(2400 + V.u * 14, t, 0.05); E.ersG.gain.setTargetAtTime(V.deploying ? 0.012 : 0, t, 0.08);
    // crépitements à la décélération
    E.crackleT -= dt;
    if (thr < 0.05 && V.u > 25 && rpm > 9000 && E.crackleT <= 0 && !retired) { E.crackleT = 0.05 + Math.random() * 0.18; this._burst(0.05 + Math.random() * 0.05, 900 + Math.random() * 1400, 0.04, this.bus.sfx, 'bandpass'); }
    // changement de rapport : claquement
    if (V.gear !== this._lastGear) { if (this._lastGear !== undefined && V.u > 8) this._burst(0.06, 1500, 0.07, this.bus.sfx, 'bandpass'); this._lastGear = V.gear; }

    // ambiances
    const A = this.amb, sp = V.u;
    A.wind.g.gain.setTargetAtTime(clamp((sp / 95) ** 2, 0, 1) * (cockpit ? 0.14 : 0.1), t, 0.1);
    A.wind.flt.frequency.setTargetAtTime(250 + sp * 7, t, 0.1);
    const slip = clamp(Math.abs(V.v) / Math.max(V.u, 6) * 3 + (V.sliding ? 0.3 : 0) + (brk > 0.8 && V.u > 40 ? 0.12 : 0), 0, 1) * clamp(V.u / 12, 0, 1);
    A.tyre.g.gain.setTargetAtTime(slip * 0.11, t, 0.04); A.tyre.flt.frequency.setTargetAtTime(1900 + slip * 1100, t, 0.06);
    A.rain.g.gain.setTargetAtTime((env.rain || 0) * 0.055, t, 0.4);
    const kerb = V.surfType === 'kerb' ? 1 : 0;
    A.kerb.g.gain.setTargetAtTime(kerb * clamp(V.u / 60, 0.1, 1) * 0.3, t, 0.03); A.kerb.flt.frequency.setTargetAtTime(120 + V.u * 2.4, t, 0.05);
    const crowdBase = env.crowdLevel ?? 0.18;
    A.crowd.g.gain.setTargetAtTime(crowdBase * 0.35, t, 0.4);

    // voitures proches : 4 moteurs spatialisés
    const cand = [];
    for (const o of cars) { if (o === player || o.status === 'removed' || o.status === 'retired' || o.status === 'grid') continue; const dx = o.v.x - V.x, dz = o.v.z - V.z; cand.push({ o, d: Math.hypot(dx, dz), dx, dz }); }
    cand.sort((a, b) => a.d - b.d);
    const cf = Math.cos(V.phi), sf = Math.sin(V.phi);
    for (let k = 0; k < 4; k++) {
      if (!this.others[k]) this.others[k] = this._buildOther();
      const O = this.others[k], cd = cand[k];
      if (!cd || cd.d > 160) { O.g.gain.setTargetAtTime(0, t, 0.1); continue; }
      const f = cd.o.v.rpm / 60 * 3;
      const lf = cd.dx * cf + cd.dz * sf, lr = -cd.dx * sf + cd.dz * cf;
      const vRel = (cd.o.v.u - V.u) * (lf >= 0 ? 1 : -1) * 0.0;   // doppler simplifié : voir pitch ci-dessous
      const closing = -((cd.dx * (cd.o.v.u * Math.cos(cd.o.v.phi) - V.u * cf) + cd.dz * (cd.o.v.u * Math.sin(cd.o.v.phi) - V.u * sf)) / Math.max(cd.d, 1));
      const dop = 1 / (1 + clamp(closing, -80, 80) / 343 * -1) ;
      for (const x of O.osc) x.x.frequency.setTargetAtTime(f * x.m * clamp(dop, 0.85, 1.15) + vRel, t, 0.05);
      O.lp.frequency.setTargetAtTime(700 + cd.o.v.controls.throttle * 900 + clamp(1 - cd.d / 160, 0, 1) * 900, t, 0.1);
      O.g.gain.setTargetAtTime(0.1 * Math.pow(clamp(1 - cd.d / 160, 0, 1), 1.6) * (0.5 + 0.5 * cd.o.v.controls.throttle), t, 0.06);
      if (O.pan) O.pan.pan.setTargetAtTime(clamp(lr / 25, -1, 1), t, 0.05);
    }
  }

  // ------------------------------------------------------------ effets ponctuels
  _burst(dur, freq, vol, bus, type = 'bandpass', q = 1.2) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, n = this._noise(false), f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    n.connect(f); f.connect(g); g.connect(bus || this.bus.sfx); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  }
  _tone(freq, dur, vol, type = 'sine', bus, when = 0, slideTo = null) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.bus.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  sfx(name, p = 1) {
    if (!this.ready) return;
    switch (name) {
      case 'click': this._tone(900, 0.05, 0.08, 'square', this.bus.sfx); break;
      case 'hover': this._tone(520, 0.03, 0.035, 'sine', this.bus.sfx); break;
      case 'confirm': this._tone(660, 0.08, 0.1, 'triangle', this.bus.sfx); this._tone(990, 0.12, 0.09, 'triangle', this.bus.sfx, 0.07); break;
      case 'back': this._tone(420, 0.08, 0.08, 'triangle', this.bus.sfx, 0, 300); break;
      case 'light': this._tone(520, 0.22, 0.16, 'square', this.bus.sfx); break;
      case 'go': this._tone(1040, 0.5, 0.16, 'square', this.bus.sfx); break;
      case 'impact': this._burst(0.28, 260, 0.35 * clamp(p, 0.3, 1.5), this.bus.sfx, 'lowpass', 0.8); this._tone(80, 0.25, 0.3 * clamp(p, 0.3, 1.2), 'sine', this.bus.sfx, 0, 40); break;
      case 'scrape': this._burst(0.35, 3200, 0.1 * p, this.bus.sfx, 'highpass'); break;
      case 'penalty': this._tone(300, 0.18, 0.12, 'sawtooth', this.bus.sfx); this._tone(220, 0.25, 0.12, 'sawtooth', this.bus.sfx, 0.15); break;
      case 'fastest': this._tone(880, 0.1, 0.1, 'triangle', this.bus.sfx); this._tone(1320, 0.16, 0.1, 'triangle', this.bus.sfx, 0.09); this._tone(1760, 0.2, 0.08, 'triangle', this.bus.sfx, 0.18); break;
      case 'lap': this._tone(740, 0.09, 0.09, 'triangle', this.bus.sfx); this._tone(988, 0.14, 0.08, 'triangle', this.bus.sfx, 0.08); break;
      case 'pit': this._burst(0.12, 1800, 0.18, this.bus.sfx, 'bandpass'); break;   // pistolet à écrous
      case 'lizard': this._tone(1400, 0.08, 0.12, 'square', this.bus.sfx, 0, 600); break;
      case 'chequered': this.cheer(1.6); break;
    }
  }
  /** ovation de la foule */
  cheer(power = 1) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, n = this._noise(false), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 * power);
    n.connect(f); f.connect(g); g.connect(this.bus.crowd); n.start(t, Math.random()); n.stop(t + 3.4 * power);
  }
  /** applaudissements (rythme de fête) */
  clap(times = 8, bpm = 126) {
    if (!this.ready) return;
    const gap = 60 / bpm; for (let i = 0; i < times; i++) { const w = i * gap + (i % 4 === 3 ? gap * 0.5 : 0); const t = w; setTimeout(() => { this._burst(0.07, 1700 + Math.random() * 500, 0.22, this.bus.crowd, 'bandpass', 0.9); }, t * 1000); }
  }

  // ------------------------------------------------------------ radio
  radio(key) {
    const R = RADIO[key]; if (!R) return null;
    if (this.ready) {
      this._tone(1700, 0.04, 0.07, 'square', this.bus.radio); this._tone(1250, 0.05, 0.06, 'square', this.bus.radio, 0.05);
      this._burst(0.35, 1800, 0.03, this.bus.radio, 'bandpass', 2);
    }
    // voix du navigateur (si disponible)
    try {
      if (settings.radioVol > 0 && !this.muted && window.speechSynthesis && this.ready) {
        const u = new SpeechSynthesisUtterance(R.text); u.lang = 'en-GB'; u.rate = 1.12; u.pitch = 0.85; u.volume = clamp(settings.radioVol * settings.masterVol, 0, 1);
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      }
    } catch (e) { /* voix indisponible */ }
    return R;
  }

  // ------------------------------------------------------------ musique (synthèse générative)
  playMusic(name) {
    if (this.music.name === name) return;
    this.stopMusic();
    this.music.name = name; this.music.step = 0;
    if (!this.ready || !name) return;
    this.music.nextT = this.ctx.currentTime + 0.1;
    this.music.timer = setInterval(() => this._musicTick(), 90);
  }
  stopMusic() { if (this.music.timer) clearInterval(this.music.timer); this.music.timer = null; this.music.name = null; }
  _note(midi, t, dur, vol, type, bus, cutoff = 2400) {
    const c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.35), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(bus || this.bus.music); o.start(t); o.stop(t + dur + 0.05);
  }
  _kick(t, vol = 0.5) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22); o.connect(g); g.connect(this.bus.music); o.start(t); o.stop(t + 0.25); }
  _hat(t, vol = 0.07) { const c = this.ctx, n = this._noise(false), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05); n.connect(f); f.connect(g); g.connect(this.bus.music); n.start(t, Math.random()); n.stop(t + 0.07); }
  _musicTick() {
    if (!this.ready || !this.music.name) return;
    const c = this.ctx, M = this.music, name = M.name;
    const bpm = name === 'menu' ? 104 : name === 'race' ? 132 : 124, sp = 60 / bpm / 4;   // 16es
    while (M.nextT < c.currentTime + 0.35) {
      const t = M.nextT, s = M.step, bar = Math.floor(s / 16) % 8, pos = s % 16;
      if (name === 'menu') {
        const roots = [57, 53, 60, 55, 57, 53, 62, 55];     // La mineur / Fa / Do / Sol
        const r = roots[bar % roots.length], chord = [0, 3, 7, 12];
        if (pos % 2 === 0) this._note(r + chord[(pos / 2) % 4] + 12, t, sp * 1.8, 0.06, 'triangle', null, 3200);
        if (pos === 0) { this._note(r - 12, t, sp * 7, 0.16, 'sawtooth', null, 700); this._note(r, t, sp * 15, 0.05, 'sawtooth', null, 1200); this._note(r + 7, t, sp * 15, 0.04, 'sawtooth', null, 1200); }
        if (pos === 8) this._note(r - 12, t, sp * 5, 0.12, 'sawtooth', null, 600);
        if (pos % 4 === 0) this._kick(t, 0.22); if (pos % 2 === 1) this._hat(t, 0.035);
      } else if (name === 'race') {
        const roots = [45, 45, 48, 43, 45, 45, 50, 43];
        const r = roots[bar % 8];
        if (pos % 4 === 0) this._kick(t, 0.32); if (pos % 2 === 0) this._hat(t, 0.05); if (pos === 4 || pos === 12) this._hat(t, 0.09);
        if ([0, 3, 6, 8, 11, 14].includes(pos)) this._note(r + [0, 0, 12, 0, 7, 12][[0, 3, 6, 8, 11, 14].indexOf(pos)], t, sp * 1.6, 0.1, 'sawtooth', null, 1400);
        if (pos === 0) this._note(r + 12, t, sp * 15, 0.035, 'square', null, 900);
      } else if (name === 'podium') {
        // fanfare triomphale puis groove de fête
        const lead = [[0, 67], [2, 67], [4, 72], [8, 76], [10, 74], [12, 72], [16, 74], [18, 76], [20, 79], [24, 84], [28, 79], [32, 76], [34, 79], [36, 84], [40, 83], [42, 81], [44, 79], [48, 84]];
        for (const [p, m] of lead) if (s % 64 === p) { this._note(m, t, sp * (p % 8 === 0 ? 3.6 : 1.9), 0.17, 'sawtooth', null, 3400); this._note(m - 12, t, sp * (p % 8 === 0 ? 3.6 : 1.9), 0.1, 'square', null, 1800); this._note(m - 5, t, sp * 3, 0.07, 'sawtooth', null, 2600); }
        const root = [48, 53, 55, 48][Math.floor(s / 16) % 4];
        if (pos === 0) { this._note(root - 12, t, sp * 14, 0.18, 'sawtooth', null, 800); this._note(root, t, sp * 14, 0.05, 'sawtooth', null, 1600); this._note(root + 4, t, sp * 14, 0.05, 'sawtooth', null, 1600); this._note(root + 7, t, sp * 14, 0.05, 'sawtooth', null, 1600); }
        if (pos % 4 === 0) this._kick(t, 0.3); if (pos === 4 || pos === 12) this._burst(0.1, 1900, 0.14, this.bus.music, 'bandpass', 0.8); if (pos % 2 === 1) this._hat(t, 0.05);
      }
      M.nextT += sp; M.step++;
    }
  }
  fanfare() { if (!this.ready) return; const m = [67, 72, 76, 79, 84]; m.forEach((n, i) => { this._note(n, this.ctx.currentTime + i * 0.13, 0.5, 0.18, 'sawtooth', this.bus.music, 3600); this._note(n - 12, this.ctx.currentTime + i * 0.13, 0.5, 0.1, 'square', this.bus.music, 1800); }); }
}
