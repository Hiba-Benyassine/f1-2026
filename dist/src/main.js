// =====================================================================
//  MAIN : orchestration (menus -> chargement -> grille -> feux -> course -> arrivée -> résultats -> podium)
//  boucle à pas fixe 1/120 s pour la simulation, rendu à la fréquence de l'écran.
// =====================================================================
import * as THREE from 'three';
import { CIRCUITS, DEFAULT_AI_GRID, RADIO, TEAMS, circuitById, driverById, DEFAULT_SETUP, TYRES } from './data.js';
import { buildNamedTrack, generateTrack } from './track.js';
import { Race } from './race.js';
import { World, QUALITY } from './world.js';
import { buildCar, buildSafetyCar } from './carModel.js';
import { makeLizard } from './characters.js';
import { makePitCrew } from './characters.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { PodiumScene } from './podium.js';
import { settings, profile, saveProfile, submitResult, computeScore, fmtTime } from './settings.js';
import { REQUIREMENTS } from './status.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const Q = new URLSearchParams(location.search);

function showError(e) {
  console.error(e);
  let b = document.querySelector('.errbox'); if (!b) { b = document.createElement('div'); b.className = 'errbox'; document.body.appendChild(b); }
  b.textContent = 'Erreur : ' + (e && e.stack ? e.stack : e) + '\n\n(Ouvre la console du navigateur — F12 — pour plus de détails.)';
  window.__error = String(e && e.stack ? e.stack : e);
}
window.addEventListener('error', (ev) => showError(ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => showError(ev.reason));

class Game {
  constructor() {
    this.canvas = $('#gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.input = new Input(); this.audio = new AudioSystem();
    this.ui = new UI($('#ui'), this.input, this.audio); this.hud = new HUD($('#hud'), this.input);
    this.mode = 'menu'; this.paused = false; this.acc = 0; this.last = performance.now(); this.camMode = 0; this.camPhi = 0; this.camPos = new THREE.Vector3(); this.shake = 0;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.2, 5000); this.scene = new THREE.Scene();
    this.cars = new Map(); this.sprites = new Map(); this.obMeshes = new Map(); this.crews = new Map(); this.debugOn = false; this.debugObjs = null;
    this.vig = document.createElement('div'); this.vig.className = 'vig'; $('#app').appendChild(this.vig);
    this.lines = document.createElement('div'); this.lines.className = 'speedlines'; $('#app').appendChild(this.lines);
    this._wire(); this.resize(); window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    document.addEventListener('keydown', () => this.audio.unlock(), { once: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'race' && !this.paused && this.race && this.race.phase !== 'results') this.setPause(true); });
    this.ui.cb.requirements = () => REQUIREMENTS;
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const q = QUALITY[settings.graphics] || QUALITY.high, w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixel)); this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.podium) this.podium.resize(w, h);
  }

  // ---------------------------------------------------------------- câblage UI
  _wire() {
    const ui = this.ui, hud = this.hud;
    ui.cb.start = (cfg) => this.startRace(cfg);
    ui.cb.again = () => this.startRace(this.lastCfg);
    ui.cb.menu = () => this.toMenu();
    ui.cb.podium = () => this.showPodium();
    ui.cb.results = () => { this.leavePodium(); ui.showResults(this.race.resultsData, this.resultExtra); this.audio.playMusic('menu'); };
    ui.cb.settings = (k) => { this.audio.applyVolumes(); if (k === 'graphics') this.resize(); };
    hud.cb.pause = (a) => { if (a === 'resume') this.setPause(false); else if (a === 'restart') { this.setPause(false); this.startRace(this.lastCfg); } else if (a === 'menu') { this.setPause(false); this.toMenu(); } else if (a === 'settings') { this.pauseSettings(); } };
    hud.cb.vmax = (v) => { if (this.race) this.race.setVmax(v); this.lastCfg.vmax = v; profile.setup.vmax = v; saveProfile(); };
    hud.cb.debug = (v) => { this.debugOn = v; };
    hud.cb.pit = (t) => { if (this.race && this.race.player) this.race.requestPit(t); };
    hud.cb.tyre = (t) => { if (this.race) this.race.setNextTyre(t); };
    hud.cb.regen = (o) => { const c = { ...this.lastCfg, complexity: o.complexity, width: o.width, circuitId: 'procedural', seed: (this.lastCfg.seed || 1) + 1 }; this.gen = (this.gen || 1) + 1; this.startRace(c, this.gen); };
    this.input.onAction((a) => this._action(a));
  }
  pauseSettings() { this.setPause(false); this.mode = 'menu'; this.ui.show('settings', false); this.ui.stack = ['main']; }

  _action(a) {
    if (a === 'mute') { const m = this.audio.toggleMute(); if (this.mode === 'race') this.hud.toast(m ? 'Son coupé' : 'Son activé'); return; }
    if (a === 'fullscreen' && this.mode !== 'menu') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); return; }
    if (this.mode !== 'race' || !this.race) return;
    const r = this.race;
    switch (a) {
      case 'pause': this.setPause(!this.paused); break;
      case 'camera': this.camMode = (this.camMode + 1) % 4; this.hud.toast(['Caméra : poursuite', 'Caméra : cockpit', 'Caméra : T-cam', 'Caméra : hélico'][this.camMode]); break;
      case 'pit': if (r.cfg.mode !== 'timetrial') { const on = r.requestPit(this.hud.pitTyre); this.hud.toast(on ? 'Arrêt demandé — rentre au prochain passage' : 'Arrêt annulé', on ? 'warn' : 'info'); } break;
      case 'debug': this.debugOn = !this.debugOn; this.hud.el.lDbg.checked = this.debugOn; break;
      case 'auto': r.driveAuto = !r.driveAuto; this.hud.toast(r.driveAuto ? 'Autopilote ACTIVÉ' : 'Vous reprenez la main'); break;
      case 'reset': this.resetPlayer(); break;
      case 'lab': this.hud.toggleLab(); break;
      case 'help': this.hud.hintT = 8; this.hud.el.hHint.classList.remove('off'); break;
      case 'tyre:prev': case 'tyre:next': { const ids = Object.keys(TYRES); const i = ids.indexOf(this.hud.pitTyre || r.player.v.tyre.compound); const n = ids[(i + (a === 'tyre:next' ? 1 : ids.length - 1)) % ids.length]; this.hud.setPitTyre(n); r.setNextTyre(n); break; }
      default: if (a.startsWith('tyre:')) { const t = a.slice(5); this.hud.setPitTyre(t); r.setNextTyre(t); this.hud.toast('Prochains pneus : ' + TYRES[t].name); }
    }
  }
  setPause(v) {
    if (this.mode !== 'race' || !this.race || this.race.phase === 'results') return; this.paused = v; this.hud.setPaused(v);
    if (this.audio.ready) v ? this.audio.ctx.suspend() : this.audio.ctx.resume();
    if (v) { const b = this.hud.el.hPause.querySelector('button'); if (b) b.focus(); }
  }
  resetPlayer() {
    const r = this.race, p = r.player; if (!p || p.status !== 'racing') return; const tr = r.track, V = p.v;
    const pr = tr.posAt(p.proj.s, 0, {}); V.place(pr.x, pr.z, pr.phi); V.u = Math.min(V.u, 10); V.v = 0; V.r = 0; r.addPenalty(p, 3, 'Remise en piste'); this.hud.toast('Voiture remise sur la piste (+3 s)', 'warn');
  }

  // ---------------------------------------------------------------- navigation
  toMenu() {
    this.disposeRace(); this.leavePodium(); this.mode = 'menu'; this.hud.hide(); this.ui.stack = []; this.ui.show('main', false); this.audio.playMusic('menu'); this.audio.applyVolumes();
    this.renderer.clear(); this.vig.style.opacity = 0; this.lines.style.opacity = 0;
  }
  disposeRace() {
    if (!this.race) return;
    const dis = (root) => root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    dis(this.scene); this.scene = new THREE.Scene(); this.cars.clear(); this.sprites.clear(); this.obMeshes.clear(); this.crews.clear(); this.debugObjs = null;
    this.race = null; this.world = null; this.fx = null; this.sc = null; this.paused = false;
  }
  leavePodium() { if (this.podium) { this.podium.dispose(); this.podium = null; } if (this.mode === 'podium') this.mode = 'race'; this.ui.hide(); }

  // ---------------------------------------------------------------- démarrage d'une course
  async startRace(cfg, generation = 1) {
    this.audio.unlock(); this.audio.playMusic(null); this.leavePodium(); this.disposeRace(); this.hud.hide();
    this.mode = 'loading'; this.lastCfg = JSON.parse(JSON.stringify(cfg)); const ui = this.ui; ui.stack = [];
    ui.show('loading', false); const tips = ['Astuce : relâche l\'accélérateur avant le virage et freine en ligne droite.', 'Astuce : les pneus tendres sont plus rapides mais s\'usent vite.', 'Astuce : sous la pluie, passe aux pneus intermédiaires (B puis 4).', 'Astuce : le boost ERS est limité : utilise-le sur les lignes droites.', 'Astuce : en AUTO, l\'IA conduit pour toi (touche T pour reprendre la main).'];
    ui.setTip(tips[Math.floor(Math.random() * tips.length)]);
    try {
      const step = async (p, txt) => { ui.setLoading(p, txt); await nextFrame(); };
      await step(0.05, 'Génération du circuit…');
      const circuit = circuitById(cfg.circuitId); const width = cfg.width || 15;
      const track = circuit.id === 'procedural' ? generateTrack({ seed: cfg.seed || 2026, complexity: cfg.complexity ?? 0.55, width, targetKm: circuit.gameKm }) : buildNamedTrack(circuit, width);
      await step(0.25, 'Préparation de la grille…');
      const aiCount = cfg.mode === 'timetrial' ? 0 : Math.min(12, cfg.aiCount ?? 12);
      const race = new Race({ track, laps: cfg.laps, playerId: cfg.driverId, aiIds: DEFAULT_AI_GRID.filter((id) => id !== cfg.driverId), aiCount, difficulty: cfg.difficulty, assists: cfg.assists, weather: cfg.weather, startTyre: cfg.startTyre, gridPos: cfg.gridPos, lizard: cfg.lizard, vmax: cfg.vmax, startDelay: cfg.startDelay, rules: cfg.rules, mode: cfg.mode, drive: cfg.drive, circuitId: circuit.id, seed: cfg.seed, circuit });
      this.race = race; this.track = track; this.gen = generation;
      await step(0.4, 'Construction du décor…');
      const scene = this.scene; const q = settings.graphics;
      const boxTeams = []; race.cars.forEach((c) => { boxTeams[c.pit.boxK] = c.teamId; });
      this.world = new World(scene, this.renderer, track, circuit, { quality: q, boxTeams, playerTeam: race.player.teamId, playerBox: race.player.pit.boxK });
      this.fx = new FX(scene, q);
      await step(0.65, 'Voitures et pilotes…');
      for (const c of race.cars) {
        const m = buildCar(c.team, c.driver, { compound: cfg.startTyre }); scene.add(m.group); this.cars.set(c.id, m);
        const sp = this._nameSprite(c); scene.add(sp); this.sprites.set(c.id, sp);
      }
      this.sc = null;
      await step(0.85, 'Son et interface…');
      this._bindRace(race);
      this.hud.setup(race, track, { generation, complexity: cfg.complexity, width, bestScore: this._bestScore(circuit.id) });
      this.hud.el.lDbg.checked = this.debugOn;
      this.world.setWeather(race.wet.rain, race.wet.wetness);
      this.world.setStartLights(0);
      await step(1, 'Prêt !');
      this.mode = 'race'; this.paused = false; this.acc = 0; this.camMode = 0; this.camPhi = race.player.v.phi; this.gridT = 0; this.started = false; this.camInit = false; this.resultExtra = null;
      ui.hide(); this.hud.show(); this.audio.playMusic('race'); this.audio.applyVolumes();
      this.hud.message(circuit.name.toUpperCase(), '', 2.4);
      window.__game = this;
    } catch (e) { showError(e); }
  }
  _bestScore(id) { try { return JSON.parse(localStorage.getItem('gp26_records') || '{}')[id]?.bestScore || 0; } catch (e) { return 0; } }

  _nameSprite(c) {
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 48; const g = cv.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.72)'; g.beginPath(); g.roundRect ? g.roundRect(2, 2, 188, 44, 10) : g.rect(2, 2, 188, 44); g.fill();
    g.fillStyle = c.team.accent === '#ffffff' || c.team.accent === '#101010' ? c.team.body : c.team.accent; g.fillRect(8, 8, 8, 32);
    g.fillStyle = '#fff'; g.font = '800 28px Arial'; g.textBaseline = 'middle'; g.fillText(c.driver.code, 24, 26); g.fillStyle = '#ffd400'; g.font = '700 22px Arial'; g.textAlign = 'right'; g.fillText('#' + c.driver.number, 182, 26);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.scale.set(3.6, 0.9, 1); s.renderOrder = 10; return s;
  }

  _bindRace(race) {
    const hud = this.hud, au = this.audio, fx = this.fx, world = this.world;
    const P = () => race.player;
    race.on('light', (n) => { hud.light(n); world.setStartLights(n); au.sfx('light'); });
    race.on('lightsout', () => { hud.lightsOut(); world.setStartLights(0); au.sfx('go'); world.setExcite(0.7); });
    race.on('radio', (key) => { const R = RADIO[key]; if (!R) return; au.radio(key); hud.radio(R.text + (R.fr && R.fr !== R.text ? '  ·  ' + R.fr : '')); });
    race.on('jumpstart', () => { hud.message('FAUX DÉPART', 'bad', 2.5); au.sfx('penalty'); });
    race.on('lap', (c) => { if (c.isPlayer && c.lapsDone < race.laps) { hud.toast(`Tour ${c.lapsDone} : ${fmtTime(c.last)}${c.curValid === false ? '' : ''}`, 'info'); au.sfx('lap'); if (c.lapsDone === race.laps - 1) hud.toast('DERNIER TOUR', 'warn', 4); } });
    race.on('bestlap', (c) => { if (c.isPlayer) hud.toast('Meilleur tour personnel ' + fmtTime(c.best), 'purple'); });
    race.on('fastest', (c) => { au.sfx('fastest'); hud.toast(`Tour le plus rapide : ${c.driver.code} ${fmtTime(c.best)}`, 'purple'); });
    race.on('penalty', (e) => { hud.toast(`+${e.sec} s · ${e.reason}`, 'bad', 4.5); au.sfx('penalty'); });
    race.on('tracklimit', (c) => { if (c.isPlayer) hud.toast(`Limites de piste (${c.strikes}) — tour invalidé`, 'warn'); });
    race.on('flagwarn', () => hud.toast('Drapeau noir et blanc : avertissement limites de piste', 'warn', 4));
    race.on('neutral', (k) => {
      if (k === 'sc') { hud.message('SAFETY CAR', 'bad', 2.4); this._ensureSC(); } else if (k === 'vsc') hud.message('VIRTUAL SAFETY CAR', 'bad', 2.4);
      else if (k === 'none') hud.message('PISTE LIBRE', 'go', 1.8); else if (k === 'restart') hud.message('RELANCE', '', 1.6);
    });
    race.on('flag', (f) => { if (f === 'red') hud.message('DRAPEAU ROUGE', 'bad', 3.2); });
    race.on('sparks', (e) => { fx.spark(e.x, e.z, e.power); });
    race.on('impact', (e) => { this.shake = Math.min(1.4, this.shake + 0.35 + e.power * 0.03); au.sfx('impact', clamp(e.power / 15, 0.3, 1.4)); });
    race.on('carhit', (e) => { if (!(e.a.isPlayer || e.b.isPlayer)) { const p = P().v; const d = Math.hypot(e.a.v.x - p.x, e.a.v.z - p.z); if (d < 60) au.sfx('impact', 0.3); } });
    race.on('lizard', () => { hud.toast('ATTENTION : un lézard traverse !', 'warn', 3.5); au.sfx('lizard'); });
    race.on('lizardhit', () => hud.toast('Lézard touché…', 'bad'));
    race.on('debris', () => hud.toast('Débris sur la piste', 'warn'));
    race.on('pitstop', (c) => { au.sfx('pit'); if (c.isPlayer) hud.toast(`Arrêt aux stands · pneus ${TYRES[c.pit.tyre].name}`, 'info', 3); });
    race.on('pitrelease', (c) => { if (c.isPlayer) hud.toast(`Arrêt de ${c.pit.stopTime.toFixed(1)} s`, 'good'); });
    race.on('retire', (c) => { hud.toast(`${c.driver.code} abandonne`, 'bad'); });
    race.on('chequered', () => { hud.message('DAMIER', '', 2.6); au.sfx('chequered'); world.setExcite(1); });
    race.on('playerfinish', (c) => { hud.message('ARRIVÉE ! P' + (c.finishOrder + 1), 'go', 3.2); });
    race.on('suggestpit', () => hud.toast('Ton ingénieur te conseille de rentrer aux stands', 'warn', 4.5));
    race.on('results', (res) => this._onResults(res));
  }

  _onResults(res) {
    const p = res.rows.find((r) => r.car.isPlayer); if (!p) return;
    const fastRank = [...res.rows].filter((r) => r.best < 1e8).sort((a, b) => a.best - b.best).findIndex((r) => r.car.isPlayer) + 1;
    const score = computeScore({ position: p.pos, total: res.rows.length, overtakes: p.overtakes, bestLapRank: fastRank || 99, penaltySec: p.pen, clean: p.pen === 0 && p.strikes < 2 });
    const rr = submitResult(res.circuit, { bestLap: p.best, raceTime: p.finished ? p.total : null, laps: res.laps, position: p.pos, score });
    this.hud.lab.bestScore = Math.max(this.hud.lab.bestScore, score);
    this.resultExtra = { score, newBest: rr.newBestLap };
    this.hud.hide(); this.mode = 'results'; this.audio.playMusic('menu');
    this.ui.showResults(res, this.resultExtra);
  }

  showPodium() {
    const res = this.race.resultsData; const top = res.rows.filter((r) => r.finished).slice(0, 3); if (top.length < 3) { for (const r of res.rows) if (!top.includes(r) && top.length < 3) top.push(r); }
    this.podium = new PodiumScene(this.renderer, top); this.podium.resize(innerWidth, innerHeight); this.mode = 'podium';
    this.ui.showPodiumUI(res, top[0]); this.audio.playMusic('podium'); this.audio.fanfare(); this.audio.cheer(1.5);
    const p = res.rows.find((r) => r.car.isPlayer); if (p && p.pos <= 3) this.audio.radio(p.pos === 1 ? 'win' : 'podium');
  }

  _ensureSC() { if (this.sc) return; this.sc = buildSafetyCar(); this.scene.add(this.sc.group); }

  // ---------------------------------------------------------------- boucle
  loop(ts) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    try {
      if (this.mode === 'race' || this.mode === 'results') this.frameRace(dt);
      else if (this.mode === 'podium' && this.podium) { this.podium.update(dt, this.audio); this.renderer.render(this.podium.scene, this.podium.camera); }
    } catch (e) { showError(e); }
  }

  frameRace(dt) {
    const race = this.race; if (!race) return; const p = race.player, V = p.v, hud = this.hud, input = this.input;
    if (this.mode === 'race' && !this.paused) {
      // ---- entrée
      const rd = input.read(dt); race.playerInput = rd;
      // ---- séquence de départ
      if (race.phase === 'grid') { this.gridT += dt; if (this.gridT > 4.5 && !this.started) { this.started = true; race.startSequence(); } }
      // ---- simulation à pas fixe
      this.acc += dt; let n = 0; const H = 1 / 120;
      while (this.acc >= H && n < 14) { race.step(H); race.checkEnd(); this.acc -= H; n++; }
      if (n >= 14) this.acc = 0;
    } else if (this.mode === 'results') { this.acc += dt; let n = 0; const H = 1 / 120; while (this.acc >= H && n < 14) { race.step(H); this.acc -= H; n++; } if (n >= 14) this.acc = 0; }
    const t = performance.now() / 1000;
    // ---- scène
    const rain = race.wet.rain, wet = race.wet.wetness; this._wxT = (this._wxT || 0) - dt; if (this._wxT <= 0) { this._wxT = 0.25; this.world.setWeather(rain, wet); }
    this._updateCars(dt, rain, wet);
    this._updateObstacles(dt);
    this._updateCrews(dt);
    this._updateCamera(dt);
    const bl = {}; for (const c of race.cars) if (c.status === 'pit' && (c.pit.phase === 'service' || c.pit.phase === 'release')) bl[c.pit.boxK] = c.pit.light === 'green' ? '#19d24a' : '#ff1a1a';
    const flagAt = (s) => { if (race.neutral === 'red') return 'red'; const sec = Math.min(2, Math.floor(race.track.wrapS(s) / (race.track.L / 3))); const f = race.sectorFlags[sec]; if (f === 'yellow' || f === 'double') return 'yellow'; if (race.neutral === 'sc' || race.neutral === 'vsc' || race.neutral === 'sc_in') return 'yellow'; if (race.phase === 'finish') return 'green'; return 'none'; };
    this.world.update(dt, { camera: this.camera, focus: V, speed: V.u, heading: V.phi, pitExitLight: race.pitExitLight, boxLights: bl });
    this._mt = (this._mt || 0) - dt; if (this._mt <= 0) { this._mt = 0.06; this.world.updateMarshals(0.06, flagAt); }
    this.fx.update(dt);
    if (this.debugOn) this._drawDebug(); else if (this.debugObjs) this.debugObjs.visible = false;
    // ---- audio
    this.audio.update(dt, p, race.cars, { rain, wetness: wet, camMode: this.camMode === 1 ? 'cockpit' : 'out', crowdLevel: race.phase === 'finish' ? 0.5 : 0.2 });
    // ---- effets plein écran
    const sp = clamp(V.u / 95, 0, 1); const fxOn = settings.motionBlur && !settings.reduceMotion;
    this.lines.style.opacity = fxOn ? clamp((sp - 0.55) * 1.3, 0, 0.55) * (V.deploying ? 1.4 : 1) : 0; this.vig.style.opacity = 0.5 + sp * 0.5;
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'race') hud.update(dt, { trackTemp: rain > 0.1 ? 22 : 38, target: this._labTarget(), liveScore: 0 });
    void t;
  }
  _labTarget() { const r = this.race; const sorted = r.sortedCars(); const i = sorted.indexOf(r.player); return sorted[Math.max(0, i - 1)] !== r.player ? sorted[Math.max(0, i - 1)] : sorted[i + 1]; }

  _updateCars(dt, rain, wet) {
    const race = this.race, cam = this.camera, fx = this.fx;
    for (const c of race.cars) {
      const m = this.cars.get(c.id); if (!m) continue; m.update(c, dt, { rain: Math.max(rain, wet * 0.5) });
      const hide = c.status === 'removed' || (c.isPlayer && this.camMode === 1 && this.mode === 'race'); m.group.visible = c.status !== 'removed';
      // en cockpit, on masque le pilote du joueur pour ne pas bloquer la vue
      if (c.isPlayer && m.body) m.body.children.forEach((o) => { if (o.userData && o.userData.driver) o.visible = !(this.camMode === 1); });
      const d = Math.hypot(c.v.x - cam.position.x, c.v.z - cam.position.z);
      const sp = this.sprites.get(c.id); const show = !c.isPlayer && d < 150 && d > 6 && c.status !== 'removed' && this.camMode !== 1; sp.visible = show;
      if (show) { sp.position.set(c.v.x, 1.7 + d * 0.008, c.v.z); sp.material.opacity = clamp((150 - d) / 70, 0, 1) * 0.95; sp.scale.set(2.2 + d * 0.016, 0.55 + d * 0.004, 1); }
      void hide;
      // fumée / embruns / poussière
      if (d < 90 && c.status !== 'removed') {
        const V = c.v, u = V.u, bx = V.x - Math.cos(V.phi) * 2.4, bz = V.z - Math.sin(V.phi) * 2.4, vx = Math.cos(V.phi) * u, vz = Math.sin(V.phi) * u;
        if ((V.surfType === 'grass' || V.surfType === 'apron') && u > 10 && Math.random() < 0.5) fx.trail(bx, bz, vx * 0.3, vz * 0.3, 'dust', 1.2);
        if (wet > 0.25 && u > 30 && Math.random() < 0.5 * Math.min(1, u / 60)) fx.trail(bx, bz, vx * 0.1, vz * 0.1, 'spray', 1.1 + wet);
        const braking = V.controls.brake > 0.85 && u > 25 && V.sliding;
        if ((V.sliding && u > 12) || braking) { if (Math.random() < 0.6) fx.trail(V.x - Math.cos(V.phi) * 1.6, V.z - Math.sin(V.phi) * 1.6, vx * 0.05, vz * 0.05, 'smoke', 0.9); }
      }
    }
    if (this.sc && race.sc) { this.sc.update(race.sc, dt, performance.now() / 1000); this.sc.group.visible = race.neutral === 'sc' || race.neutral === 'sc_in'; }
  }

  _updateObstacles(dt) {
    const race = this.race, ids = new Set(); const t = performance.now() / 1000;
    for (const o of race.obstacles) {
      ids.add(o.id); let m = this.obMeshes.get(o.id);
      if (!m) {
        if (o.kind === 'lizard') { m = makeLizard(); m.group.rotation.order = 'YXZ'; this.scene.add(m.group); }
        else { const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6, metalness: 0.4 }); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2 + Math.random() * 0.5, 0.06 + Math.random() * 0.12, 0.15 + Math.random() * 0.4), i % 2 ? mat : new THREE.MeshStandardMaterial({ color: '#c01818', roughness: 0.5 })); b.position.set((Math.random() - 0.5) * 1.6, 0.05, (Math.random() - 0.5) * 1.6); b.rotation.y = Math.random() * 6; b.castShadow = true; g.add(b); } m = { group: g, update() {} }; this.scene.add(g); }
        this.obMeshes.set(o.id, m);
      }
      m.group.position.set(o.x, 0, o.z); if (o.kind === 'lizard') { m.group.rotation.y = -o.heading; m.update(t, 1.2); }
    }
    for (const [id, m] of this.obMeshes) if (!ids.has(id)) { this.scene.remove(m.group); this.obMeshes.delete(id); }
  }

  _updateCrews(dt) {
    const race = this.race; const active = new Set(); const t = performance.now() / 1000;
    for (const c of race.cars) {
      const ph = c.pit.phase; if (c.status !== 'pit' || (ph !== 'service' && ph !== 'release')) continue; active.add(c.id);
      let cr = this.crews.get(c.id); if (!cr) { cr = makePitCrew(c.teamId); this.scene.add(cr.group); this.crews.set(c.id, cr); }
      cr.group.visible = true; cr.group.position.set(c.v.x, 0, c.v.z); cr.group.rotation.y = -c.v.phi;
      const k = ph === 'service' ? clamp(c.pit.t / Math.max(0.1, c.pit.dur), 0, 1) : 1;
      for (const m of cr.crew) {
        const rig = m.rig, home = m.home;
        if (m.role === 'wheel') {
          const side = m.side; let pose = 'gun', off = 0;
          if (k < 0.12) { pose = 'idle'; off = 0.6; } else if (k < 0.32) { pose = 'gun'; } else if (k < 0.55) { pose = 'tyre'; off = (k - 0.32) / 0.23 * 1.4; } else if (k < 0.62) { pose = 'tyre'; off = 1.4 - (k - 0.55) / 0.07 * 1.0; } else if (k < 0.85) { pose = 'gun'; } else { pose = 'idle'; off = (k - 0.85) / 0.15 * 0.6; }
          rig.root.position.set(home.x, 0, home.z + side * off); rig.pose(pose, t * 1.3);
        } else if (m.role === 'jackF' || m.role === 'jackR') { rig.pose(k < 0.1 || k > 0.9 ? 'idle' : 'gun', t); }
        else if (m.role === 'lolli') { rig.pose(ph === 'release' && c.pit.light === 'green' ? 'idle' : 'lollipop', t); if (rig.sign) rig.sign.material.color.set(ph === 'release' && c.pit.light === 'green' ? '#19d24a' : '#ff1a1a'); if (rig.sign) rig.sign.visible = !(ph === 'release' && c.pit.light === 'green'); }
      }
      cr.spare.forEach((s, i) => { s.visible = k > 0.28 && k < 0.64; if (s.visible) { const front = i < 2; const side = i % 2 ? 1 : -1; const f = (k - 0.28) / 0.36; s.position.set(front ? 1.95 : -1.65, 0.2, side * (1.5 + f * 1.1)); s.rotation.set(Math.PI / 2, 0, 0); } });
    }
    for (const [id, cr] of this.crews) if (!active.has(id)) cr.group.visible = false;
  }

  _updateCamera(dt) {
    const race = this.race, p = race.player, V = p.v, cam = this.camera;
    const fwd = new THREE.Vector3(Math.cos(V.phi), 0, Math.sin(V.phi)); const u = Math.max(0, V.u);
    this.camPhi += wrap(V.phi - this.camPhi) * Math.min(1, dt * (this.camMode === 0 ? 5.5 : 8));
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shakeAmt = (settings.cameraShake && !settings.reduceMotion) ? this.shake * 0.25 + (V.surfType === 'kerb' ? 0.02 : 0) + clamp(u / 100, 0, 1) * 0.006 : 0;
    const cf = new THREE.Vector3(Math.cos(this.camPhi), 0, Math.sin(this.camPhi)), baseFov = 62 + clamp(u / 95, 0, 1) * 16 * settings.speedFov * (settings.reduceMotion ? 0.3 : 1);
    let pos = new THREE.Vector3(), look = new THREE.Vector3(), fov = baseFov;
    const target = new THREE.Vector3(V.x, 0, V.z);
    if (race.phase === 'grid' && !this.started || (race.phase === 'grid')) {
      // orbite d'intro autour de la voiture sur la grille
      const a = this.gridT * 0.35 + 0.5; const r = 7.5 - Math.min(2, this.gridT * 0.3); pos.set(V.x + Math.cos(V.phi + Math.PI * 0.8 + a * 0.7) * r, 1.6 + Math.sin(this.gridT * 0.4) * 0.3, V.z + Math.sin(V.phi + Math.PI * 0.8 + a * 0.7) * r); look.set(V.x + fwd.x * 1.2, 0.6, V.z + fwd.z * 1.2); fov = 48;
    } else if (this.camMode === 0) {
      const d = 7.2 + u * 0.012; pos.set(V.x - cf.x * d, 2.5 + u * 0.004, V.z - cf.z * d); look.set(V.x + cf.x * 7, 0.8, V.z + cf.z * 7);
    } else if (this.camMode === 1) {
      const cf2 = new THREE.Vector3(Math.cos(V.phi), 0, Math.sin(V.phi)); pos.set(V.x + cf2.x * 0.15, 0.86 + (V.heave || 0), V.z + cf2.z * 0.15); look.set(V.x + Math.cos(V.phi + V.steer * 0.25) * 12, 0.78, V.z + Math.sin(V.phi + V.steer * 0.25) * 12); fov = Math.min(95, baseFov + 14);
    } else if (this.camMode === 2) {
      pos.set(V.x - cf.x * 1.2, 1.55, V.z - cf.z * 1.2); look.set(V.x + cf.x * 14, 0.9, V.z + cf.z * 14); fov = baseFov + 4;
    } else {
      pos.set(V.x - cf.x * 26, 22, V.z - cf.z * 26); look.set(V.x + cf.x * 6, 0, V.z + cf.z * 6); fov = 55;
    }
    if (!this.camInit) { this.camPos.copy(pos); this.camInit = true; }
    const k = this.camMode === 0 || race.phase === 'grid' ? Math.min(1, dt * 14) : 1; this.camPos.lerp(pos, k);
    cam.position.copy(this.camPos);
    if (shakeAmt > 0) { cam.position.x += (Math.random() - 0.5) * shakeAmt; cam.position.y += (Math.random() - 0.5) * shakeAmt; cam.position.z += (Math.random() - 0.5) * shakeAmt; }
    const nearT = this.camMode === 1 ? 0.08 : 0.3; if (cam.near !== nearT) { cam.near = nearT; cam.updateProjectionMatrix(); }
    cam.lookAt(look); if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    if (this.mode === 'results') { const a = performance.now() / 4000; cam.position.set(V.x + Math.cos(a) * 9, 3, V.z + Math.sin(a) * 9); cam.lookAt(V.x, 0.6, V.z); }
    void target;
  }

  // ---------------------------------------------------------------- debug IA (capteurs, cibles)
  _drawDebug() {
    const race = this.race;
    if (!this.debugObjs) {
      this.debugObjs = new THREE.Group(); this.scene.add(this.debugObjs);
      this.dbgLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#27d3ff', depthTest: false, transparent: true })); this.dbgLines.frustumCulled = false; this.dbgLines.renderOrder = 20;
      this.dbgPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ffd400', size: 1.2, depthTest: false, sizeAttenuation: true })); this.dbgPts.frustumCulled = false; this.dbgPts.renderOrder = 21;
      this.dbgHit = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ff3b30', size: 1.8, depthTest: false })); this.dbgHit.frustumCulled = false; this.dbgHit.renderOrder = 21;
      this.debugObjs.add(this.dbgLines, this.dbgPts, this.dbgHit);
    }
    this.debugObjs.visible = true; const L = [], T = [], H = [];
    for (const c of race.cars) {
      if (c.status !== 'racing' || !c.ai) continue; const d = c.ai.debug; if (!d) continue; const V = c.v;
      if (d.target) { L.push(V.x, 0.5, V.z, d.target.x, 0.5, d.target.z); T.push(d.target.x, 0.5, d.target.z); }
      if (d.ahead) { const l = d.ahead.len || 20; L.push(V.x, 0.4, V.z, V.x + Math.cos(V.phi) * l, 0.4, V.z + Math.sin(V.phi) * l); }
      for (const s of d.sensors || []) (s.hit ? H : T).push(s.x, 0.6, s.z);
    }
    const set = (obj, a) => { obj.geometry.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); obj.geometry.computeBoundingSphere(); };
    set(this.dbgLines, L); set(this.dbgPts, T); set(this.dbgHit, H);
  }
}

// ---------------------------------------------------------------------- démarrage
const game = new Game(); window.__game = game;
profile.setup.vmax = profile.setup.vmax || DEFAULT_SETUP.vmax;
if (Q.has('quick')) {
  const cfg = { driverId: Q.get('driver') || profile.driverId, circuitId: Q.get('circuit') || profile.circuitId, ...JSON.parse(JSON.stringify(profile.setup)) };
  if (Q.get('laps')) cfg.laps = +Q.get('laps'); if (Q.get('drive')) cfg.drive = Q.get('drive'); if (Q.get('weather')) cfg.weather = Q.get('weather'); if (Q.get('grid')) cfg.gridPos = Q.get('grid'); if (Q.get('ai')) cfg.aiCount = +Q.get('ai'); if (Q.get('graphics')) settings.graphics = Q.get('graphics');
  game.startRace(cfg);
} else { game.ui.show('main', false); game.audio.playMusic && 0; }
