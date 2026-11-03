# Live Tracker — suivi sportif en direct (auto-hébergé)

SPA mobile-first pour que les proches suivent un athlète pendant une sortie longue : statut, ETA, vitesse/VAM/pente/D+,
carte Leaflet, profil d'altitude synchronisé, partage Telegram, export GPX. **Aucun CDN** : Leaflet, Chart.js et le CSS Tailwind compilé sont dans le dépôt.

## Démarrage rapide (démo)

```bash
cd live-tracker
node server.mjs --replay          # http://localhost:8080 — rejoue data/mock.json en direct (×30)
# ou, sans serveur applicatif :  python3 -m http.server  puis  /?mock=1&speed=60&from=40
```

## Production

```bash
INGEST_TOKEN=un-long-secret PORT=8080 node server.mjs      # Node ≥ 18, zéro dépendance
```
Le tracker (OwnTracks/Tasker/script…) envoie ses positions :
```bash
curl -X POST https://exemple.fr/api/position -H "Authorization: Bearer un-long-secret" \
     -d '{"lat":45.19,"lon":5.72,"alt":230,"bat":87}'      # t (ms epoch) optionnel ; tableau accepté
curl -X POST … -d '{"finished":true}'                       # fin de sortie explicite
```
Les points sont persistés dans `data/live-track.ndjson` (rechargés au redémarrage). Derrière nginx : désactiver le buffering pour `/api/stream` (`proxy_buffering off;`, le serveur envoie déjà `X-Accel-Buffering: no`) et mettre HTTPS.
Le parcours prévu est `data/route.gpx` (`meta.routeUrl`) ; sans GPX l'app fonctionne mais sans ETA ni « restant ».

## Architecture

| Fichier | Rôle |
|---|---|
| `js/TrackerEngine.js` | **Cœur métier, sans DOM** : distance, auto-pause, vitesse en mouvement, VAM, pente, D+, ETA, arrivée, export GPX. Testable sous Node. |
| `js/transport.js` | `LiveTransport` (SSE + repli polling 30 s + rattrapage après coupure) et `MockTransport` (rejeu JSON). |
| `js/mapView.js` | Leaflet : trace colorée pente/vitesse (rendu incrémental, canvas), GPX en pointillés, marqueur pulsant, pauses, auto-centrage. |
| `js/profileChart.js` | Chart.js + crosshair maison ; survol → curseur carte, clic carte → surlignage graphique. |
| `js/ui.js`, `js/app.js` | Tableau de bord (mises à jour ciblées du DOM), câblage. |
| `server.mjs` | Statique + `/api/stream` (SSE) + `/api/track` + `/api/position`. |

### Mocker des données
`data/mock.json` : `{ "meta": {...}, "points": [{ "t": 1781418000000, "lat": 45.19, "lon": 5.72, "alt": 230, "bat": 97 }, …] }`.
Dans un test : `const e = new TrackerEngine({clock: () => now}); e.setRoute(gpx); e.addPoints(points); e.snapshot()`.
`npm run mock` régénère le jeu de démo, `npm test` lance les tests du moteur.

### Règles métier (réglables dans `DEFAULTS`)
- **Auto-pause** : < 2,5 km/h pendant > 45 s ⇒ « En pause » (rétroactive, avec anti-jitter GPS : rayon 25 m). Les pauses sont exclues de la vitesse moyenne ; icône ⏸ à l'endroit de l'arrêt.
- **Vitesse moyenne en mouvement** : segments ≥ 2 km/h hors pauses. **ETA** = restant / moyenne 30 min + pauses estimées (ratio pause/mouvement observé, plafonné à 50 %).
- **VAM** : gain d'altitude / temps sur 15 min, affichée si ≥ 25 m gagnés et pente moyenne ≥ 3 %. **D+** avec hystérésis 2,5 m. **Pente** sur ~120 m.
- **Arrivée** : à < 150 m de la fin de la trace après ≥ 92 % du parcours, ou message `finished`. **Signal perdu** : aucun point depuis 3 min.

## Développement
`npm install` puis `npm run build:css` (Tailwind) après modification des classes ; `npm run vendor` recopie Leaflet/Chart.js.
Fonds de carte : CARTO dark (sombre), OSM (clair), OpenTopoMap — respecter leurs politiques d'usage pour un fort trafic.
