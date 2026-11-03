/**
 * ui.js — rendu du tableau de bord. Aucune reconstruction du DOM : on met à jour des nœuds texte existants,
 * et seulement quand la valeur change (zéro clignotement, zéro reflow inutile).
 */

const nfCache = {};
const nf = (v, d = 1) => (nfCache[d] ||= new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })).format(v);
const pad = n => String(n).padStart(2, '0');
export const fmtClock = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
  return h ? `${h} h ${pad(m % 60)}` : `${m} min`;
}
export function fmtAge(sec) {
  if (sec == null) return '–';
  if (sec < 5) return 'à l’instant';
  if (sec < 60) return `il y a ${Math.round(sec)} s`;
  if (sec < 3600) return `il y a ${Math.floor(sec / 60)} min ${pad(Math.round(sec % 60))} s`.replace(/ 00 s$/, '');
  return `il y a ${fmtDur(sec * 1000)}`;
}

const BADGES = {
  idle:     ['⏳ En attente du départ', 'bg-panel2 text-mute'],
  moving:   ['🟢 En déplacement', 'bg-neon/15 text-neon'],
  paused:   ['☕ En pause', 'bg-warn/15 text-warn'],
  finished: ['🏁 Sortie terminée', 'bg-cyan/15 text-cyan'],
};

export class Dashboard {
  constructor(root = document) {
    this.root = root;
    this.els = {};
    root.querySelectorAll('[data-k]').forEach(e => (this.els[e.dataset.k] = e));
    this.badge = root.getElementById('statusBadge');
    this.fill = root.getElementById('progressFill');
    this.bar = root.getElementById('progressBar');
    this.dot = root.getElementById('connDot');
    this._cache = new Map();
  }

  /** Écrit un texte seulement s'il a changé. */
  set(k, v) {
    if (this._cache.get(k) === v) return;
    this._cache.set(k, v);
    const e = this.els[k]; if (e) e.textContent = v;
  }
  setClass(el, cls) { if (this._cache.get(el) !== cls) { this._cache.set(el, cls); el.className = cls; } }

  setTitle(t) { this.set('title', t); document.title = `${t} · Live`; }
  setConn({ mode, label }) {
    this.set('conn', label);
    const c = { sse: 'bg-neon', mock: 'bg-cyan', poll: 'bg-warn', offline: 'bg-bad' }[mode] || 'bg-mute';
    this.setClass(this.dot, `inline-block h-2 w-2 rounded-full ${c} ${mode === 'sse' || mode === 'mock' ? 'animate-pulse' : ''}`);
  }

  /** Mise à jour complète depuis un snapshot du moteur. */
  render(s, now) {
    this.s = s;
    const route = s.routeTotalKm != null;
    this.set('dist', nf(s.distanceKm));
    this.set('distSub', route ? `sur ${nf(s.routeTotalKm, 0)} km au total` : 'depuis le départ');
    this.set('remain', s.remainingKm != null ? nf(s.remainingKm) : '–');
    this.set('remainSub', s.offRouteM > 250 ? `⚠ à ${nf(s.offRouteM / 1000)} km du parcours` : route ? 'sur la trace prévue' : 'pas de trace GPX');
    this.set('avg', s.movingAvgKmh != null ? nf(s.movingAvgKmh) : '–');
    this.set('avgSub', s.recentAvgKmh != null ? `30 min : ${nf(s.recentAvgKmh)} km/h` : 'pauses exclues');
    this.set('speed', s.speedKmh != null ? nf(s.speedKmh) : '–');
    this.set('vam', s.vamMh != null ? nf(s.vamMh, 0) : '–');
    this.set('vamSub', s.vamMh != null ? 'moyenne sur 15 min' : 'pas en montée');
    this.set('grade', s.gradePct != null ? `${s.gradePct > 0 ? '+' : ''}${nf(s.gradePct)}` : '–');
    this.set('ascent', nf(s.ascentM, 0));
    this.set('ascentSub', `D− ${nf(s.descentM, 0)} m`);
    this.set('battery', s.battery != null ? nf(s.battery, 0) : '–');
    this.set('batterySub', s.battery == null ? ' ' : s.battery <= 15 ? '⚠ très faible' : s.battery <= 30 ? 'faible' : 'correcte');
    this.els.battery?.parentElement.classList.toggle('text-bad', s.battery != null && s.battery <= 15);

    const pct = route && s.routeTotalKm ? Math.min(100, (s.progressKm / s.routeTotalKm) * 100) : null;
    this.fill.style.width = `${pct ?? 0}%`;
    this.bar.setAttribute('aria-valuenow', Math.round(pct ?? 0));
    this.set('pctLabel', pct != null ? `${nf(pct, 0)} %` : '');
    this.set('totalLabel', s.elapsedMs ? `${fmtDur(s.movingMs)} roulées · ${fmtDur(s.pausedMs)} de pause` : '');
    this.set('timeSub', s.last ? `à ${fmtClock(s.last.t)}` : '');

    // ETA
    if (s.status === 'finished') {
      this.set('eta', s.last ? fmtClock(s.last.t) : '--:--');
      this.set('etaIn', 'Arrivé !');
      this.set('etaSub', `durée ${fmtDur(s.elapsedMs)}`);
    } else if (s.eta) {
      const days = Math.floor((new Date(s.eta.etaTs).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
      this.set('eta', fmtClock(s.eta.etaTs) + (days > 0 ? `+${days}j` : ''));
      this.set('etaSub', `${nf(s.eta.speedKmh)} km/h · pauses ≈ ${fmtDur(s.eta.pauseMs)}`);
    } else {
      this.set('eta', '--:--');
      this.set('etaIn', '–');
      this.set('etaSub', route ? 'calcul en cours…' : 'trace GPX requise');
    }
    this.tick(now);
  }

  /** Éléments dépendant de l'horloge (appelé chaque seconde sans recalcul moteur). */
  tick(now) {
    const s = this.s; if (!s) return;
    const age = s.last ? Math.max(0, (now - s.last.t) / 1000) : null;
    this.set('age', s.status === 'finished' ? 'Sortie terminée' : fmtAge(age));
    this.els.age.classList.toggle('text-bad', !!s.stale);
    this.els.age.classList.toggle('text-neon', age != null && age < 60 && s.status !== 'finished');

    let [label, cls] = BADGES[s.status];
    if (s.status === 'paused') {
      const since = s.pauses.length ? now - s.pauses[s.pauses.length - 1].start : 0;
      label = `☕ En pause (depuis ${fmtDur(since)})`;
    } else if (s.stale && s.status === 'moving') { label = '📡 Signal perdu'; cls = 'bg-bad/15 text-bad'; }
    this.badge.textContent !== label && (this.badge.textContent = label);
    this.setClass(this.badge, `chip ${cls}`);

    if (s.eta && s.status !== 'finished') this.set('etaIn', `dans ${fmtDur(Math.max(0, s.eta.etaTs - now))}`);
  }
}

export function toast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg;
  t.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 2500);
}

/** Lien de partage Telegram pré-rempli (km parcourus, km restants, ETA). */
export function telegramLink(url, s, athlete = '') {
  const parts = [`🚴 ${athlete ? athlete + ' — ' : ''}${nf(s.distanceKm)} km parcourus`];
  if (s.remainingKm != null) parts[0] += `, ${nf(s.remainingKm)} km restants`;
  if (s.status === 'finished') parts.push('🏁 Arrivé !');
  else if (s.status === 'paused') parts.push('☕ En pause');
  if (s.eta && s.status !== 'finished') parts.push(`Arrivée estimée vers ${fmtClock(s.eta.etaTs)}`);
  parts.push('Suivi en direct :');
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(parts.join('\n'))}`;
}

export function downloadText(filename, text, mime = 'application/gpx+xml') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
