// =====================================================================
//  HUD (DOM) : vitesse, rapport, régime, tours, position, écarts, pneus, ERS, carburant,
//  dégâts, météo, drapeaux, radio sous-titrée, classement, mini-carte, panneau stands,
//  panneau « AI Lab » (VITESSE MAX, COMPLEXITÉ CIRCUIT, LARGEUR PISTE, Génération, Voitures en vie, Meilleur score)
// =====================================================================
import { settings } from './settings.js';
import { fmtTime, fmtGap } from './settings.js';
import { TYRES, FLAGS } from './data.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HUD {
  constructor(root, input) {
    this.root = root; this.input = input; this.acc = 0; this.mmDirty = true; this.toasts = [];
    this.lab = { open: false, generation: 1, bestScore: 0 };
    this.cb = {};
    root.innerHTML = `
    <div class="hud-board" id="hBoard" aria-label="Classement"></div>
    <div class="hud-top">
      <div class="hud-lap"><span class="k">TOUR</span> <b id="hLap">1/3</b> <span class="sep"></span> <span class="k">POS</span> <b id="hPos">P1</b><span class="of" id="hOf">/13</span></div>
      <div class="hud-flag" id="hFlag" hidden></div>
      <div class="hud-wx" id="hWx"></div>
    </div>
    <div class="hud-times" id="hTimes">
      <div class="row"><span class="k">S1</span><b id="hS1">--</b><span class="k">S2</span><b id="hS2">--</b><span class="k">S3</span><b id="hS3">--</b></div>
      <div class="row big"><span class="k">TOUR</span><b id="hCur">0:00.000</b></div>
      <div class="row"><span class="k">DERNIER</span><b id="hLast">--:--.---</b></div>
      <div class="row"><span class="k">MEILLEUR</span><b id="hBest">--:--.---</b></div>
      <div class="row"><span class="k">ÉCART AVANT</span><b id="hGapA">--</b><span class="k">ARRIÈRE</span><b id="hGapB">--</b></div>
    </div>
    <div class="hud-lights" id="hLights" hidden><i></i><i></i><i></i><i></i><i></i></div>
    <div class="hud-center-msg" id="hMsg" hidden></div>
    <div class="hud-dash">
      <div class="gear" id="hGear">N</div>
      <div class="spd"><b id="hSpd">0</b><span id="hUnit">km/h</span></div>
      <div class="rpm"><div class="rpmbar" id="hRpm"></div></div>
      <div class="pedals"><div class="ped t"><i id="hThr"></i></div><div class="ped b"><i id="hBrk"></i></div></div>
    </div>
    <div class="hud-car" id="hCar">
      <div class="tyre"><div class="tc" id="hTyre">M</div><div class="tinfo"><span class="k">PNEUS</span><div class="bar"><i id="hWear"></i></div><small id="hTemp"></small></div></div>
      <div class="meter"><span class="k">ERS</span><div class="bar ers"><i id="hErs"></i></div><small id="hBoost"></small></div>
      <div class="meter"><span class="k">CARBURANT</span><div class="bar"><i id="hFuel"></i></div><small id="hFuelT"></small></div>
      <div class="meter"><span class="k">DÉGÂTS</span><div class="bar dmg"><i id="hDmg"></i></div><small id="hAero"></small></div>
    </div>
    <canvas class="hud-map" id="hMap" width="220" height="220" aria-label="Mini-carte"></canvas>
    <div class="hud-radio" id="hRadio" hidden><span class="ch">RADIO</span><span id="hRadioT"></span></div>
    <div class="hud-toasts" id="hToasts" aria-live="polite"></div>
    <div class="hud-pit" id="hPit" hidden>
      <div class="ttl">STANDS <small id="hPitState"></small></div>
      <div class="tyres" id="hPitTyres"></div>
      <button id="hPitBtn" type="button">BOX (<span id="hPitKey">B</span>)</button>
    </div>
    <div class="hud-lab" id="hLab" hidden>
      <div class="ttl">AI LAB <button type="button" id="hLabX" aria-label="Fermer">×</button></div>
      <label>VITESSE MAX <b id="lVmaxV">340 km/h</b><input type="range" id="lVmax" min="200" max="380" step="5"></label>
      <label>COMPLEXITÉ CIRCUIT <b id="lCxV">0.55</b><input type="range" id="lCx" min="0.1" max="1" step="0.05"></label>
      <label>LARGEUR PISTE <b id="lWV">15 m</b><input type="range" id="lW" min="11" max="20" step="1"></label>
      <button type="button" id="lApply">Appliquer &amp; régénérer le circuit</button>
      <div class="stats">
        <div><span class="k">Génération</span><b id="lGen">1</b></div>
        <div><span class="k">Voitures en vie</span><b id="lAlive">13</b></div>
        <div><span class="k">Meilleur score</span><b id="lScore">0</b></div>
      </div>
      <label class="chk"><input type="checkbox" id="lDbg"> Voir capteurs &amp; cibles IA (G)</label>
      <pre id="lTelem" class="telem"></pre>
      <details><summary>Que signifient ces valeurs ?</summary>
      <p><b>Génération</b> : numéro de l'itération du circuit généré. <b>Voitures en vie</b> : voitures encore en course. <b>Meilleur score</b> : règle documentée dans le README (classement, dépassements, tour rapide, propreté, pénalités). Ce n'est pas un entraînement de réseau de neurones.</p></details>
    </div>
    <div class="hud-hint" id="hHint"></div>
    <div class="hud-pause" id="hPause" hidden>
      <div class="card"><h2>PAUSE</h2>
        <button type="button" data-a="resume">Reprendre</button><button type="button" data-a="restart">Recommencer</button>
        <button type="button" data-a="settings">Réglages</button><button type="button" data-a="menu">Menu principal</button>
        <p class="small" id="hPauseKeys"></p></div>
    </div>`;
    this.el = {}; root.querySelectorAll('[id]').forEach((e) => { this.el[e.id] = e; });
    this.map = this.el.hMap.getContext('2d');
    this.el.hLabX.onclick = () => this.toggleLab(false);
    this.el.hPause.addEventListener('click', (e) => { const a = e.target.dataset && e.target.dataset.a; if (a && this.cb.pause) this.cb.pause(a); });
    this.el.lVmax.oninput = () => { this.el.lVmaxV.textContent = this._spd(+this.el.lVmax.value / 3.6) + ' ' + this._unit(); if (this.cb.vmax) this.cb.vmax(+this.el.lVmax.value); };
    this.el.lCx.oninput = () => { this.el.lCxV.textContent = (+this.el.lCx.value).toFixed(2); };
    this.el.lW.oninput = () => { this.el.lWV.textContent = this.el.lW.value + ' m'; };
    this.el.lApply.onclick = () => this.cb.regen && this.cb.regen({ complexity: +this.el.lCx.value, width: +this.el.lW.value });
    this.el.lDbg.onchange = () => this.cb.debug && this.cb.debug(this.el.lDbg.checked);
    this.el.hPitBtn.onclick = () => this.cb.pit && this.cb.pit(this.pitTyre);
    this.pitTyre = null;
    this.el.hPitTyres.innerHTML = Object.values(TYRES).map((t) => `<button type="button" class="tb" data-t="${t.id}" style="--c:${t.color}" title="${t.name}">${t.id}</button>`).join('');
    this.el.hPitTyres.onclick = (e) => { const t = e.target.dataset && e.target.dataset.t; if (t) { this.setPitTyre(t); this.cb.tyre && this.cb.tyre(t); } };
    this.hide();
  }

  _unit() { return settings.units === 'mph' ? 'mph' : 'km/h'; }
  _spd(ms) { return Math.round(ms * (settings.units === 'mph' ? 2.23694 : 3.6)); }

  show() { this.root.hidden = false; this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); this.root.hidden = true; }

  /** configure pour une course */
  setup(race, track, opts = {}) {
    this.race = race; this.track = track; this.player = race.player; this.lab.bestScore = opts.bestScore || 0; this.lab.generation = opts.generation || 1;
    this.el.hOf.textContent = '/' + race.cars.length;
    this.el.lVmax.value = Math.round(race.vmax * 3.6); this.el.lVmaxV.textContent = this._spd(race.vmax) + ' ' + this._unit();
    this.el.lCx.value = opts.complexity ?? 0.55; this.el.lCxV.textContent = (+this.el.lCx.value).toFixed(2);
    this.el.lW.value = opts.width ?? 15; this.el.lWV.textContent = this.el.lW.value + ' m';
    this.el.lGen.textContent = this.lab.generation;
    this.el.hPit.hidden = race.cfg.mode === 'timetrial';
    this.el.hBoard.hidden = race.cfg.mode === 'timetrial';
    this.el.hPitKey.textContent = this.input ? this.input.glyph('pit') : 'B';
    this.setPitTyre(null);
    this.mmDirty = true; this.rows = null; this.el.hToasts.innerHTML = ''; this.el.hRadio.hidden = true; this.el.hMsg.hidden = true;
    this.el.hPause.hidden = true; this.el.hFlag.hidden = true; this.lastLap = 0;
    this._buildMap();
    const keys = this.input;
    this.el.hHint.innerHTML = race.cfg.drive === 'auto'
      ? `<b>MODE AUTO</b> — l'IA conduit · <kbd>T</kbd> reprendre la main · <kbd>C</kbd> caméra · <kbd>Échap</kbd> pause`
      : `<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> ou <kbd>WASD</kbd> · <kbd>Espace</kbd> boost · <kbd>C</kbd> caméra · <kbd>B</kbd> stand · <kbd>Échap</kbd> pause`;
    this.hintT = 12;
  }

  setPitTyre(t) { this.pitTyre = t; this.el.hPitTyres.querySelectorAll('.tb').forEach((b) => b.classList.toggle('sel', b.dataset.t === t)); }
  toggleLab(v) { this.lab.open = v ?? !this.lab.open; this.el.hLab.hidden = !this.lab.open; }
  setPaused(v) { this.el.hPause.hidden = !v; if (v) this.el.hPauseKeys.textContent = `Pause : ${this.input ? this.input.glyph('pause') : 'Échap'}`; }

  // ----------------------------------------------------------------- événements
  light(n) { const ls = this.el.hLights; ls.hidden = false; [...ls.children].forEach((i, k) => i.classList.toggle('on', k < n)); }
  lightsOut() { const ls = this.el.hLights; [...ls.children].forEach((i) => i.classList.remove('on')); setTimeout(() => { ls.hidden = true; }, 900); this.message('GO !', 'go', 1.3); }
  message(text, cls = '', secs = 2.2) {
    const m = this.el.hMsg; m.hidden = false; m.className = 'hud-center-msg ' + cls; m.textContent = text; clearTimeout(this._mt); this._mt = setTimeout(() => { m.hidden = true; }, secs * 1000);
  }
  radio(text, secs = 4) {
    if (!settings.subtitles) return;
    this.el.hRadio.hidden = false; this.el.hRadioT.textContent = text; clearTimeout(this._rt); this._rt = setTimeout(() => { this.el.hRadio.hidden = true; }, secs * 1000);
  }
  toast(text, kind = 'info', secs = 3.6) {
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text; this.el.hToasts.appendChild(d);
    while (this.el.hToasts.children.length > 5) this.el.hToasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, secs * 1000);
  }

  // ----------------------------------------------------------------- mini-carte
  _buildMap() {
    const tr = this.track, b = tr.bounds(), W = 220, H = 220, pad = 14;
    const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    this.mm = { sc, ox: pad + ((W - pad * 2) - (b.maxX - b.minX) * sc) / 2 - b.minX * sc, oz: pad + ((H - pad * 2) - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc };
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const pts = tr.outline(3);
    const path = () => { g.beginPath(); pts.forEach((p, i) => { const x = p[0] * sc + this.mm.ox, y = p[1] * sc + this.mm.oz; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
    g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 9; path(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; path(); g.stroke();
    // ligne départ
    const p0 = tr.posAt(0, 0, {}); g.strokeStyle = '#e10600'; g.lineWidth = 3; g.beginPath(); g.moveTo((p0.cx + p0.nx * 8) * sc + this.mm.ox, (p0.cz + p0.nz * 8) * sc + this.mm.oz); g.lineTo((p0.cx - p0.nx * 8) * sc + this.mm.ox, (p0.cz - p0.nz * 8) * sc + this.mm.oz); g.stroke();
    // voie des stands
    g.strokeStyle = 'rgba(80,170,255,.9)'; g.lineWidth = 2; g.beginPath(); tr.pitPath.forEach((p, i) => { const x = p.x * sc + this.mm.ox, y = p.z * sc + this.mm.oz; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    this.mapBase = c;
  }
  _drawMap() {
    const g = this.map, r = this.race, mm = this.mm; if (!this.mapBase) return;
    g.clearRect(0, 0, 220, 220); g.drawImage(this.mapBase, 0, 0);
    for (const c of r.cars) {
      if (c.status === 'removed') continue;
      const x = c.v.x * mm.sc + mm.ox, y = c.v.z * mm.sc + mm.oz;
      g.fillStyle = c.isPlayer ? '#ffd400' : c.status === 'retired' ? '#777' : c.team.accent === '#ffffff' || c.team.accent === '#101010' ? c.team.body : c.team.accent;
      g.beginPath(); g.arc(x, y, c.isPlayer ? 5 : 3.2, 0, 6.283); g.fill();
      if (c.isPlayer) { g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); }
    }
    for (const o of r.obstacles) { g.fillStyle = o.kind === 'lizard' ? '#6bff4f' : '#ff9a00'; g.beginPath(); g.arc(o.x * mm.sc + mm.ox, o.z * mm.sc + mm.oz, 3, 0, 6.283); g.fill(); }
  }

  // ----------------------------------------------------------------- mise à jour
  update(dt, extra = {}) {
    this.acc += dt; if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.el.hHint.classList.add('off'); }
    if (this.acc < 0.033) return; const d = this.acc; this.acc = 0;
    const r = this.race, p = this.player, V = p.v, e = this.el;
    document.documentElement.style.setProperty('--hud-scale', settings.textSize);
    // tableau de bord
    e.hSpd.textContent = this._spd(Math.max(0, V.u)); e.hUnit.textContent = this._unit();
    e.hGear.textContent = p.status === 'grid' && V.u < 0.5 ? 'N' : (V.gear || 'N');
    const rp = clamp((V.rpm - 7000) / 8000, 0, 1); e.hRpm.style.width = (rp * 100).toFixed(0) + '%'; e.hRpm.classList.toggle('red', rp > 0.9);
    e.hThr.style.height = (V.controls.throttle * 100).toFixed(0) + '%'; e.hBrk.style.height = (V.controls.brake * 100).toFixed(0) + '%';
    // voiture
    const tc = TYRES[V.tyre.compound]; e.hTyre.textContent = V.tyre.compound; e.hTyre.style.setProperty('--c', tc.color);
    e.hWear.style.width = (100 - V.tyre.wear).toFixed(0) + '%'; e.hWear.className = V.tyre.wear > 75 ? 'bad' : V.tyre.wear > 50 ? 'mid' : '';
    e.hTemp.textContent = `${Math.round(V.tyre.temp)}°C · usure ${Math.round(V.tyre.wear)}%`;
    e.hErs.style.width = (V.battery / 4 * 100).toFixed(0) + '%'; e.hBoost.textContent = V.deploying ? 'BOOST ACTIF' : `${this.input ? this.input.glyph('boost') : 'Espace'} = boost`; e.hBoost.classList.toggle('act', V.deploying);
    const fuelMax = 14 + r.laps * 2.2; e.hFuel.style.width = clamp(V.fuel / fuelMax * 100, 0, 100).toFixed(0) + '%'; e.hFuelT.textContent = V.fuel.toFixed(1) + ' kg';
    e.hDmg.style.width = V.damage.toFixed(0) + '%'; e.hAero.textContent = 'Aéro : ' + (V.aeroMode === 'straight' ? 'ligne droite' : 'virage') + ' (prov.)';
    // tours / position
    const lapNo = Math.min(r.laps, p.lapsDone + 1); e.hLap.textContent = `${lapNo}/${r.laps}`;
    e.hPos.textContent = 'P' + p.pos;
    const cur = r.clock - p.lapStart; e.hCur.textContent = p.status === 'grid' ? '0:00.000' : fmtTime(Math.max(0, cur));
    e.hLast.textContent = fmtTime(p.last); e.hBest.textContent = fmtTime(p.best < 1e8 ? p.best : null);
    for (let i = 0; i < 3; i++) { const t = p.sectors[i]; const el = e['hS' + (i + 1)]; el.textContent = t ? t.toFixed(2) : '--'; el.className = t && t <= p.bestSectors[i] + 1e-6 ? 'pb' : ''; }
    const ga = r.gapAhead(p), gb = r.gapBehind(p); e.hGapA.textContent = ga === null ? '—' : '-' + ga.toFixed(1) + 's'; e.hGapB.textContent = gb === null ? '—' : '+' + gb.toFixed(1) + 's';
    // météo
    const w = r.wet; e.hWx.textContent = w.rain > 0.1 ? (w.rain > 0.5 ? '🌧 PLUIE FORTE' : '🌦 PLUIE') + ` · piste ${Math.round(w.wetness * 100)}% mouillée` : w.wetness > 0.15 ? `Piste humide ${Math.round(w.wetness * 100)}%` : 'Sec · piste ' + Math.round(extra.trackTemp || 38) + '°C';
    // drapeau principal
    let fl = null;
    if (r.neutral === 'red') fl = 'red'; else if (r.neutral === 'sc' || r.neutral === 'sc_in') fl = 'sc'; else if (r.neutral === 'vsc') fl = 'vsc';
    else if (r.phase === 'finish' || p.finished) fl = 'chequered';
    else if (r.blueFor.has(p.id)) fl = 'blue';
    else { const sec = Math.min(2, Math.floor(p.proj.s / (r.track.L / 3))); const sf = r.sectorFlags[sec]; if (sf === 'double') fl = 'double'; else if (sf === 'yellow') fl = 'yellow'; else if (sf === 'white') fl = 'white'; else if (sf === 'surface') fl = 'surface'; }
    if (!fl && r.phase === 'go') fl = 'green';
    if (fl !== this.lastFlag) {
      this.lastFlag = fl; const f = e.hFlag;
      if (fl) { const F = FLAGS[fl]; f.hidden = false; f.style.setProperty('--c', F.color); f.className = 'hud-flag ' + fl; f.innerHTML = `<i>${F.symbol}</i><b>${F.label}</b><small>${F.fr}</small>`; } else f.hidden = true;
    }
    // classement
    this._board(); this._drawMap();
    // stands
    const pp = p.pit; const st = pp.phase ? ({ entry: 'entrée…', service: 'ARRÊT', release: 'prêt', exit: 'sortie' }[pp.phase]) : pp.request ? 'demandé ✔' : '';
    e.hPitState.textContent = st; e.hPitBtn.classList.toggle('on', !!pp.request); e.hPit.classList.toggle('active', !!pp.request || !!pp.phase);
    if (pp.tyre && this.pitTyre !== pp.tyre) this.setPitTyre(pp.tyre);
    // AI Lab
    if (this.lab.open) this._labUpdate(extra);
  }

  _board() {
    const r = this.race, list = r.sortedCars(), box = this.el.hBoard; if (box.hidden) return;
    if (!this.rows || this.rows.length !== list.length) { box.innerHTML = list.map(() => '<div class="r"><i class="p"></i><i class="tm"></i><b class="c"></b><span class="g"></span><em class="ty"></em></div>').join(''); this.rows = [...box.children]; }
    const lead = list[0];
    list.forEach((c, i) => {
      const row = this.rows[i], ch = row.children; ch[0].textContent = i + 1; ch[1].style.background = c.team.accent === '#ffffff' || c.team.accent === '#101010' ? c.team.body : c.team.accent;
      ch[2].textContent = c.driver.code; const cls = 'r' + (c.isPlayer ? ' me' : '') + (c.status === 'retired' ? ' out' : '') + (c.status === 'pit' ? ' pit' : ''); if (row.className !== cls) row.className = cls;
      let g = '';
      if (c.status === 'retired') g = 'OUT'; else if (c.status === 'pit') g = 'STAND'; else if (c.finished) g = 'ARR.';
      else if (i === 0) g = 'TOUR ' + Math.min(r.laps, c.lapsDone + 1); else { const gap = (lead.dist - c.dist); g = gap > r.track.L * 0.97 ? '+' + Math.floor(gap / r.track.L + 0.03) + ' T' : '+' + (gap / Math.max(c.v.u, 30)).toFixed(1); }
      ch[3].textContent = g; ch[4].textContent = c.v.tyre.compound; ch[4].style.setProperty('--c', TYRES[c.v.tyre.compound].color);
    });
  }

  _labUpdate(extra) {
    const r = this.race, e = this.el, alive = r.cars.filter((c) => c.status === 'racing' || c.status === 'pit' || c.status === 'grid' || (c.finished && c.status !== 'retired')).length;
    e.lAlive.textContent = `${alive}/${r.cars.length}`; e.lGen.textContent = this.lab.generation; e.lScore.textContent = Math.max(this.lab.bestScore, extra.liveScore || 0);
    const p = this.player, V = p.v, a = p.ai, T = a && a.debug;
    const tg = extra.target || r.cars.find((c) => c !== p && c.status === 'racing');
    const t = tg && tg.ai ? tg.ai.debug : null;
    e.lTelem.textContent = [
      `Joueur  v=${(V.u * 3.6).toFixed(0)} km/h  lat=${(V.v).toFixed(1)}  lacet=${V.r.toFixed(2)}`,
      `Piste   s=${p.proj.s.toFixed(0)} m  d=${p.proj.d.toFixed(1)} m  surf=${V.surfType || '-'}`,
      `Grip    μ=${(V.muNow || 0).toFixed(2)}  glisse=${V.sliding ? 'oui' : 'non'}`,
      tg ? `IA ${tg.driver.code}  état=${t ? t.state : '-'}  vCible=${tg.ai && tg.ai.vTarget ? (tg.ai.vTarget * 3.6).toFixed(0) : '-'} km/h  capteurs=${t ? t.sensors.length : 0}` : '',
      `Stratégies (PDF) : Path Following · Seek/Arrive (virages) · Pursuit/Evade (dépassement) · Separation · Obstacle avoidance`,
    ].filter(Boolean).join('\n');
  }
}
