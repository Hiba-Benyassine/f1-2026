// Matrice d'état honnête (affichée dans « À propos » et reprise dans docs/REQUIREMENTS.md).
// Statuts : Testé = vérifié par un test automatique ou une capture réelle · Implémenté = codé, non vérifié visuellement
//           Partiel = version simplifiée · Prévu = non codé (feuille de route) · Bloqué = impossible ici (raison indiquée)
export const REQUIREMENTS = [
  ['Jeu 3D navigateur (Three.js r170, sans npm install)', 'Testé', 'Chromium logiciel : menus → course → podium, 0 erreur JS ; build dist vérifié'],
  ['Menu, choix pilote (8 images fournies), circuit, réglages course', 'Testé', 'captures + navigation clavier'],
  ['Circuits Monaco / Monza / Silverstone / Red Bull Ring', 'Partiel', 'tracés STYLISÉS approximatifs (pas de données GPS/laser) ; tracés validés par tests'],
  ['Circuit procédural + panneau « AI Lab »', 'Implémenté', 'Génération = itération du tracé ; Voitures en vie = voitures en piste ; Meilleur score = règle documentée dans l\'écran'],
  ['Grille : joueur + 12 IA (Racing Bulls, Haas, Audi, Williams, Cadillac, Aston Martin)', 'Testé', 'simulation complète sans NaN (tests/logic.test.mjs)'],
  ['Départ : grille, 5 feux rouges, faux départ', 'Testé', 'simulation + captures'],
  ['Mode AUTO (autopilote) et MANUEL (clavier / manette)', 'Testé', 'pilote virtuel via l\'entrée joueur : tours propres sur les 4 circuits ; manette NON testée sur matériel'],
  ['IA Steering Behaviors (Seek, Arrive, Path Following, Pursuit, Evade, Separation, Obstacle avoidance)', 'Testé', 'courses sans incident (tests/strikes.mjs) ; vue debug capteurs'],
  ['Dépassement / défense, lézard, débris, voitures arrêtées', 'Implémenté', 'scénarios simulés ; rendu du lézard non vérifié visuellement'],
  ['Radio ingénieur + sous-titres (« Box, box »)', 'Testé', ''],
  ['Stands : voie, garages, mécaniciens, pneus S/M/H/I/W', 'Testé', 'arrêt complet simulé + captures'],
  ['Météo (pluie, piste mouillée), drapeaux, VSC/SC/drapeau rouge', 'Implémenté', 'logique simulée ; visuel pluie/SC non vérifié'],
  ['Pénalités, limites de piste, secteurs, validité du tour', 'Testé', 'tests/strikes.mjs'],
  ['ERS / boost et aéro active', 'Partiel', 'modèle PROVISOIRE, non vérifié sur le règlement 2026'],
  ['HUD, minimap, classement, résultats, podium animé (trophée, confettis, public, musique)', 'Testé', 'captures du flux complet'],
  ['Audio procédural + curseurs de volume', 'Implémenté', 'non écouté en environnement sans sortie audio'],
  ['Presets graphiques, accessibilité, sauvegarde, records contre-la-montre', 'Implémenté', ''],
  ['Qualifications, essais libres, sprint, championnat, tour de formation', 'Prévu', 'feuille de route'],
  ['Qualité « 12K / OLED / Xbox / Nvidia / PEGI / FIFA 2026 »', 'Bloqué', 'ne peut être ni promise ni vérifiée ici'],
  ['Version native PlayStation', 'Bloqué', 'nécessite SDK/kit de développement Sony ; chemin documenté dans le README, aucune certification revendiquée'],
  ['Vidéos YouTube fournies', 'Bloqué', 'liens non consultables ; mp4 seulement échantillonnés'],
  ['Personnes réelles', 'Partiel', 'uniquement les photos fournies ; humains 3D = silhouettes stylisées remplaçables'],
];
