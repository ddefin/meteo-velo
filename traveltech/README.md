# TravelTech – moteur d'itinéraire (MVP, phase 1)

Cœur métier du cahier de conception : génération d'un voyage à partir d'une `TripRequest`.

- `src/providers/` : interfaces d'adaptateurs (vols, logements, POI) + données simulées. Brancher Duffel, Expedia, Foursquare ici.
- `src/scoring.ts` : note bayésienne, filtre régime, choix du vol et du logement (distance aux activités).
- `src/planner.ts` : regroupement géographique (k-means) puis ordonnancement avec horaires d'ouverture.
- `src/generate.ts` : pipeline complet, budget et avertissements.

```
npm install && npm test && npm run demo
```

Limites connues : temps de trajet à vol d'oiseau (à remplacer par OSRM/Valhalla), pas encore d'API réelles, de météo, ni d'IA/LLM.
