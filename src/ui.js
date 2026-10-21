// =====================================================================
//  UI : menus (accueil, pilote, circuit, réglages de course, chargement, options, commandes,
//  à propos / état du projet, résultats, podium). Navigation clavier, souris et manette.
// =====================================================================
import { DRIVERS, CIRCUITS, TEAMS, TYRES, DEFAULT_SETUP, driverById, circuitById } from './data.js';
import { settings, saveSettings, resetSettings, profile, saveProfile, getRecord, fmtTime } from './settings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE = 'assets/';

export class UI {
  constructor(root, input, audio) {
    this.root = root; this.input = input; this.audio = audio; this.screen = null; this.stack = []; this.cb = {};
    root.addEventListener('click', (e) => this._click(e));
    root.addEventListener('input', (e) => this._input(e));
    root.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('[data-nav]'); if (b && b !== this._lastHover) { this._lastHover = b; this.audio && this.audio.sfx('hover'); } });
    input.onAction((a) => this._action(a));
  }

  get setup() { return profile.setup; }

  // --------------------------------------------------------------- navigation
  show(name, push = true) {
    if (push && this.screen && this.screen !== name) this.stack.push(this.screen);
    this.screen = name; this.root.hidden = false; this.root.dataset.screen = name;
    const fn = this['_s_' + name]; this.root.innerHTML = `<div class="screen s-${name}">${fn.call(this)}</div>`;
    this._afterRender(name);
    const first = this.root.querySelector('[data-nav].sel, [data-nav]'); if (first) first.focus({ preventScroll: true });
    if (name === 'drivers') this._drawDriverHero();
  }
  back() { this.audio && this.audio.sfx('back'); const prev = this.stack.pop(); if (prev) this.show(prev, false); else this.show('main', false); }
  hide() { this.root.hidden = true; this.screen = null; this.stack = []; this.root.innerHTML = ''; }
  active() { return !this.root.hidden; }

  _action(a) {
    if (this.root.hidden) return;
    if (a.startsWith('nav:')) {
      const dir = a.slice(4);
      if (dir === 'back') { if (this.screen !== 'main' && this.screen !== 'loading' && this.screen !== 'podium') this.back(); return; }
      if (dir === 'ok') { const f = document.activeElement; if (f && f.dataset && f.dataset.nav !== undefined) f.click(); return; }
      this._move(dir);
    }
  }
  _move(dir) {
    const els = [...this.root.querySelectorAll('[data-nav]')].filter((e) => e.offsetParent !== null); if (!els.length) return;
    const cur = document.activeElement && els.includes(document.activeElement) ? document.activeElement : els[0];
    if (cur !== document.activeElement) { cur.focus(); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bs = 1e18;
    for (const e of els) {
      if (e === cur) continue; const q = e.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const along = dir === 'up' ? -y : dir === 'down' ? y : dir === 'left' ? -x : x, across = dir === 'up' || dir === 'down' ? Math.abs(x) : Math.abs(y);
      if (along <= 4) continue; const sc = along + across * 2.2; if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); this.audio && this.audio.sfx('hover'); }
    else if ((dir === 'left' || dir === 'right') && cur.matches('input[type=range]')) { cur.stepUp(dir === 'right' ? 1 : -1); cur.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  _click(e) {
    const t = e.target.closest('[data-do]'); if (!t) return;
    this.audio && this.audio.unlock(); const a = t.dataset.do, v = t.dataset.v;
    this.audio && this.audio.sfx(a === 'back' ? 'back' : 'click');
    switch (a) {
      case 'go': this.show(v); break;
      case 'back': this.back(); break;
      case 'quick': this.cb.start && this.cb.start(this._cfg()); break;
      case 'driver': profile.driverId = v; saveProfile(); this.root.querySelectorAll('.dcard').forEach((c) => c.classList.toggle('sel', c.dataset.v === v)); this._drawDriverHero(); this.audio && this.audio.sfx('confirm'); break;
      case 'circuit': profile.circuitId = v; saveProfile(); this.root.querySelectorAll('.ccard').forEach((c) => c.classList.toggle('sel', c.dataset.v === v)); this._circuitPreview(); this.audio && this.audio.sfx('confirm'); break;
      case 'opt': { const [k, val] = v.split('='); const cur = this.setup[k]; this.setup[k] = typeof DEFAULT_SETUP[k] === 'number' ? +val : (val === 'true' ? true : val === 'false' ? false : val); saveProfile(); this._refreshOpts(); void cur; break; }
      case 'start': this.cb.start && this.cb.start(this._cfg()); break;
      case 'reset-settings': resetSettings(); this.show('settings', false); break;
      case 'podium': this.cb.podium && this.cb.podium(); break;
      case 'again': this.cb.again && this.cb.again(); break;
      case 'menu': this.cb.menu && this.cb.menu(); break;
      case 'results': this.cb.results && this.cb.results(); break;
      case 'fullscreen': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); break;
    }
  }
  _input(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.set) { const k = t.dataset.set; const val = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value; settings[k] = val; saveSettings(); const o = t.parentElement.querySelector('output'); if (o) o.textContent = t.type === 'range' ? (+t.value).toFixed(2) : ''; this.cb.settings && this.cb.settings(k, val); }
    if (t.dataset.setup) { const k = t.dataset.setup; this.setup[k] = +t.value; saveProfile(); const o = t.parentElement.querySelector('output'); if (o) o.textContent = t.value + (t.dataset.unit || ''); }
  }
  _cfg() { const s = this.setup; return { driverId: profile.driverId, circuitId: profile.circuitId, ...JSON.parse(JSON.stringify(s)) }; }
  _refreshOpts() { if (this.screen === 'setup') this.show('setup', false); }

  _afterRender(name) { if (name === 'circuits') this._circuitPreview(); }

  // --------------------------------------------------------------- écrans
  _s_main() {
    const d = driverById(profile.driverId), c = circuitById(profile.circuitId);
    return `
    <div class="bg" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil"></div>
    <header class="brand"><div class="logo"><span class="sl"></span><span class="t1">GRAND PRIX</span><span class="t2">2026</span></div><p>Jeu de course monoplace · prototype jouable · navigateur</p></header>
    <nav class="menu">
      <button class="big" data-nav data-do="go" data-v="drivers"><i>✕</i><span><b>JOUER</b><small>Choisir un pilote et un circuit</small></span><em>›</em></button>
      <button data-nav data-do="quick"><span><b>COURSE RAPIDE</b><small>${esc(d.last)} · ${esc(c.name)}</small></span><em>›</em></button>
      <button data-nav data-do="go" data-v="setup"><span><b>RÉGLAGES DE COURSE</b><small>Tours, météo, IA, AI Lab</small></span><em>›</em></button>
      <button data-nav data-do="go" data-v="settings"><span><b>PARAMÈTRES</b><small>Graphismes, son, accessibilité</small></span><em>›</em></button>
      <button data-nav data-do="go" data-v="controls"><span><b>COMMANDES</b><small>Clavier et manette PlayStation</small></span><em>›</em></button>
      <button data-nav data-do="go" data-v="about"><span><b>À PROPOS · ÉTAT DU PROJET</b><small>Ce qui est fait, testé, prévu</small></span><em>›</em></button>
    </nav>
    <footer class="foot"><span>SAISON 2026</span><span class="keys"><kbd>↑↓</kbd> naviguer <kbd>Entrée</kbd> valider <kbd>Échap</kbd> retour</span></footer>`;
  }

  _s_drivers() {
    const cards = DRIVERS.filter((d) => d.selectable).map((d) => {
      const T = TEAMS[d.team];
      return `<button class="dcard ${d.id === profile.driverId ? 'sel' : ''}" data-nav data-do="driver" data-v="${d.id}" style="--tc:${T.body === '#15191c' || T.body === '#16215c' ? T.glow : T.body};--ta:${T.glow}">
        <span class="thumb" style="background-image:url(${BASE}ui/${d.img})"></span><span class="meta"><b>${esc(d.first)} ${esc(d.last.toUpperCase())}</b><small>#${d.number} · ${esc(T.short)}</small></span></button>`;
    }).join('');
    return `
    <div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">CHOISIR LE PILOTE</h1>
    <div class="drv-layout">
      <div class="hero" id="drvHero"><div class="art" id="drvArt"></div><div class="info" id="drvInfo"></div></div>
      <div class="grid4">${cards}</div>
    </div>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button><button class="primary" data-nav data-do="go" data-v="circuits">CHOISIR LE CIRCUIT ›</button></div>`;
  }
  _drawDriverHero() {
    const d = driverById(profile.driverId), art = this.root.querySelector('#drvArt'), info = this.root.querySelector('#drvInfo'); if (!art) return;
    const T = TEAMS[d.team]; art.style.backgroundImage = `url(${BASE}ui/${d.img})`; art.style.setProperty('--tc', T.glow);
    const rec = getRecord(profile.circuitId);
    info.innerHTML = `<div class="first">${esc(d.first.toUpperCase())}</div><div class="last">${esc(d.last.toUpperCase())}</div><div class="num">${d.number}</div><div class="team">${esc(T.name.toUpperCase())}</div>
      <div class="chips"><span>Talent ${(d.skill * 100).toFixed(0)}</span><span>${esc(d.nat)}</span><span>Victoires ${rec.wins}</span></div>`;
  }

  _s_circuits() {
    const cards = CIRCUITS.map((c) => `
      <button class="ccard ${c.id === profile.circuitId ? 'sel' : ''}" data-nav data-do="circuit" data-v="${c.id}">
        <span class="img" style="${c.thumb ? `background-image:url(${BASE}circuits/${c.thumb})` : 'background:linear-gradient(135deg,#232a3a,#0e1320)'}">${c.thumb ? '' : '<i>AI LAB</i>'}</span>
        <b>${esc(c.name)}</b><small>${esc(c.flag)} · ${c.realKm ? c.realKm + ' km réels' : 'généré'}</small></button>`).join('');
    return `
    <div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">CHOISIR LE CIRCUIT</h1>
    <p class="sub">Tracés <b>stylisés</b> inspirés des circuits (non officiels, longueur de jeu réduite) · choix libre</p>
    <div class="cir-layout"><div class="grid5">${cards}</div><div class="preview" id="cirPrev"></div></div>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button><button class="primary" data-nav data-do="go" data-v="setup">RÉGLAGES DE COURSE ›</button></div>`;
  }
  _circuitPreview() {
    const el = this.root.querySelector('#cirPrev'); if (!el) return; const c = circuitById(profile.circuitId), rec = getRecord(c.id);
    el.style.backgroundImage = c.big ? `url(${BASE}circuits/${c.big})` : 'linear-gradient(135deg,#1b2336,#0b0f19)';
    el.innerHTML = `<div class="shade"></div><div class="txt"><h2>${esc(c.name.toUpperCase())}</h2><p>${esc(c.country)} · ${esc(c.type)}</p>
      <div class="chips"><span>Longueur de jeu ${c.gameKm} km</span><span>Difficulté ${'★'.repeat(c.difficulty)}${'☆'.repeat(5 - c.difficulty)}</span><span>Record tour ${fmtTime(rec.bestLap)}</span><span>Meilleur score ${rec.bestScore}</span></div></div>`;
  }
  _s_setup() {
    const s = this.setup, opt = (k, v, label) => `<button data-nav class="seg ${String(s[k]) === String(v) ? 'on' : ''}" data-do="opt" data-v="${k}=${v}">${label}</button>`;
    const row = (label, inner, hint = '') => `<div class="orow"><div class="ol">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="segs">${inner}</div></div>`;
    const c = circuitById(profile.circuitId);
    const slider = (label, key, min, max, step, unit, hint) => `<label class="orow sl"><div class="ol">${label}<small>${hint}</small></div><span class="segs"><input data-nav type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-setup="${key}" data-unit="${unit}"><output>${s[key]}${unit}</output></span></label>`;
    return `
    <div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">RÉGLAGES DE COURSE <small>${esc(driverById(profile.driverId).last)} · ${esc(c.name)}</small></h1>
    <div class="opts">
      ${row('MODE', opt('mode', 'race', 'COURSE') + opt('mode', 'timetrial', 'CONTRE-LA-MONTRE'), 'Qualifs / essais / sprint : prévus')}
      ${row('CONDUITE', opt('drive', 'manual', 'MANUEL') + opt('drive', 'auto', 'AUTO (IA conduit)'), 'AUTO = démo autopilote')}
      ${row('TOURS', [1, 2, 3, 5, 8].map((n) => opt('laps', n, n)).join(''))}
      ${row('DIFFICULTÉ IA', opt('difficulty', 'easy', 'FACILE') + opt('difficulty', 'medium', 'MOYEN') + opt('difficulty', 'hard', 'DIFFICILE'))}
      ${row('AIDES', opt('assists', 'none', 'AUCUNE') + opt('assists', 'standard', 'STANDARD') + opt('assists', 'full', 'COMPLÈTES'))}
      ${row('MÉTÉO', opt('weather', 'dry', 'SEC') + opt('weather', 'wet', 'PLUIE') + opt('weather', 'variable', 'VARIABLE'))}
      ${row('PNEU DE DÉPART', Object.values(TYRES).map((t) => opt('startTyre', t.id, t.id + ' · ' + t.name)).join(''))}
      ${row('POSITION DE DÉPART', opt('gridPos', 'pole', 'POLE') + opt('gridPos', 'mid', 'MILIEU') + opt('gridPos', 'back', 'FOND'))}
      ${row('LÉZARD SURPRISE', opt('lizard', true, 'OUI') + opt('lizard', false, 'NON'), 'Animal qui traverse')}
      ${row('RÈGLES', opt('rules', 'standard', 'STANDARD') + opt('rules', 'advanced', 'STRICTES'), 'Pénalités limites de piste')}
      <h3>AI LAB</h3>
      ${slider('VITESSE MAX', 'vmax', 200, 380, 5, ' km/h', 'Plafond de vitesse de toutes les voitures')}
      ${slider('COMPLEXITÉ CIRCUIT', 'complexity', 0.1, 1, 0.05, '', 'Circuit généré uniquement')}
      ${slider('LARGEUR PISTE', 'width', 11, 20, 1, ' m', 'Valable pour tous les circuits')}
      ${slider('GRAINE (seed)', 'seed', 1, 9999, 1, '', 'Reproductibilité du circuit généré')}
    </div>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button><button class="primary go" data-nav data-do="start">LANCER LA COURSE ›</button></div>`;
  }

  _s_loading() { return `<div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div><div class="loading"><h1>CHARGEMENT</h1><div class="lbar"><i id="lbar"></i></div><p id="ltxt">Préparation…</p><p class="tip" id="ltip"></p></div>`; }
  setLoading(p, txt) { const b = this.root.querySelector('#lbar'), t = this.root.querySelector('#ltxt'); if (b) b.style.width = Math.round(p * 100) + '%'; if (t) t.textContent = txt; }
  setTip(txt) { const t = this.root.querySelector('#ltip'); if (t) t.textContent = txt; }

  _s_settings() {
    const S = settings, rng = (k, label, min = 0, max = 1, step = 0.05) => `<label class="orow sl"><div class="ol">${label}</div><span class="segs"><input data-nav type="range" min="${min}" max="${max}" step="${step}" value="${S[k]}" data-set="${k}"><output>${(+S[k]).toFixed(2)}</output></span></label>`;
    const chk = (k, label, hint = '') => `<label class="orow"><div class="ol">${label}<small>${hint}</small></div><span class="segs"><input data-nav type="checkbox" ${S[k] ? 'checked' : ''} data-set="${k}"></span></label>`;
    const sel = (k, label, opts) => `<label class="orow"><div class="ol">${label}</div><span class="segs"><select data-nav data-set="${k}">${opts.map(([v, l]) => `<option value="${v}" ${S[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></span></label>`;
    return `<div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">PARAMÈTRES</h1>
    <div class="opts">
      <h3>GRAPHISMES</h3>
      ${sel('graphics', 'Qualité', [['low', 'Basse (PC modeste)'], ['medium', 'Moyenne'], ['high', 'Haute']])}
      ${chk('motionBlur', 'Effet de vitesse (flou radial léger)')}
      <p class="note">La qualité s'applique au prochain chargement de course. Aucune résolution « 12K » ni écran OLED n'est garantie : le jeu s'adapte à la taille de la fenêtre.</p>
      <h3>SON</h3>
      ${rng('masterVol', 'Volume général')}${rng('sfxVol', 'Effets / moteurs')}${rng('musicVol', 'Musique')}${rng('radioVol', 'Radio ingénieur')}${rng('crowdVol', 'Foule')}
      <h3>ACCESSIBILITÉ</h3>
      ${chk('subtitles', 'Sous-titres de la radio')}
      ${rng('textSize', 'Taille de l\'interface', 0.8, 1.5, 0.05)}
      ${chk('cameraShake', 'Tremblements de caméra')}
      ${chk('reduceMotion', 'Réduire les animations', 'Désactive le flou et réduit les secousses')}
      ${sel('units', 'Unités de vitesse', [['kmh', 'km/h'], ['mph', 'mph']])}
      ${rng('sensitivity', 'Sensibilité direction (clavier)', 0.5, 1.6, 0.05)}
      ${rng('deadzone', 'Zone morte manette', 0, 0.3, 0.01)}
    </div>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button><button data-nav data-do="reset-settings">Réinitialiser</button><button data-nav data-do="fullscreen">Plein écran</button></div>`;
  }

  _s_controls() {
    const rows = [['Accélérer', '↑ / W', 'R2 / RT'], ['Freiner', '↓ / S', 'L2 / LT'], ['Tourner', '← → / A D', 'Stick gauche'], ['Boost énergie (ERS)', 'Espace', '✕ / A'], ['Caméra', 'C', '△ / Y'], ['Demander un arrêt aux stands', 'B', '□ / X'],
      ['Pneus pour l\'arrêt', '1 S · 2 M · 3 H · 4 I · 5 W', 'D-pad ← →'], ['Pause / menu', 'Échap ou P', 'OPTIONS'], ['AI Lab (panneau)', 'L', '—'], ['Capteurs IA (debug)', 'G', 'SHARE'], ['Autopilote ON/OFF', 'T', '—'], ['Remettre sur la piste', 'R', '—'], ['Son coupé', 'M', '—'], ['Aide', 'H', '—']];
    return `<div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">COMMANDES</h1>
    <table class="keys"><thead><tr><th></th><th>Clavier</th><th>Manette (PlayStation / Xbox)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <p class="note">Menus : flèches / D-pad pour naviguer, Entrée ou ✕ pour valider, Échap ou ○ pour revenir. Les manettes PlayStation et Xbox sont reconnues par le navigateur (API Gamepad) ; branche-la puis appuie sur un bouton.</p>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button></div>`;
  }

  _s_about() {
    const rows = this.cb.requirements ? this.cb.requirements() : [];
    const cls = { Implémenté: 'ok', Testé: 'ok', Partiel: 'mid', Prévu: 'plan', Bloqué: 'bad' };
    return `<div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
    <h1 class="title">À PROPOS · ÉTAT DU PROJET</h1>
    <div class="about">
      <p>Prototype jouable de course monoplace 2026, construit avec Three.js. Les visuels de menu proviennent de tes images. Les pilotes affichés dans les menus viennent de tes images ; les autres personnages 3D (mécaniciens, public, commissaires) sont des <b>personnages stylisés, remplaçables</b>. Les circuits sont des <b>tracés stylisés</b>, pas des plans officiels. Aucune certification (PEGI, console) n'est revendiquée.</p>
      <table class="req"><thead><tr><th>Fonction</th><th>Statut</th><th>Preuve / note</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td><span class="st ${cls[r[1]] || ''}">${esc(r[1])}</span></td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>
      <p class="note">Détails complets : fichiers <code>docs/REQUIREMENTS.md</code>, <code>docs/ASSETS.md</code> et <code>README.md</code>.</p>
    </div>
    <div class="actions"><button data-nav data-do="back">‹ RETOUR</button></div>`;
  }

  // --------------------------------------------------------------- résultats
  showResults(res, extra) {
    this.screen = 'results'; this.root.hidden = false; this.root.dataset.screen = 'results'; this.stack = [];
    const player = res.rows.find((r) => r.car.isPlayer);
    const tt = res.mode === 'timetrial';
    const rows = res.rows.map((r) => {
      const t = r.finished ? (r.pos === 1 ? fmtTime(r.time) : '+' + (r.total - res.rows[0].total).toFixed(3)) : r.status;
      return `<tr class="${r.car.isPlayer ? 'me' : ''}"><td>${r.pos}</td><td><i class="tm" style="background:${r.team.accent === '#ffffff' || r.team.accent === '#101010' ? r.team.body : r.team.accent}"></i>${esc(r.driver.first[0])}. ${esc(r.driver.last)}</td><td>${esc(r.team.short)}</td><td>${t}${r.pen ? ` <small>(+${r.pen}s)</small>` : ''}</td><td>${fmtTime(r.best < 1e8 ? r.best : null)}${res.fastest.car === r.car ? ' 🟣' : ''}</td><td>${r.stops}</td><td>${tt ? '' : r.points}</td></tr>`;
    }).join('');
    this.root.innerHTML = `<div class="screen s-results"><div class="bg dark" style="background-image:url(${BASE}ui/menu.jpg)"></div><div class="veil strong"></div>
      <h1 class="title">RÉSULTATS <small>${esc(circuitById(res.circuit) ? circuitById(res.circuit).name : res.circuit)} · ${res.laps} tours</small></h1>
      <div class="res-top"><div class="big">P${player ? player.pos : '-'}</div><div class="chips"><span>Score ${extra.score}</span><span>Meilleur tour ${fmtTime(player && player.best < 1e8 ? player.best : null)}${extra.newBest ? ' · NOUVEAU RECORD' : ''}</span><span>Dépassements ${player ? player.overtakes : 0}</span><span>Vitesse max ${player ? Math.round(player.topSpeed * 3.6) : 0} km/h</span><span>${player && player.pen ? 'Pénalités +' + player.pen + ' s' : 'Course propre'}</span></div></div>
      <div class="tablewrap"><table class="res"><thead><tr><th>P</th><th>Pilote</th><th>Équipe</th><th>Temps</th><th>Meilleur</th><th>Arrêts</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="actions"><button data-nav data-do="menu">MENU</button><button data-nav data-do="again">REJOUER</button><button class="primary" data-nav data-do="podium">PODIUM ›</button></div></div>`;
    const f = this.root.querySelector('.primary'); if (f) f.focus();
  }
  showPodiumUI(res, winner) {
    this.screen = 'podium'; this.root.hidden = false; this.root.dataset.screen = 'podium';
    this.root.innerHTML = `<div class="screen s-podium"><div class="pod-title"><small>VAINQUEUR</small><h1>${esc(winner.driver.first.toUpperCase())} ${esc(winner.driver.last.toUpperCase())}</h1><p>${esc(winner.team.name)}</p></div>
      <div class="actions floating"><button data-nav data-do="results">‹ RÉSULTATS</button><button data-nav data-do="again">REJOUER</button><button class="primary" data-nav data-do="menu">MENU PRINCIPAL</button></div></div>`;
    const f = this.root.querySelector('.primary'); if (f) f.focus();
  }
}
