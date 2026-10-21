# Grand Prix 2026 — jeu de course F1 3D (navigateur)

Jeu de course monoplace 3D jouable dans le navigateur, avec IA (Steering Behaviors), stands, météo, drapeaux, podium animé.
Style réaliste **stylisé** : voir `docs/REQUIREMENTS.md` pour ce qui est testé, partiel ou prévu (rien n'est survendu).

## Lancer le jeu (débutant)
1. Installer **Node.js 18 ou plus** (https://nodejs.org, version LTS).
2. Ouvrir un terminal dans ce dossier.
3. Taper : `node tools/serve.mjs` (ou `npm start`).
4. Ouvrir **http://localhost:8080** dans Chrome, Edge ou Firefox récent (WebGL requis).

Aucun `npm install` n'est nécessaire : Three.js est fourni dans `vendor/`.
Ne pas ouvrir `index.html` en double-cliquant : les modules JS exigent un serveur local.

## Version de production
- `npm run build` crée le dossier `dist/` (minifié si `esbuild` est présent : `npm i -D esbuild`, sinon simple copie qui marche aussi).
- `npm run preview` sert `dist/` sur http://localhost:8080. Pour héberger : envoyer le contenu de `dist/` sur n'importe quel hébergeur statique.
- `npm test` lance les tests logiques (tracés, course complète, pilote virtuel manuel).

## Commandes
| Action | Clavier | Manette (type PlayStation) |
|---|---|---|
| Accélérer / freiner | ↑ / ↓ ou W / S | R2 / L2 |
| Tourner | ← / → ou A / D | stick gauche |
| Boost ERS | Espace | croix (X) |
| Caméra | C | triangle |
| Stands | B | carré |
| Remise en piste (+3 s) | R | — |
| Vue debug IA | G | Select |
| Pneus précédent/suivant (stands) | — | L1 / R1 |
| Reprendre la main / autopilote | T | — |
| Pause | Échap ou P | Start |

URL rapide (test) : `?quick=1&circuit=monza&laps=2&drive=manual&weather=dry&graphics=medium`.

## Modes
- **AUTO** : l'IA conduit votre voiture (démonstration). **MANUEL** : vous conduisez, avec aides réglables (aucune / standard / complète : traction, contre-braquage, aide au freinage).
- Panneau **AI Lab** (touche dans la course, circuit procédural) : VITESSE MAX, COMPLEXITÉ CIRCUIT, LARGEUR PISTE ; *Génération* = numéro d'itération du tracé généré ; *Voitures en vie* = voitures encore en piste ; *Meilleur score* = règle affichée dans l'écran (tours validés puis temps).

## Honnêteté / limites
- Tracés **stylisés approximatifs**, pas des relevés réels. Voitures, équipes et règlement 2026 (ERS, aéro active) sont **provisoires**.
- Seules les photos fournies représentent des personnes réelles ; les humains 3D sont des silhouettes stylisées remplaçables.
- Impossible de promettre ou vérifier ici : 12K/OLED, Xbox/Nvidia, PEGI, « qualité FIFA 2026 ». Les liens YouTube n'ont pas pu être visionnés.
- Testé : Chromium sans GPU (rendu logiciel). Manette, audio audible, rendu pluie/SC : non vérifiés sur matériel réel.
- Prévu seulement : qualifications, essais, sprint, championnat, tour de formation.

## PlayStation (chemin documenté, non réalisé)
Une version console native exige un compte développeur Sony, un kit de développement et la certification Sony ; rien de tel n'est revendiqué ici. Chemin réaliste : porter la logique (`src/race.js`, `ai.js`, `vehicle.js`, `track.js`, sans dépendance au DOM) vers un moteur supporté (Unity/Unreal/Godot + export console), et réutiliser les données et la matrice d'exigences.

## Structure
`src/` jeu (race, ai, vehicle, track, world, hud, ui, audio, podium) · `vendor/three` Three.js · `public/assets` images fournies · `tools/` serveur + build · `tests/` · `docs/`.
Remplacer les images/modèles : voir `docs/ASSETS.md` et `docs/ASSET_REPLACEMENT.md`.
