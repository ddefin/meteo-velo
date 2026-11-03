/**
 * profileChart.js — profil d'altitude Chart.js, synchronisé avec la carte.
 *   - survol / toucher  -> onHoverKm(km | null)   (la carte déplace son curseur)
 *   - pinKm(km)         -> trait + point surlignés (clic sur la carte)
 *   - setNowKm(km)      -> marqueur vertical « position actuelle »
 * Le crosshair est un petit plugin maison (pas de dépendance externe).
 */
/* global Chart */

const css = n => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim().split(' ').join(',');
const rgb = (n, a = 1) => `rgba(${css(n)},${a})`;

export class ProfileChart {
  constructor(canvas, { onHoverKm, onPickKm } = {}) {
    this.canvas = canvas; this.onHoverKm = onHoverKm; this.onPickKm = onPickKm;
    this.profile = []; this.nowKm = null; this.hoverKm = null; this.pinned = null; this.lastDoneKm = -1;
    this.chart = null;
  }

  init() {
    if (this.chart) return;
    const self = this;
    const crosshair = {
      id: 'crosshair',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: a, scales: { x, y } } = chart;
        const line = (km, color, w, dash = []) => {
          if (km == null) return;
          const px = x.getPixelForValue(km); if (px < a.left || px > a.right) return;
          ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
          ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.restore();
        };
        line(self.pinned?.km, rgb('warn'), 1.5, [5, 4]);
        line(self.hoverKm, rgb('fg', 0.55), 1);
        if (self.nowKm != null) {                                   // position actuelle exacte
          line(self.nowKm, rgb('neon'), 2);
          const p = self._altAt(self.nowKm); const px = x.getPixelForValue(self.nowKm);
          if (p != null && px >= a.left && px <= a.right) {
            const py = y.getPixelForValue(p);
            ctx.save(); ctx.fillStyle = rgb('neon'); ctx.strokeStyle = rgb('bg'); ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.stroke(); ctx.fill(); ctx.restore();
          }
        }
        if (self.pinned) {
          const px = x.getPixelForValue(self.pinned.km), py = y.getPixelForValue(self.pinned.alt);
          ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = rgb('warn'); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(px, py, 5.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      },
    };

    this.chart = new Chart(this.canvas, {
      type: 'line',
      data: { datasets: [
        { label: 'Parcours', data: [], parsing: false, borderColor: rgb('mute', 0.55), backgroundColor: rgb('mute', 0.12), fill: 'origin', pointRadius: 0, borderWidth: 1.5, tension: 0.15 },
        { label: 'Parcouru', data: [], parsing: false, borderColor: rgb('cyan'), backgroundColor: rgb('cyan', 0.28), fill: 'origin', pointRadius: 0, borderWidth: 2.5, tension: 0.15 },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { top: 6, right: 6 } },
        scales: {
          x: { type: 'linear', title: { display: false }, grid: { color: rgb('line', 0.06) }, ticks: { color: rgb('mute'), maxTicksLimit: 8, callback: v => `${Math.round(v)} km` }, border: { display: false } },
          y: { grid: { color: rgb('line', 0.06) }, ticks: { color: rgb('mute'), maxTicksLimit: 5, callback: v => `${v} m` }, border: { display: false }, grace: '8%' },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: it => it.datasetIndex === 0,
            displayColors: false, backgroundColor: rgb('panel', 0.96), titleColor: rgb('fg'), bodyColor: rgb('fg'), borderColor: rgb('line', 0.15), borderWidth: 1, padding: 8,
            callbacks: { title: it => `km ${it[0].parsed.x.toFixed(1)}`, label: it => `${Math.round(it.parsed.y)} m${self._gradeLabel(it.dataIndex)}` },
          },
        },
        onHover: (evt, _els, chart) => {
          if (!evt.native || evt.type === 'mouseout') return self._setHover(null);
          const km = chart.scales.x.getValueForPixel(evt.x);
          const a = chart.chartArea;
          self._setHover(evt.x < a.left || evt.x > a.right ? null : km);
        },
        onClick: (evt, _e, chart) => {
          const km = chart.scales.x.getValueForPixel(evt.x);
          const pt = self._nearest(km); if (pt) self.onPickKm?.(pt.km);
        },
      },
      plugins: [crosshair],
    });
    this.canvas.addEventListener('mouseleave', () => this._setHover(null));
    this.canvas.addEventListener('touchend', () => setTimeout(() => this._setHover(null), 1500), { passive: true });
  }

  /** @param {{km,alt,lat,lon}[]} profile */
  setProfile(profile) {
    this.profile = profile.filter(p => p.alt != null);
    this.init();
    this.chart.data.datasets[0].data = this.profile.map(p => ({ x: p.km, y: p.alt }));
    this.lastDoneKm = -1;
    this.chart.options.scales.x.min = 0; this.chart.options.scales.x.max = this.profile.at(-1)?.km;
    this.chart.update('none');
  }

  /** Profil « parcouru » seul (pas de GPX) : alimente aussi la courbe principale. */
  setNowKm(km) {
    this.nowKm = km;
    if (!this.chart) return;
    if (km != null && Math.abs(km - this.lastDoneKm) > 0.05) {
      this.lastDoneKm = km;
      this.chart.data.datasets[1].data = this.profile.filter(p => p.km <= km).map(p => ({ x: p.km, y: p.alt }));
    }
    this.chart.update('none');
  }
  pinKm(km) {
    const p = km == null ? null : this._nearest(km);
    this.pinned = p ? { km: p.km, alt: p.alt } : null;
    this.chart?.update('none');
  }

  _setHover(km) {
    if (km === this.hoverKm) return;
    this.hoverKm = km; this.chart.draw();
    const p = km == null ? null : this._nearest(km);
    this.onHoverKm?.(p);
  }
  _nearest(km) {
    const P = this.profile; if (!P.length) return null;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; P[m].km < km ? (lo = m) : (hi = m); }
    return Math.abs(P[lo].km - km) <= Math.abs(P[hi].km - km) ? P[lo] : P[hi];
  }
  _altAt(km) { const p = this._nearest(km); return p ? p.alt : null; }
  _gradeLabel(i) {
    const P = this.profile, a = P[Math.max(0, i - 3)], b = P[Math.min(P.length - 1, i + 3)];
    const d = (b.km - a.km) * 1000; if (!d) return '';
    return ` · ${(((b.alt - a.alt) / d) * 100).toFixed(1)} %`;
  }

  /** Thème changé : recolore. */
  refreshTheme() {
    if (!this.chart) return;
    const ds = this.chart.data.datasets, o = this.chart.options.scales;
    ds[0].borderColor = rgb('mute', 0.55); ds[0].backgroundColor = rgb('mute', 0.12);
    ds[1].borderColor = rgb('cyan'); ds[1].backgroundColor = rgb('cyan', 0.28);
    for (const s of [o.x, o.y]) { s.grid.color = rgb('line', 0.06); s.ticks.color = rgb('mute'); }
    this.chart.update('none');
  }
  resize() { this.chart?.resize(); }
}
