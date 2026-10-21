# Remplacer les assets
- **Images pilotes/menu/circuits** : remplacer les fichiers de `public/assets/ui` et `public/assets/circuits` en gardant les noms (`leclerc.jpg`, `monza.jpg`…).
- **Voitures** : `src/carModel.js` (`buildCar`) — remplacer par un chargeur glTF (`three/addons/loaders/GLTFLoader.js`) retournant la même structure `{group, wheels…}`.
- **Humains** : `src/characters.js` (`makeHuman`, `makeTrophy`) — même principe avec un modèle glTF animé.
- **Sons** : `src/audio.js` est procédural ; brancher des fichiers `.ogg` via `AudioBuffer` en gardant les méthodes publiques.
- **Tracés** : `LAYOUTS` dans `src/track.js` (points de contrôle) ; remplacer par des données GPS lissées au besoin.
- Vérifier les droits de tout asset ajouté avant diffusion.
