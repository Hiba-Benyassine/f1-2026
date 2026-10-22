// Constantes physiques partagées (unités SI). Tout est configurable ici.
export const G = 9.81;
export const RHO = 1.2;

export const CAR = {
  mass: 800,            // kg (sans carburant)
  a: 1.95,              // CG -> essieu avant (m)
  b: 1.65,              // CG -> essieu arrière (m)
  wheelbase: 3.6,
  Iz: 1150,
  width: 2.0,
  length: 5.5,
  ClA: 4.1,             // appui aérodynamique (mode virage)
  CdA: 1.05,            // traînée (mode virage)
  ClAStraight: 2.7,     // mode ligne droite (aéro active, valeurs provisoires)
  CdAStraight: 0.72,
  power: 640e3,         // W (moteur thermique + électrique, simplifié)
  ersPower: 130e3,      // W de boost "énergie"
  ersCapacity: 4.0,     // MJ
  wheelR: 0.33,
  mu0: 2.05,            // adhérence de base
  brakeFront: 0.58,
  maxSteer: 0.34,
  fuelPerLap: 2.2,      // kg/tour (jeu compressé)
};

// Rapports : vitesse max (m/s) par rapport ; rpm 7000..15000 dans chaque rapport
export const GEARS = [0, 22, 40, 58, 74, 88, 100, 112];
export const RPM_MIN = 7000, RPM_MAX = 15000;

export const PIT_LIMIT = 80 / 3.6;     // 80 km/h
export const TRACK_CFG = {
  kerbW: 1.6,
  apronW: 4.5,        // revêtement de dégagement (grip 0.8)
  runoff: 15,         // distance du bord de piste au mur
  pitLaneOffset: 11,  // centre voie des stands depuis bord de piste
  pitWallOffset: 3.2,
  pitBarrier: 34,
};
