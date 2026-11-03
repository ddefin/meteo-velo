// Génère data/route.gpx (parcours prévu) et data/mock.json (sortie simulée) — déterministe.
//   node tools/generate-mock.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { haversine } from '../js/TrackerEngine.js';

let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// ---- 1. Parcours : ~85 km, départ Grenoble, un grand col au milieu
const START = { lat: 45.1885, lon: 5.7245 };
const TOTAL_KM = 85, STEP_M = 40;
const route = [];
let lat = START.lat, lon = START.lon, hdg = 140;               // cap en degrés
for (let d = 0; d <= TOTAL_KM * 1000; d += STEP_M) {
  const km = d / 1000;
  hdg += Math.sin(km / 4.3) * 1.6 + Math.cos(km / 1.7) * 0.7;  // lacets doux
  const alt = 220 + 780 * Math.exp(-(((km - 38) / 11) ** 2)) + 120 * Math.exp(-(((km - 70) / 7) ** 2)) + 18 * Math.sin(km * 1.3);
  route.push({ lat, lon, alt: +alt.toFixed(1), km });
  lat += (Math.cos((hdg * Math.PI) / 180) * STEP_M) / 111320;
  lon += (Math.sin((hdg * Math.PI) / 180) * STEP_M) / (111320 * Math.cos((lat * Math.PI) / 180));
}

mkdirSync('data', { recursive: true });
writeFileSync('data/route.gpx',
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="live-tracker-mock" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Parcours démo 85 km</name><trkseg>\n` +
  route.map(p => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.alt}</ele></trkpt>`).join('\n') +
  `\n</trkseg></trk>\n</gpx>\n`);

// ---- 2. Sortie simulée (1 point / 10 s), départ à t0
const T0 = Date.UTC(2026, 5, 14, 6, 30, 0), DT = 10;
const points = [];
let dist = 0, t = T0, bat = 98;
const alt = d => { // altitude interpolée sur la trace
  const i = Math.min(route.length - 2, Math.floor(d / STEP_M)), f = (d - i * STEP_M) / STEP_M;
  return route[i].alt + (route[i + 1].alt - route[i].alt) * f;
};
const pos = d => {
  const i = Math.min(route.length - 2, Math.floor(d / STEP_M)), f = (d - i * STEP_M) / STEP_M;
  return { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lon: route[i].lon + (route[i + 1].lon - route[i].lon) * f };
};
const stops = [{ at: 12000, sec: 20 }, { at: 31500, sec: 540 }, { at: 58000, sec: 35 }, { at: 71000, sec: 300 }]; // m, durée
let stopIdx = 0, stopLeft = 0;
const total = route.length * STEP_M - STEP_M;
while (dist < total - 10) {
  const grade = (alt(Math.min(total, dist + 60)) - alt(dist)) / 60;
  let v;                                                      // m/s
  if (stopLeft > 0) { v = 0; stopLeft -= DT; }
  else {
    v = Math.max(1.8, 8.4 - grade * 55 + gauss() * 0.5);      // ~30 km/h plat, ~9 km/h à 8 %
    if (stops[stopIdx] && dist >= stops[stopIdx].at) { stopLeft = stops[stopIdx].sec; stopIdx++; v = 0; }
  }
  dist = Math.min(total, dist + v * DT);
  t += DT * 1000;
  const q = pos(dist), jit = v === 0 ? 2.5 : 1.2;
  points.push({
    t,
    lat: +(q.lat + (gauss() * jit) / 111320).toFixed(6),
    lon: +(q.lon + (gauss() * jit) / (111320 * Math.cos((q.lat * Math.PI) / 180))).toFixed(6),
    alt: +(alt(dist) + gauss() * 1.5).toFixed(1),
    bat: Math.max(5, Math.round(bat - ((t - T0) / 3600000) * 6.5)),
  });
}
points.unshift({ t: T0, ...pos(0), alt: alt(0), bat: 98 });
writeFileSync('data/mock.json', JSON.stringify({
  meta: { name: 'Sortie démo — Col de la Croix', athlete: 'Alex', sport: 'cycling', routeUrl: 'data/route.gpx', generated: true },
  points,
}));
let d = 0; for (let i = 1; i < points.length; i++) d += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
console.log(`route: ${route.length} pts, ${(total / 1000).toFixed(1)} km — mock: ${points.length} pts, ${(d / 1000).toFixed(1)} km, durée ${((points.at(-1).t - T0) / 3600000).toFixed(2)} h`);
