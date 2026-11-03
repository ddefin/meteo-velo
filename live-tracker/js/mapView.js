/**
 * mapView.js — carte Leaflet : trace colorée, parcours prévu, marqueur athlète, pauses, curseur synchronisé.
 * Rendu incrémental (jamais de redessin complet sauf changement de mode) + canvas pour rester léger sur mobile.
 */
/* global L */

const TILES = {
  dark:  { name: 'Sombre', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', opt: { subdomains: 'abcd', maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>' } },
  light: { name: 'Clair',  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  topo:  { name: 'Topo',   url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opt: { subdomains: 'abc', maxZoom: 17, attribution: '© OSM, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a>' } },
};

const BIKE_SVG = `<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="16" cy="16" r="15" fill="rgb(var(--bg))" stroke="rgb(var(--neon))" stroke-width="2"/>
  <g stroke="rgb(var(--fg))" stroke-width="1.8"><circle cx="9.5" cy="19" r="3.6"/><circle cx="22.5" cy="19" r="3.6"/>
  <path d="M9.5 19 13 12h5l4.5 7M13 12l3.5 7h-7M18 12l-1-2h-2.5"/></g></svg>`;

// Échelles de couleur (stops [valeur, r,g,b]) interpolées puis quantifiées en buckets pour limiter le nombre de polylines
const SCALES = {
  grade: { stops: [[-8, 56, 189, 248], [-2, 34, 211, 238], [0, 74, 222, 128], [3, 250, 204, 21], [6, 251, 146, 60], [9, 239, 68, 68], [13, 168, 85, 247]], get: p => p.grade, unit: '%', label: 'Pente' },
  speed: { stops: [[0, 148, 163, 184], [10, 239, 68, 68], [20, 250, 204, 21], [30, 74, 222, 128], [40, 34, 211, 238], [50, 99, 102, 241]], get: p => p.speedKmh, unit: ' km/h', label: 'Vitesse' },
};
function colorAt(scale, v) {
  const s = scale.stops;
  if (v == null || Number.isNaN(v)) return '#94a3b8';
  if (v <= s[0][0]) v = s[0][0]; if (v >= s[s.length - 1][0]) v = s[s.length - 1][0];
  let i = 0; while (i < s.length - 2 && v > s[i + 1][0]) i++;
  const f = (v - s[i][0]) / (s[i + 1][0] - s[i][0] || 1);
  const ch = k => Math.round(s[i][k] + (s[i + 1][k] - s[i][k]) * f);
  return `rgb(${ch(1)},${ch(2)},${ch(3)})`;
}
const quant = (scale, v) => (v == null ? null : Math.round(v * 1.5) / 1.5);

export class MapView {
  constructor(el, { onPickLatLng, onUserMove } = {}) {
    this.el = el; this.onPickLatLng = onPickLatLng; this.onUserMove = onUserMove;
    this.mode = 'grade'; this.follow = true; this.active = true;
    this.drawn = 0; this.chunk = null; this.chunkKey = undefined; this.pauseMarkers = []; this.fitted = false;
    this.map = null;
  }

  init(theme = 'dark') {
    if (this.map) return;
    const map = this.map = L.map(this.el, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5, attributionControl: true, tap: true });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    this.canvas = L.canvas({ padding: 0.3 });
    this.setTiles(localStorage.getItem('tiles') || (theme === 'light' ? 'light' : 'dark'));
    map.setView([45.19, 5.72], 11);

    this.trackGroup = L.layerGroup().addTo(map);
    this.athlete = L.marker([0, 0], { icon: this._athleteIcon('idle'), zIndexOffset: 1000, interactive: false, opacity: 0 }).addTo(map);
    this.cursor = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="cursor-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 900 });
    this.pin = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="pin-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, zIndexOffset: 800 });

    map.on('dragstart', () => { if (this.follow) this.setFollow(false); });     // l'utilisateur explore => on lâche le verrou
    map.on('zoomstart', () => this.athlete._icon?.classList.remove('smooth'));
    map.on('zoomend', () => this.athlete._icon?.classList.add('smooth'));
    map.on('click', e => this.onPickLatLng?.(e.latlng));
    new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(this.el);
  }

  /* ---- fonds de carte */
  setTiles(key) {
    if (!TILES[key]) key = 'dark';
    this.tileKey = key;
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    this.tileLayer = L.tileLayer(TILES[key].url, TILES[key].opt).addTo(this.map);
    this.tileLayer.bringToBack();
    try { localStorage.setItem('tiles', key); } catch {}
  }
  static get tiles() { return TILES; }

  /* ---- parcours prévu (GPX) en pointillés gris */
  setRoute(pts) {
    if (this.routeLine) this.map.removeLayer(this.routeLine);
    if (!pts?.length) return;
    // simplification légère pour l'affichage (1 point sur k)
    const k = Math.max(1, Math.floor(pts.length / 2500));
    const ll = []; for (let i = 0; i < pts.length; i += k) ll.push([pts[i].lat, pts[i].lon]);
    ll.push([pts.at(-1).lat, pts.at(-1).lon]);
    this.routeLine = L.polyline(ll, { color: '#94a3b8', weight: 4, opacity: 0.7, dashArray: '2 9', lineCap: 'round', renderer: this.canvas, interactive: false }).addTo(this.map);
    this.routeLine.bringToBack();
    this.startMk?.remove(); this.endMk?.remove();
    const dot = (c) => L.divIcon({ className: '', html: `<div style="width:14px;height:14px;border-radius:9px;background:${c};border:3px solid #fff"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    this.startMk = L.marker(ll[0], { icon: dot('#22c55e'), interactive: false }).addTo(this.map);
    this.endMk = L.marker(ll.at(-1), { icon: L.divIcon({ className: '', html: '<div style="font-size:22px;line-height:22px">🏁</div>', iconSize: [22, 22], iconAnchor: [4, 20] }), interactive: false }).addTo(this.map);
    if (!this.fitted) { this.map.fitBounds(this.routeLine.getBounds(), { padding: [30, 30] }); }
  }

  /* ---- coloration */
  setMode(mode) { this.mode = mode; this.redrawTrack = true; }
  legend() { const s = SCALES[this.mode]; return { label: s.label, unit: s.unit, stops: s.stops.map(x => ({ v: x[0], c: `rgb(${x[1]},${x[2]},${x[3]})` })) }; }

  /** Dessin incrémental : n'ajoute que les nouveaux points ; fusionne les segments de même couleur. */
  _drawTrack(points) {
    if (this.redrawTrack || points.length < this.drawn) {
      this.trackGroup.clearLayers(); this.drawn = 0; this.chunk = null; this.chunkKey = undefined; this.redrawTrack = false;
    }
    const sc = SCALES[this.mode];
    for (let i = Math.max(1, this.drawn); i < points.length; i++) {
      const p = points[i], q = points[i - 1];
      const key = p.paused ? 'pause' : quant(sc, sc.get(p));
      if (!this.chunk || key !== this.chunkKey) {
        const color = p.paused ? '#94a3b8' : colorAt(sc, key);
        this.chunk = L.polyline([[q.lat, q.lon]], { color, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round', renderer: this.canvas, interactive: false, dashArray: p.paused ? '1 7' : null }).addTo(this.trackGroup);
        this.chunkKey = key;
      }
      this.chunk.addLatLng([p.lat, p.lon]);
    }
    this.drawn = points.length;
  }

  _athleteIcon(state) {
    return L.divIcon({ className: 'smooth', html: `<div class="ath ${state}"><span class="halo"></span>${BIKE_SVG}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] });
  }

  _syncPauses(pauses) {
    pauses.forEach((pz, i) => {
      let m = this.pauseMarkers[i];
      if (!m) {
        m = this.pauseMarkers[i] = L.marker([pz.lat, pz.lon], { icon: L.divIcon({ className: '', html: '<div class="pause-pin">⏸</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 500 }).addTo(this.map);
      }
      const mins = Math.max(1, Math.round(pz.durationMs / 60000));
      m.bindTooltip(`Pause ${mins} min`, { className: 'tt', direction: 'top', offset: [0, -10] });
      m._icon?.firstChild?.classList.toggle('on', pz.end == null);
    });
  }

  /** Appelée à chaque mise à jour moteur. */
  update(engine, snap) {
    if (!this.map || !this.active) { this.dirty = true; return; }
    this.dirty = false;
    this._drawTrack(engine.points);
    this._syncPauses(snap.pauses);
    if (!snap.last) return;
    const ll = [snap.last.lat, snap.last.lon];
    const state = snap.status === 'finished' ? 'finished' : snap.stale ? 'stale' : snap.status === 'paused' ? 'paused' : 'live';
    if (state !== this._state) { this.athlete.setIcon(this._athleteIcon(state)); this._state = state; this.athlete._icon?.classList.add('smooth'); }
    this.athlete.setLatLng(ll).setOpacity(1);
    if (!this.fitted) {
      this.fitted = true;
      if (this.follow || !this.routeLine) this.map.setView(ll, 14);          // suivi actif : zoom sur l'athlète
      else this.map.fitBounds(this.routeLine.getBounds().extend(ll), { padding: [30, 30] });
    } else if (this.follow) this.map.panTo(ll, { animate: true, duration: 1 });
  }

  setFollow(on) {
    this.follow = on; this.onUserMove?.(on);
    if (on && this.athlete?.getLatLng && this.athlete.options.opacity) this.map.setView(this.athlete.getLatLng(), Math.max(this.map.getZoom(), 14), { animate: true });
  }
  fitAll() {
    const b = this.routeLine ? this.routeLine.getBounds() : this.trackGroup.getLayers().length ? L.featureGroup(this.trackGroup.getLayers()).getBounds() : null;
    if (b?.isValid()) { this.setFollow(false); this.map.fitBounds(b, { padding: [30, 30] }); }
  }

  /** Curseur temporaire (survol du graphique). */
  showCursor(ll, label) {
    if (!this.map) return;
    if (!ll) return this.cursor.remove();
    this.cursor.setLatLng(ll).addTo(this.map);
    if (label) this.cursor.bindTooltip(label, { permanent: true, className: 'tt', direction: 'top', offset: [0, -10] }).openTooltip();
  }
  /** Marqueur persistant (clic sur le graphique ou la carte). */
  showPin(ll) { if (!this.map) return; ll ? this.pin.setLatLng(ll).addTo(this.map) : this.pin.remove(); }

  /** (Dés)activation : carte repliée => on ne dessine plus ; à la réouverture on rattrape. */
  setActive(on) { this.active = on; if (on && this.map) setTimeout(() => this.map.invalidateSize(), 50); }
}
