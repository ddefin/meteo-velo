import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TrackerEngine, parseGPXText, haversine } from '../js/TrackerEngine.js';

const mock = JSON.parse(readFileSync(new URL('../data/mock.json', import.meta.url)));
const route = parseGPXText(readFileSync(new URL('../data/route.gpx', import.meta.url), 'utf8'));

/** Point à `m` mètres au nord de l'origine. */
const north = (m, t, extra = {}) => ({ t, lat: 45 + m / 111320, lon: 5, alt: 100, ...extra });

test('distance, vitesse et rejet des points aberrants', () => {
  const e = new TrackerEngine({ clock: () => 60000 });
  e.addPoint(north(0, 0)); e.addPoint(north(100, 10000));             // 36 km/h
  assert.ok(!e.addPoint(north(50000, 20000)));                         // saut de 50 km en 10 s
  assert.ok(!e.addPoint(north(100, 10000)));                           // doublon horodaté
  assert.ok(!e.addPoint({ t: 1, lat: NaN, lon: 0 }));
  const s = e.snapshot();
  assert.ok(Math.abs(s.distanceKm - 0.1) < 0.002);
  assert.ok(Math.abs(s.speedKmh - 36) < 1);
  assert.equal(e.rejected, 3);
  assert.equal(s.status, 'moving');
});

test('auto-pause : > 45 s sous 2.5 km/h, rétroactive, exclue de la vitesse moyenne', () => {
  const e = new TrackerEngine({ clock: () => 0 });
  let t = 0, m = 0;
  for (let i = 0; i < 30; i++) { e.addPoint(north(m, t)); t += 10000; m += 80; }   // 28.8 km/h pendant 5 min
  const movingBefore = e.snapshot().movingAvgKmh;
  for (let i = 0; i < 4; i++) { e.addPoint(north(m, t)); t += 10000; }              // arrêt 40 s : pas encore une pause
  assert.equal(e.snapshot().status, 'moving');
  for (let i = 0; i < 4; i++) { e.addPoint(north(m, t)); t += 10000; }              // 80 s : pause confirmée
  e.clock = () => t;
  let s = e.snapshot();
  assert.equal(s.status, 'paused');
  assert.equal(e.pauses.length, 1);
  assert.ok(Math.abs(e.pauses[0].lat - (45 + m / 111320)) < 1e-4);                 // icône à l'endroit exact
  assert.ok(Math.abs(s.movingAvgKmh - movingBefore) < 0.5);                        // pause n'impacte pas la moyenne
  assert.ok(s.pausedMs >= 70000);
  for (let i = 0; i < 5; i++) { m += 80; e.addPoint(north(m, t)); t += 10000; }    // reprise
  e.clock = () => t;
  s = e.snapshot();
  assert.equal(s.status, 'moving');
  assert.ok(e.pauses[0].end && e.pauses[0].durationMs >= 70000);
});

test('micro-arrêt (< 45 s) ne déclenche pas de pause', () => {
  const e = new TrackerEngine();
  let t = 0, m = 0;
  for (let i = 0; i < 10; i++) { e.addPoint(north(m, t)); t += 10000; m += 80; }
  for (let i = 0; i < 2; i++) { e.addPoint(north(m, t)); t += 10000; }
  for (let i = 0; i < 5; i++) { m += 80; e.addPoint(north(m, t)); t += 10000; }
  assert.equal(e.pauses.length, 0);
});

test('D+ : hystérésis qui ignore le bruit mais compte les vraies montées', () => {
  const e = new TrackerEngine();
  let t = 0, m = 0;
  for (let i = 0; i < 60; i++) { e.addPoint({ ...north(m, t), alt: 100 + (i % 2) * 1.2 }); t += 10000; m += 80; }
  assert.ok(e.snapshot().ascentM < 3, 'bruit ±1 m ignoré');
  for (let i = 0; i < 60; i++) { e.addPoint({ ...north(m, t), alt: 100 + i * 5 }); t += 10000; m += 80; }
  const s = e.snapshot();
  assert.ok(s.ascentM > 230 && s.ascentM < 330, `D+ = ${s.ascentM}`);
  assert.ok(s.gradePct > 4 && s.gradePct < 8, `pente = ${s.gradePct}`);   // 5 m / 80 m = 6.2 %
});

test('replay complet du mock : arrivée détectée, ETA, VAM, export GPX', () => {
  let now = mock.points[0].t;
  const e = new TrackerEngine({ clock: () => now });
  e.setRoute(route);
  const seen = {};
  for (const p of mock.points) {
    now = p.t + 3000;
    e.addPoint(p);
    const s = e.snapshot();
    seen[s.status] = (seen[s.status] || 0) + 1;
    if (s.vamMh) seen.vam = Math.max(seen.vam || 0, s.vamMh);
    if (s.eta && !seen.eta) seen.eta = s;
    if (s.pointCount === 500) seen.mid = s;
  }
  const s = e.snapshot();
  assert.equal(s.status, 'finished');
  assert.ok(seen.paused > 0 && seen.moving > 0);
  assert.equal(e.pauses.length, 3, 'une pause de 20 s ne compte pas, les 3 autres oui');
  assert.ok(Math.abs(s.distanceKm - 85.3) < 1);
  assert.ok(s.ascentM > 700 && s.ascentM < 1300, `D+ ${s.ascentM}`);
  assert.ok(seen.vam > 500 && seen.vam < 2000, `VAM max ${seen.vam}`);
  assert.ok(seen.mid.eta && seen.mid.remainingKm > 0 && seen.mid.eta.etaTs > seen.mid.last.t);
  assert.ok(s.movingAvgKmh > 18 && s.movingAvgKmh < 32, `moy ${s.movingAvgKmh}`);
  assert.ok(s.remainingKm < 0.3);
  assert.ok(s.battery < 98 && s.battery > 60);
  const gpx = e.toGPX();
  assert.equal(parseGPXText(gpx).length, e.points.length);
});

test('signal perdu après 3 min sans point', () => {
  let now = 10000;
  const e = new TrackerEngine({ clock: () => now });
  e.addPoint(north(0, 0)); e.addPoint(north(80, 10000));
  assert.equal(e.snapshot().stale, false);
  now = 10000 + 200000;
  assert.equal(e.snapshot().stale, true);
  assert.ok(e.snapshot().lastPointAgeSec > 199);
});

test('finish() explicite et haversine', () => {
  const e = new TrackerEngine();
  e.addPoint(north(0, 0)); e.finish();
  assert.equal(e.snapshot().status, 'finished');
  assert.ok(Math.abs(haversine(0, 0, 0, 1) - 111195) < 100);
});
