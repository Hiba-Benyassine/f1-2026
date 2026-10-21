// =====================================================================
//  SETTINGS : réglages persistants (localStorage, avec repli mémoire)
//  - réglages (graphismes, audio, accessibilité, touches)
//  - dernier profil (pilote / circuit / options de course)
//  - records contre-la-montre et meilleur score par circuit
// =====================================================================
import { DEFAULT_SETTINGS, DEFAULT_SETUP } from './data.js';

const K_SET = 'f1-2026.settings.v1';
const K_PROFILE = 'f1-2026.profile.v1';
const K_REC = 'f1-2026.records.v1';
const K_CHAMP = 'f1-2026.championship.v1';

const mem = {};
function read(key) {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* stockage indisponible */ }
  return mem[key] ? JSON.parse(mem[key]) : null;
}
function write(key, value) {
  const s = JSON.stringify(value);
  mem[key] = s;
  try { localStorage.setItem(key, s); } catch (e) { /* ignoré : repli mémoire */ }
}

const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(base, extra) {
  const out = clone(base);
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(out)) {
    if (!(k in extra)) continue;
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], extra[k]);
    else if (typeof extra[k] === typeof out[k]) out[k] = extra[k];
  }
  return out;
}

export const settings = merge(DEFAULT_SETTINGS, read(K_SET));
export function saveSettings() { write(K_SET, settings); }
export function resetSettings() { Object.assign(settings, clone(DEFAULT_SETTINGS)); saveSettings(); }

// profil : dernier choix du joueur
export const profile = merge({ driverId: 'leclerc', circuitId: 'monaco', setup: DEFAULT_SETUP, seenIntro: false }, read(K_PROFILE));
export function saveProfile() { write(K_PROFILE, profile); }

// records
const records = read(K_REC) || {};
export function getRecord(circuitId) { return records[circuitId] || { bestLap: null, bestRace: null, bestScore: 0, wins: 0, races: 0 }; }
export function submitResult(circuitId, { bestLap, raceTime, laps, position, score }) {
  const r = records[circuitId] || { bestLap: null, bestRace: null, bestScore: 0, wins: 0, races: 0 };
  let newBestLap = false;
  if (bestLap && bestLap < 1e8 && (r.bestLap === null || bestLap < r.bestLap)) { r.bestLap = bestLap; newBestLap = true; }
  if (raceTime && position === 1 && (r.bestRace === null || raceTime < r.bestRace)) r.bestRace = raceTime;
  if (score && score > r.bestScore) r.bestScore = score;
  r.races++; if (position === 1) r.wins++;
  records[circuitId] = r; write(K_REC, records);
  return { newBestLap, record: r };
}

// championnat (feuille de route : le modèle de données est prêt, l'interface est « Planned »)
export function loadChampionship() { return read(K_CHAMP) || { round: 0, points: {}, results: [] }; }
export function saveChampionship(c) { write(K_CHAMP, c); }

// score : règle documentée (voir README) — points de classement + bonus tours rapides/dépassements − pénalités
export function computeScore({ position, total, overtakes = 0, bestLapRank = 99, penaltySec = 0, clean = true }) {
  let s = Math.max(0, (total - position + 1)) * 100;
  s += overtakes * 25;
  if (bestLapRank === 1) s += 150;
  if (clean) s += 100;
  s -= penaltySec * 10;
  return Math.max(0, Math.round(s));
}

export function fmtTime(t, ms = true) {
  if (t === null || t === undefined || !isFinite(t) || t > 1e8) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(ms ? 3 : 0).padStart(ms ? 6 : 2, '0')}`;
}
export function fmtGap(t) {
  if (t === null || t === undefined || !isFinite(t)) return '';
  return (t >= 0 ? '+' : '-') + Math.abs(t).toFixed(t > 99 ? 0 : 1);
}
