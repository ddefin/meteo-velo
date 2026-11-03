/**
 * TrackerEngine.js — cœur de traitement des points GPS (aucune dépendance DOM).
 *
 * Entrée  : points bruts {t, lat, lon, alt?, bat?, speed?}   (t = ms epoch, speed = m/s optionnel)
 * Sortie  : engine.snapshot() -> objet plain-JS consommé par l'UI.
 *
 * Utilisable tel quel dans le navigateur (ES module) ET sous Node (tests, mock).
 *
 *   const eng = new TrackerEngine({ clock: () => Date.now() });
 *   eng.setRoute(gpxPoints);              // optionnel : trace prévue [{lat,lon,alt}]
 *   eng.addPoints(jsonMock.points);       // ou eng.addPoint(p) au fil de l'eau
 *   eng.on('update', snap => render(snap));
 */

export const DEFAULTS = {
  pauseSpeedKmh: 2.5,        // sous ce seuil...
  pauseAfterSec: 45,         // ...pendant plus de 45 s => "En pause"
  movingMinKmh: 2,           // la vitesse moyenne en mouvement exclut < 2 km/h
  maxSpeedKmh: 110,          // au-delà = point GPS aberrant, rejeté
  minStepM: 1.5,             // en-dessous = bruit GPS, distance ignorée
  ascentThresholdM: 2.5,     // hystérésis du D+ (filtre le bruit baromètre/GPS)
  altAlpha: 0.35,            // lissage exponentiel de l'altitude
  avgWindowMin: 30,          // fenêtre de la vitesse moyenne pour l'ETA
  vamWindowMin: 15,          // fenêtre de la VAM
  vamMinGainM: 25,           // gain mini dans la fenêtre pour afficher une VAM
  gradeWindowM: 120,         // distance sur laquelle on mesure la pente instantanée
  staleAfterSec: 180,        // pas de point depuis X s => signal perdu
  finishRadiusM: 150,        // rayon d'arrivée autour du dernier point de la trace
  finishMinProgress: 0.92,   // progression mini (fraction de la trace) pour valider l'arrivée
  pauseRadiusM: 25,          // rayon "toujours arrêté" autour du point d'arrêt
  jitterKmh: 9,              // vitesses fantômes tolérées dans ce rayon
  maxPauseRatio: 0.5,        // plafond du ratio pause/mouvement utilisé pour l'ETA
};

const R_EARTH = 6371008.8;
const rad = d => (d * Math.PI) / 180;

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class TrackerEngine {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.clock = opts.clock || (() => Date.now());
    this._listeners = { update: [], point: [], pause: [] };
    this.reset();
  }

  /* ------------------------------------------------------------ events */
  on(evt, fn) { (this._listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this._listeners[evt] = (this._listeners[evt] || []).filter(f => f !== fn); }
  _emit(evt, payload) { for (const f of this._listeners[evt] || []) f(payload); }

  /* ------------------------------------------------------------ state */
  reset() {
    this.points = [];          // points acceptés, enrichis (voir addPoint)
    this.pauses = [];          // {start, end|null, lat, lon, durationMs}
    this.distM = 0;            // distance totale parcourue (m)
    this.movingDistM = 0;
    this.movingMs = 0;
    this.pausedMs = 0;
    this.ascentM = 0;
    this.descentM = 0;
    this._altRef = null;       // référence de l'hystérésis D+
    this._altSmooth = null;
    this._slow = null;         // tampon de segments lents non confirmés {since, dist, ms, lat, lon}
    this._inPause = false;
    this._finished = false;
    this._finishForced = false;
    this.battery = null;
    this.rejected = 0;
    this._routeIdx = 0;        // dernier index snappé (recherche monotone)
    this.routeKm = null;
    if (this.route) this._recomputeRouteProgress();
  }

  /* ------------------------------------------------------------ route (GPX préétabli) */
  /** @param {{lat:number,lon:number,alt?:number}[]} pts */
  setRoute(pts) {
    let d = 0, gain = 0, ref = pts[0]?.alt ?? 0;
    const cum = [];
    for (let i = 0; i < pts.length; i++) {
      if (i) d += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      cum.push(d);
      const a = pts[i].alt;
      if (a != null) {
        if (a - ref > this.cfg.ascentThresholdM) { gain += a - ref; ref = a; }
        else if (ref - a > this.cfg.ascentThresholdM) ref = a;
      }
    }
    this.route = { pts, cum, totalM: d, totalAscentM: gain };
    this._recomputeRouteProgress();
    this._emit('update', this.snapshot());
  }

  _recomputeRouteProgress() {
    this._routeIdx = 0; this.routeKm = null;
    for (const p of this.points) this._snapToRoute(p);
  }

  /** Projette le point sur la trace (recherche monotone dans une fenêtre autour du dernier index). */
  _snapToRoute(p) {
    const r = this.route; if (!r || !r.pts.length) return;
    const n = r.pts.length;
    const back = 15, fwd = Math.max(400, Math.round(n * 0.1));
    let best = -1, bestD = Infinity;
    const scan = (from, to) => {
      for (let i = from; i <= to; i++) {
        const d = haversine(p.lat, p.lon, r.pts[i].lat, r.pts[i].lon);
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    scan(Math.max(0, this._routeIdx - back), Math.min(n - 1, this._routeIdx + fwd));
    if (bestD > 400) { scan(0, n - 1); }       // perdu / raccourci : recherche globale
    if (best < 0) return;
    this._routeIdx = best;
    p.routeKm = r.cum[best] / 1000;
    p.offRouteM = bestD;
    this.routeKm = p.routeKm;
  }

  /* ------------------------------------------------------------ ingestion */
  addPoints(list) { for (const p of list) this.addPoint(p, true); this._emit('update', this.snapshot()); }

  /** Marque la sortie comme terminée (message explicite du tracker). */
  finish() { this._finishForced = true; this._emit('update', this.snapshot()); }

  /**
   * @returns {boolean} true si le point a été accepté
   */
  addPoint(raw, batch = false) {
    const c = this.cfg;
    if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon) || !Number.isFinite(raw.t)) { this.rejected++; return false; }
    if (raw.bat != null) this.battery = raw.bat;
    if (raw.finished) this._finishForced = true;
    const prev = this.points[this.points.length - 1];
    if (prev && raw.t <= prev.t) { this.rejected++; return false; }          // doublon / désordre

    // altitude lissée
    let alt = raw.alt ?? null;
    if (alt != null) {
      this._altSmooth = this._altSmooth == null ? alt : this._altSmooth + c.altAlpha * (alt - this._altSmooth);
      alt = this._altSmooth;
    }

    const p = {
      t: raw.t, lat: raw.lat, lon: raw.lon, alt,
      dist: this.distM, speedKmh: 0, grade: null, paused: false,
      routeKm: null, offRouteM: null,
    };

    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      const step = haversine(prev.lat, prev.lon, p.lat, p.lon);
      const v = raw.speed != null && Number.isFinite(raw.speed) ? raw.speed * 3.6 : (step / dt) * 3.6;
      if ((step / dt) * 3.6 > c.maxSpeedKmh) { this.rejected++; return false; }  // saut GPS
      p.speedKmh = v;
      const d = step >= c.minStepM || v >= c.pauseSpeedKmh ? step : 0;
      this.distM += d;
      p.dist = this.distM;
      this._classifySegment(prev, p, dt * 1000, d);
      this._elevation(prev, p);
    } else {
      this._altRef = alt;
    }

    p.paused = this._inPause;
    p.grade = this._gradeAt(p);
    this._snapToRoute(p);
    this.points.push(p);
    this._emit('point', p);
    if (!batch) this._emit('update', this.snapshot());
    return true;
  }

  /** Machine à états pause : lent > 45 s => pause (rétroactive), sinon le tampon est réintégré au mouvement. */
  _classifySegment(prev, p, ms, d) {
    const c = this.cfg;
    // Anti-jitter : à l'arrêt le GPS "danse" (3–8 km/h fantômes). Tant qu'on reste dans un rayon
    // de `pauseRadiusM` autour du point d'arrêt, un segment jusqu'à `jitterKmh` reste "lent".
    const inZone = this._slow && haversine(this._slow.lat, this._slow.lon, p.lat, p.lon) < c.pauseRadiusM;
    const slow = p.speedKmh < c.pauseSpeedKmh || (inZone && p.speedKmh < c.jitterKmh);
    if (slow) {
      if (!this._slow) this._slow = { since: prev.t, dist: 0, ms: 0, lat: prev.lat, lon: prev.lon, movingMs: 0, movingDist: 0 };
      const s = this._slow;
      s.dist += d; s.ms += ms;
      if (p.speedKmh >= c.movingMinKmh) { s.movingMs += ms; s.movingDist += d; }   // 2–2.5 km/h : lent mais encore "en mouvement" si la pause n'est pas confirmée
      if (!this._inPause && p.t - s.since >= c.pauseAfterSec * 1000) {
        this._inPause = true;
        const pz = { start: s.since, end: null, lat: s.lat, lon: s.lon, durationMs: 0 };
        this.pauses.push(pz);
        this.pausedMs += s.ms - ms;                 // le tampon est requalifié en pause (sans le segment courant, ajouté ci-dessous)
        this._emit('pause', pz);
      }
      if (this._inPause) {
        this.pausedMs += ms;
        const pz = this.pauses[this.pauses.length - 1];
        pz.durationMs = p.t - pz.start;
      }
    } else {
      if (this._inPause) {
        const pz = this.pauses[this.pauses.length - 1];
        pz.end = prev.t; pz.durationMs = pz.end - pz.start;
        this._inPause = false;
      } else if (this._slow) {                      // micro-arrêt < 45 s : on réintègre au mouvement
        this.movingMs += this._slow.movingMs; this.movingDistM += this._slow.movingDist;
      }
      this._slow = null;
      if (p.speedKmh >= c.movingMinKmh) { this.movingMs += ms; this.movingDistM += d; }
    }
  }

  _elevation(prev, p) {
    const t = this.cfg.ascentThresholdM;
    if (p.alt == null) return;
    if (this._altRef == null) { this._altRef = p.alt; return; }
    if (p.alt - this._altRef > t) { this.ascentM += p.alt - this._altRef; this._altRef = p.alt; }
    else if (this._altRef - p.alt > t) { this.descentM += this._altRef - p.alt; this._altRef = p.alt; }
  }

  /** Pente (%) mesurée sur ~gradeWindowM derrière le point. */
  _gradeAt(p) {
    if (p.alt == null) return null;
    for (let i = this.points.length - 1; i >= 0; i--) {
      const q = this.points[i];
      if (q.alt == null) return null;
      const dd = p.dist - q.dist;
      if (dd >= this.cfg.gradeWindowM) return Math.max(-30, Math.min(30, ((p.alt - q.alt) / dd) * 100));
    }
    return null;
  }

  /* ------------------------------------------------------------ métriques dérivées */
  /** Points dont le timestamp est dans [now-minutes, now] (parcours depuis la fin). */
  _window(minutes) {
    const last = this.points[this.points.length - 1]; if (!last) return [];
    const from = last.t - minutes * 60000, out = [];
    for (let i = this.points.length - 1; i >= 0 && this.points[i].t >= from; i--) out.push(this.points[i]);
    return out.reverse();
  }

  /** Vitesse moyenne en mouvement (km/h) sur une fenêtre : distance / temps hors pauses. */
  _movingSpeedWindow(minutes) {
    const w = this._window(minutes);
    let dist = 0, ms = 0;
    for (let i = 1; i < w.length; i++) {
      if (w[i].paused || w[i].speedKmh < this.cfg.movingMinKmh) continue;
      dist += w[i].dist - w[i - 1].dist; ms += w[i].t - w[i - 1].t;
    }
    return ms > 0 ? (dist / 1000) / (ms / 3600000) : null;
  }

  /** VAM (m/h) : gain net d'altitude / temps sur la fenêtre, uniquement si on grimpe vraiment. */
  _vam() {
    const w = this._window(this.cfg.vamWindowMin);
    if (w.length < 2 || w[0].alt == null) return null;
    const first = w[0], last = w[w.length - 1];
    const gain = last.alt - first.alt, hours = (last.t - first.t) / 3600000;
    const dist = last.dist - first.dist;
    if (hours < 0.05 || gain < this.cfg.vamMinGainM || dist <= 0 || gain / dist < 0.03) return null;
    return gain / hours;
  }

  /** ETA = restant / vitesse mouvement 30 min + pauses estimées. */
  _eta(now, remainingM) {
    if (remainingM == null) return null;
    const v = this._movingSpeedWindow(this.cfg.avgWindowMin) ?? this._movingSpeedOverall();
    if (!v || v < 1) return null;
    const travelMs = (remainingM / 1000 / v) * 3600000;
    const ratio = this.movingMs > 0 ? Math.min(this.cfg.maxPauseRatio, this.pausedMs / this.movingMs) : 0;
    const pauseMs = travelMs * ratio;
    const stoppedMs = this._inPause ? now - this.pauses[this.pauses.length - 1].start : 0;
    return { etaTs: now + travelMs + pauseMs, travelMs, pauseMs, stoppedMs, speedKmh: v };
  }

  _movingSpeedOverall() { return this.movingMs > 0 ? (this.movingDistM / 1000) / (this.movingMs / 3600000) : null; }

  /* ------------------------------------------------------------ snapshot */
  snapshot() {
    const c = this.cfg, now = this.clock();
    const last = this.points[this.points.length - 1] || null;
    const ageSec = last ? Math.max(0, (now - last.t) / 1000) : null;
    const route = this.route;

    let progressM = this.distM;
    if (route && this.routeKm != null) progressM = this.routeKm * 1000;
    const remainingM = route && this.routeKm != null ? Math.max(0, route.totalM - progressM) : null;

    let finished = this._finishForced;
    if (!finished && route && last && this.routeKm != null) {
      const end = route.pts[route.pts.length - 1];
      const near = haversine(last.lat, last.lon, end.lat, end.lon) < c.finishRadiusM;
      if (near && progressM / route.totalM >= c.finishMinProgress) finished = true;
    }

    let status = 'idle';
    if (last) status = finished ? 'finished' : this._inPause ? 'paused' : 'moving';
    const pauseNow = this._inPause ? this.pauses[this.pauses.length - 1] : null;

    const eta = !finished && last ? this._eta(now, remainingM) : null;
    return {
      status,
      stale: !!last && !finished && ageSec > c.staleAfterSec,
      pausedSinceMs: pauseNow ? now - pauseNow.start : 0,
      last: last && { t: last.t, lat: last.lat, lon: last.lon, alt: last.alt },
      lastPointAgeSec: ageSec,
      battery: this.battery,
      distanceKm: this.distM / 1000,
      progressKm: progressM / 1000,
      remainingKm: remainingM == null ? null : remainingM / 1000,
      routeTotalKm: route ? route.totalM / 1000 : null,
      ascentM: this.ascentM,
      descentM: this.descentM,
      gradePct: last ? last.grade : null,
      altM: last ? last.alt : null,
      speedKmh: last ? (this._inPause ? 0 : last.speedKmh) : null,
      movingAvgKmh: this._movingSpeedOverall(),
      recentAvgKmh: this._movingSpeedWindow(c.avgWindowMin),
      vamMh: this._vam(),
      elapsedMs: this.points.length > 1 ? this.points[this.points.length - 1].t - this.points[0].t : 0,
      movingMs: this.movingMs,
      pausedMs: this.pausedMs,
      eta,
      pauses: this.pauses,
      pointCount: this.points.length,
      offRouteM: last ? last.offRouteM : null,
    };
  }

  /* ------------------------------------------------------------ export */
  /** Trace effectuée jusqu'ici au format GPX 1.1. */
  toGPX(name = 'Sortie en direct') {
    const esc = s => s.replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
    const pts = this.points.map(p =>
      `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
      (p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
      `<time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="live-tracker" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `<trk><name>${esc(name)}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
  }
}

/** Parse un GPX (string) en [{lat,lon,alt}] — fonctionne navigateur (DOMParser) ; sous Node utiliser parseGPXText. */
export function parseGPXText(xml) {
  const out = [], re = /<(?:trkpt|rtept)\b[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const ele = m[3] && /<ele>([-\d.]+)<\/ele>/.exec(m[3]);
    out.push({ lat: +m[1], lon: +m[2], alt: ele ? +ele[1] : null });
  }
  return out;
}

/** Rééchantillonne la trace pour l'affichage (profil d'altitude) : ~n points, régulièrement espacés en distance. */
export function profileFromRoute(route, n = 600) {
  if (!route) return [];
  const { pts, cum, totalM } = route, out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (totalM * k) / (n - 1);
    while (j < cum.length - 1 && cum[j] < target) j++;
    out.push({ km: cum[j] / 1000, alt: pts[j].alt, lat: pts[j].lat, lon: pts[j].lon, idx: j });
  }
  return out;
}
