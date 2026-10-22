// =====================================================================
//  DATA CATALOG  (configurable: add/modify drivers, teams, circuits here)
//  Les noms/numéros viennent de tes images et de ta liste. Remplaçables.
// =====================================================================

export const TEAMS = {
  ferrari:     { name: 'Scuderia Ferrari HP',  short: 'Ferrari',      body: '#d90000', accent: '#ffffff', dark: '#1a0a0a', glow: '#ff2a1a', suit: '#d90000' },
  mercedes:    { name: 'Mercedes-AMG Petronas', short: 'Mercedes',    body: '#15191c', accent: '#00d7c0', dark: '#0b0e10', glow: '#2fe8d4', suit: '#15191c' },
  redbull:     { name: 'Oracle Red Bull Racing', short: 'Red Bull',   body: '#16215c', accent: '#e8002d', dark: '#0b1030', glow: '#ffcc00', suit: '#16215c' },
  mclaren:     { name: 'McLaren F1 Team',       short: 'McLaren',     body: '#ff8000', accent: '#101010', dark: '#2a1400', glow: '#ff9d2e', suit: '#ff8000' },
  racingbulls: { name: 'Racing Bulls',          short: 'Racing Bulls', body: '#e9efff', accent: '#2740ff', dark: '#101840', glow: '#6b82ff', suit: '#2740ff' },
  haas:        { name: 'Haas F1 Team',          short: 'Haas',        body: '#eceff1', accent: '#e10600', dark: '#15181a', glow: '#ff4b3d', suit: '#e10600' },
  audi:        { name: 'Audi Revolut F1 Team',  short: 'Audi',        body: '#b9bec4', accent: '#ff0a2d', dark: '#1a1c1f', glow: '#ff3b55', suit: '#2b2e33' },
  williams:    { name: 'Williams Racing',       short: 'Williams',    body: '#0a4bd8', accent: '#ffffff', dark: '#06173f', glow: '#4b8bff', suit: '#0a4bd8' },
  cadillac:    { name: 'Cadillac F1 Team',      short: 'Cadillac',    body: '#101114', accent: '#d7d9df', dark: '#000000', glow: '#c8cbd6', suit: '#101114' },
  astonmartin: { name: 'Aston Martin Aramco',   short: 'Aston Martin', body: '#00665a', accent: '#cdf000', dark: '#00231f', glow: '#2ff2c0', suit: '#00665a' },
  alpine:      { name: 'Alpine F1 Team',        short: 'Alpine',      body: '#0a7bff', accent: '#ff5fb4', dark: '#06204a', glow: '#50a8ff', suit: '#0a7bff' },
};

// selectable = apparaît dans ton écran de sélection (images fournies)
export const DRIVERS = [
  // --- Pilotes jouables (images fournies) ---
  { id: 'leclerc',    first: 'Charles',  last: 'Leclerc',    code: 'LEC', number: 16, team: 'ferrari',    nat: 'MC', skill: 0.995, selectable: true, img: 'leclerc.jpg',    helmet: '#d90000' },
  { id: 'hamilton',   first: 'Lewis',    last: 'Hamilton',   code: 'HAM', number: 44, team: 'ferrari',    nat: 'GB', skill: 0.995, selectable: true, img: 'hamilton.jpg',   helmet: '#ffe500' },
  { id: 'russell',    first: 'George',   last: 'Russell',    code: 'RUS', number: 63, team: 'mercedes',   nat: 'GB', skill: 0.992, selectable: true, img: 'russell.jpg',    helmet: '#37e3d2' },
  { id: 'antonelli',  first: 'Kimi',     last: 'Antonelli',  code: 'ANT', number: 12, team: 'mercedes',   nat: 'IT', skill: 0.988, selectable: true, img: 'antonelli.jpg',  helmet: '#2f6bff' },
  { id: 'verstappen', first: 'Max',      last: 'Verstappen', code: 'VER', number: 3,  team: 'redbull',    nat: 'NL', skill: 1.0,   selectable: true, img: 'verstappen.jpg', helmet: '#1b2a7a' },
  { id: 'hadjar',     first: 'Isack',    last: 'Hadjar',     code: 'HAD', number: 6,  team: 'redbull',    nat: 'FR', skill: 0.985, selectable: true, img: 'hadjar.jpg',     helmet: '#ffcc00' },
  { id: 'norris',     first: 'Lando',    last: 'Norris',     code: 'NOR', number: 1,  team: 'mclaren',    nat: 'GB', skill: 0.998, selectable: true, img: 'norris.jpg',     helmet: '#c7ff00' },
  { id: 'piastri',    first: 'Oscar',    last: 'Piastri',    code: 'PIA', number: 81, team: 'mclaren',    nat: 'AU', skill: 0.995, selectable: true, img: 'piastri.jpg',    helmet: '#ff8000' },
  // --- Adversaires IA demandés (6 équipes x 2) ---
  { id: 'lawson',     first: 'Liam',     last: 'Lawson',     code: 'LAW', number: 30, team: 'racingbulls', nat: 'NZ', skill: 0.962 },
  { id: 'lindblad',   first: 'Arvid',    last: 'Lindblad',   code: 'LIN', number: 41, team: 'racingbulls', nat: 'GB', skill: 0.955 },
  { id: 'ocon',       first: 'Esteban',  last: 'Ocon',       code: 'OCO', number: 31, team: 'haas',        nat: 'FR', skill: 0.968 },
  { id: 'bearman',    first: 'Oliver',   last: 'Bearman',    code: 'BEA', number: 87, team: 'haas',        nat: 'GB', skill: 0.966 },
  { id: 'hulkenberg', first: 'Nico',     last: 'Hülkenberg', code: 'HUL', number: 27, team: 'audi',        nat: 'DE', skill: 0.972 },
  { id: 'bortoleto',  first: 'Gabriel',  last: 'Bortoleto',  code: 'BOR', number: 5,  team: 'audi',        nat: 'BR', skill: 0.958 },
  { id: 'albon',      first: 'Alexander', last: 'Albon',     code: 'ALB', number: 23, team: 'williams',    nat: 'TH', skill: 0.974 },
  { id: 'sainz',      first: 'Carlos',   last: 'Sainz',      code: 'SAI', number: 55, team: 'williams',    nat: 'ES', skill: 0.978 },
  { id: 'perez',      first: 'Sergio',   last: 'Pérez',      code: 'PER', number: 11, team: 'cadillac',    nat: 'MX', skill: 0.970 },
  { id: 'bottas',     first: 'Valtteri', last: 'Bottas',     code: 'BOT', number: 77, team: 'cadillac',    nat: 'FI', skill: 0.966 },
  { id: 'alonso',     first: 'Fernando', last: 'Alonso',     code: 'ALO', number: 14, team: 'astonmartin', nat: 'ES', skill: 0.982 },
  { id: 'stroll',     first: 'Lance',    last: 'Stroll',     code: 'STR', number: 18, team: 'astonmartin', nat: 'CA', skill: 0.956 },
  // --- Réserve (Alpine apparaît dans ta liste ; pas dans la grille par défaut) ---
  { id: 'gasly',      first: 'Pierre',   last: 'Gasly',      code: 'GAS', number: 10, team: 'alpine',      nat: 'FR', skill: 0.968 },
  { id: 'colapinto',  first: 'Franco',   last: 'Colapinto',  code: 'COL', number: 43, team: 'alpine',      nat: 'AR', skill: 0.955 },
];

// Grille IA par défaut (tableau de ta demande). Modifiable.
export const DEFAULT_AI_GRID = [
  'lawson', 'lindblad', 'ocon', 'bearman', 'hulkenberg', 'bortoleto',
  'albon', 'sainz', 'perez', 'bottas', 'alonso', 'stroll',
];

export const driverById = (id) => DRIVERS.find((d) => d.id === id);

export const FLAG_EMOJI = { MC: 'MC', GB: 'GB', IT: 'IT', NL: 'NL', FR: 'FR', AU: 'AU', NZ: 'NZ', DE: 'DE', BR: 'BR', TH: 'TH', ES: 'ES', MX: 'MX', FI: 'FI', CA: 'CA', AR: 'AR' };

// ---------------------------------------------------------------------
//  Circuits (tracés STYLISÉS approximatifs, longueur de jeu réduite)
// ---------------------------------------------------------------------
export const CIRCUITS = [
  { id: 'monaco',   name: 'Monaco',      country: 'Principauté de Monaco', flag: 'MC', realKm: 3.337, turns: 19, type: 'Circuit urbain', gameKm: 2.5, difficulty: 5, thumb: 'monaco.jpg',      big: 'monaco_big.jpg',      theme: 'city',     laps: 3 },
  { id: 'monza',    name: 'Monza',       country: 'Italie',                flag: 'IT', realKm: 5.793, turns: 11, type: 'Circuit permanent', gameKm: 3.3, difficulty: 2, thumb: 'monza.jpg',       big: 'monza_big.jpg',       theme: 'forest',   laps: 3 },
  { id: 'silverstone', name: 'Silverstone', country: 'Royaume-Uni',        flag: 'GB', realKm: 5.891, turns: 18, type: 'Circuit permanent', gameKm: 3.2, difficulty: 3, thumb: 'silverstone.jpg', big: 'silverstone_big.jpg', theme: 'flat',     laps: 3 },
  { id: 'redbullring', name: 'Red Bull Ring', country: 'Autriche',         flag: 'AT', realKm: 4.318, turns: 10, type: 'Circuit permanent', gameKm: 2.7, difficulty: 3, thumb: 'redbullring.jpg', big: 'redbullring_big.jpg', theme: 'alpine',   laps: 3 },
  { id: 'procedural', name: 'Circuit généré (AI Lab)', country: 'Procédural', flag: 'XX', realKm: 0, turns: 0, type: 'Piste de test procédurale', gameKm: 3.0, difficulty: 3, thumb: null, big: null, theme: 'flat', laps: 3 },
];
export const circuitById = (id) => CIRCUITS.find((c) => c.id === id);

// ---------------------------------------------------------------------
//  Pneus
// ---------------------------------------------------------------------
export const TYRES = {
  S: { id: 'S', name: 'Tendre',   en: 'Soft',   color: '#ff2d2d', grip: 1.0,  wear: 0.62, optT: 98,  wetBest: 0.0 },
  M: { id: 'M', name: 'Médium',   en: 'Medium', color: '#ffd400', grip: 0.955, wear: 0.40, optT: 92,  wetBest: 0.0 },
  H: { id: 'H', name: 'Dur',      en: 'Hard',   color: '#f2f2f2', grip: 0.915, wear: 0.26, optT: 88,  wetBest: 0.0 },
  I: { id: 'I', name: 'Intermédiaire', en: 'Intermediate', color: '#2fc84a', grip: 0.90, wear: 0.45, optT: 70, wetBest: 0.45 },
  W: { id: 'W', name: 'Pluie',    en: 'Wet',    color: '#2a7bff', grip: 0.86, wear: 0.32, optT: 60,  wetBest: 0.9 },
};

// grip multiplier of a compound as function of track wetness (0 dry .. 1 flooded)
export function wetGrip(compound, w) {
  switch (compound) {
    case 'S': case 'M': case 'H': return Math.max(0.3, 1 - 0.78 * Math.pow(w, 0.8)) ;
    case 'I': return w < 0.45 ? 0.86 + 0.14 * (w / 0.45) : 1.0 - 0.18 * Math.max(0, w - 0.7) / 0.3;
    case 'W': return 0.68 + 0.32 * Math.min(1, w / 0.9);
  }
  return 1;
}

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const FASTEST_LAP_POINT = 0; // configurable (0 = off, as in current rules)

// ---------------------------------------------------------------------
//  Drapeaux & panneaux (symbole = indépendant de la couleur)
// ---------------------------------------------------------------------
export const FLAGS = {
  green:     { id: 'green',     label: 'GREEN',          fr: 'Piste libre',          color: '#1fc84a', symbol: '▶' },
  yellow:    { id: 'yellow',    label: 'YELLOW',         fr: 'Danger : ralentir',    color: '#ffd500', symbol: '▲' },
  double:    { id: 'double',    label: 'DOUBLE YELLOW',  fr: 'Double jaune',         color: '#ffd500', symbol: '▲▲' },
  red:       { id: 'red',       label: 'RED FLAG',       fr: 'Course suspendue',     color: '#ff1f1f', symbol: '■' },
  blue:      { id: 'blue',      label: 'BLUE',           fr: 'Laissez passer',       color: '#2f7bff', symbol: '◢' },
  white:     { id: 'white',     label: 'WHITE',          fr: 'Véhicule lent',        color: '#ffffff', symbol: '○' },
  surface:   { id: 'surface',   label: 'SLIPPERY',       fr: 'Piste glissante',      color: '#ff5a3c', symbol: '≋' },
  bw:        { id: 'bw',        label: 'WARNING',        fr: 'Avertissement',        color: '#dddddd', symbol: '◪' },
  bo:        { id: 'bo',        label: 'DAMAGE',         fr: 'Dommages : rentrez',   color: '#ff8a00', symbol: '●' },
  black:     { id: 'black',     label: 'BLACK',          fr: 'Disqualification',     color: '#000000', symbol: '✕' },
  chequered: { id: 'chequered', label: 'CHEQUERED',      fr: 'Arrivée',              color: '#ffffff', symbol: '▦' },
  vsc:       { id: 'vsc',       label: 'VSC',            fr: 'Virtual Safety Car',   color: '#ffd500', symbol: 'V' },
  sc:        { id: 'sc',        label: 'SAFETY CAR',     fr: 'Safety Car',           color: '#ffd500', symbol: 'S' },
};

// Messages radio : texte affiché + voix (speechSynthesis en anglais)
export const RADIO = {
  boxbox:     { text: 'Box, box.',                         fr: 'Box, box.' },
  stayout:    { text: 'Stay out, stay out.',               fr: 'Restez en piste.' },
  push:       { text: 'Push, push now.',                   fr: 'Attaque !' },
  manage:     { text: 'Manage your tyres.',                fr: 'Gère tes pneus.' },
  safety:     { text: 'Safety Car, Safety Car.',           fr: 'Safety Car !' },
  vsc:        { text: 'Virtual Safety Car deployed.',      fr: 'Virtual Safety Car.' },
  red:        { text: 'Red flag, red flag. Stop the car.', fr: 'Drapeau rouge, arrête-toi.' },
  green:      { text: 'Green, green. Race is back on.',    fr: 'Piste libre, on repart.' },
  finallap:   { text: 'Final lap. Bring it home.',         fr: 'Dernier tour !' },
  rain:       { text: 'Rain is coming. Think about inters.', fr: 'La pluie arrive : pneus inter ?' },
  blue:       { text: 'Blue flag. Let the leader through.', fr: 'Drapeau bleu.' },
  penalty:    { text: 'You have a five-second penalty.',   fr: 'Pénalité de 5 secondes.' },
  lizard:     { text: 'Animal on the track!',              fr: 'Animal sur la piste !' },
  yellow:     { text: 'Yellow flag ahead.',                fr: 'Drapeau jaune devant.' },
  win:        { text: 'P1! Fantastic race!',               fr: 'P1 ! Course fantastique !' },
  podium:     { text: 'Podium! Great job!',                fr: 'Podium ! Bravo !' },
  damage:     { text: 'We have damage. Box this lap.',     fr: 'Dégâts : rentre ce tour.' },
  pitexit:    { text: 'Pit exit is clear.',                fr: 'Sortie des stands libre.' },
};

// ---------------------------------------------------------------------
//  Réglages par défaut
// ---------------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  graphics: 'high',          // low | medium | high
  masterVol: 0.8, sfxVol: 0.9, musicVol: 0.5, radioVol: 0.8, crowdVol: 0.6,
  subtitles: true, textSize: 1.0, motionBlur: true, cameraShake: true, reduceMotion: false,
  speedFov: 1.0, units: 'kmh',
  deadzone: 0.08, sensitivity: 1.0,
  keys: {
    accel: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD',
    camera: 'KeyC', pit: 'KeyB', boost: 'Space', gearUp: 'KeyE', gearDown: 'KeyQ', reset: 'KeyR',
    pause: 'KeyP', debug: 'KeyG', auto: 'KeyT',
  },
};

export const DEFAULT_SETUP = {
  mode: 'race',              // race | timetrial
  drive: 'manual',           // manual | auto (autopilot démo)
  laps: 3,
  difficulty: 'medium',      // easy | medium | hard
  assists: 'standard',       // none | standard | full
  weather: 'dry',            // dry | wet | variable
  startTyre: 'M',
  gridPos: 'mid',            // pole | mid | back
  lizard: true,
  aiCount: 12,
  startDelay: 1.0,
  rules: 'standard',         // standard | advanced
  vmax: 340,                 // km/h  (VITESSE MAX)
  complexity: 0.55,          // COMPLEXITÉ CIRCUIT
  width: 15,                 // LARGEUR PISTE (m)
  seed: 2026,
  trackStyleSeedIter: 1,
};
