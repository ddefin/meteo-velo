/**
 * app.js — point d'entrée : relie transport -> TrackerEngine -> (dashboard, carte, profil).
 *
 * Paramètres d'URL :
 *   ?mock=1            rejoue data/mock.json côté client (pas besoin de serveur applicatif)
 *   &speed=60          facteur d'accélération du mock (défaut 30)
 *   &from=40           % de la sortie déjà « passée » au chargement (défaut 35)
 *   ?api=/chemin/      préfixe de l'API (défaut : même origine)
 */
import { TrackerEngine, parseGPXText, profileFromRoute } from './TrackerEngine.js';
import { LiveTransport, MockTransport } from './transport.js';
import { MapView } from './mapView.js';
import { ProfileChart } from './profileChart.js';
import { Dashboard, telegramLink, downloadText, toast } from './ui.js';

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ---------------------------------------------------------------- composants */
const dash = new Dashboard(document);
let engine, transport, athlete = '', profile = [], hasRoute = false, lastSnap = null, pendingFrame = false;
const queue = [];

const mapView = new MapView($('map'), {
  onPickLatLng: ll => pickNearest(ll),
  onUserMove: on => { const b = $('followBtn'); b.setAttribute('aria-pressed', on); b.classList.toggle('!border-neon', on); b.classList.toggle('!text-neon', on); },
});
const chart = new ProfileChart($('profile'), {
  onHoverKm: p => mapView.showCursor(p ? [p.lat, p.lon] : null, p ? `km ${p.km.toFixed(1)} · ${Math.round(p.alt)} m` : null),
  onPickKm: km => { const p = nearestByKm(km); if (p) { chart.pinKm(p.km); mapView.showPin([p.lat, p.lon]); } },
});

/* ---------------------------------------------------------------- moteur */
engine = new TrackerEngine({ clock: () => (transport ? transport.now() : Date.now()) });
engine.on('update', s => { lastSnap = s; schedule(); });

function schedule() { if (!pendingFrame) { pendingFrame = true; requestAnimationFrame(renderFrame); } }
function renderFrame() {
  pendingFrame = false;
  if (queue.length) { engine.addPoints(queue.splice(0)); return; }      // émet 'update' -> re-planifie un rendu
  const s = lastSnap; if (!s) return;
  dash.render(s, engine.clock());
  mapView.update(engine, s);
  syncChart(s);
  updateShare(s);
}

function syncChart(s) {
  if (!hasRoute) {                                           // pas de GPX : profil construit à partir des points reçus (≤ 600 pts)
    const pts = engine.points.filter(p => p.alt != null);
    if (pts.length > 1 && pts.length !== chart._n) {
      const step = Math.max(1, Math.floor(pts.length / 600)); chart._n = pts.length;
      profile = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => ({ km: p.dist / 1000, alt: p.alt, lat: p.lat, lon: p.lon }));
      chart.setProfile(profile); chart.chart.options.scales.x.max = undefined;
    }
  }
  chart.setNowKm(s.last ? s.progressKm : null);
  const info = dash.els.profileInfo;
  if (info && s.altM != null) dash.set('profileInfo', `${Math.round(s.altM)} m`);
}

/* ---------------------------------------------------------------- interactions carte <-> graphique */
const nearestByKm = km => profile.length ? profile.reduce((b, p) => (Math.abs(p.km - km) < Math.abs(b.km - km) ? p : b)) : null;
function pickNearest(ll) {
  if (!profile.length) return;
  let best = null, bd = Infinity;
  for (const p of profile) { const d = (p.lat - ll.lat) ** 2 + ((p.lon - ll.lng) * Math.cos((ll.lat * Math.PI) / 180)) ** 2; if (d < bd) { bd = d; best = p; } }
  chart.pinKm(best.km); mapView.showPin([best.lat, best.lon]);
}

/* ---------------------------------------------------------------- transport */
const callbacks = {
  onMeta: async meta => {
    athlete = meta.athlete || '';
    dash.setTitle([meta.athlete, meta.name].filter(Boolean).join(' · ') || 'Live Tracker');
    if (meta.routeUrl) {
      try {
        const r = await fetch(meta.routeUrl); if (!r.ok) throw 0;
        const pts = parseGPXText(await r.text());
        engine.setRoute(pts); hasRoute = true;
        profile = profileFromRoute(engine.route, 700);
        chart.setProfile(profile); mapView.setRoute(pts);
        dash.set('profileInfo', `${Math.round(engine.route.totalAscentM)} m D+`);
      } catch { toast('Trace GPX introuvable : ETA indisponible'); }
    }
  },
  onPoints: pts => { queue.push(...pts); schedule(); },
  onFinish: () => engine.finish(),
  onStatus: st => { dash.setConn(st); if (st.mode === 'offline') toast(st.label); },
};
transport = q.has('mock')
  ? new MockTransport({ speed: +q.get('speed') || 30, fromPct: q.has('from') ? +q.get('from') : 35, ...callbacks })
  : new LiveTransport({ apiBase: q.get('api') || '', ...callbacks });

/* ---------------------------------------------------------------- UI : boutons, sections repliables, thème */
$('followBtn').onclick = () => mapView.setFollow(!mapView.follow);
$('fitBtn').onclick = () => mapView.fitAll();

// sélecteurs (fonds de carte, coloration)
const mkSeg = (host, items, active, on) => {
  host.innerHTML = '';
  for (const [key, label] of items) {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.key = key; b.className = 'rounded-lg px-2.5 py-1.5 text-xs font-semibold min-h-[32px]';
    b.onclick = () => { on(key); paint(); };
    host.appendChild(b);
  }
  const paint = () => host.querySelectorAll('button').forEach(b => { const a = b.dataset.key === active(); b.classList.toggle('bg-cyan', a); b.classList.toggle('text-bg', a); b.setAttribute('aria-pressed', a); });
  paint();
};
mkSeg($('tileSwitch'), Object.entries(MapView.tiles).map(([k, v]) => [k, v.name]), () => mapView.tileKey, k => mapView.setTiles(k));
mkSeg($('modeSwitch'), [['grade', 'Pente'], ['speed', 'Vitesse']], () => mapView.mode, k => { mapView.setMode(k); drawLegend(); mapView.update(engine, lastSnap || engine.snapshot()); });
function drawLegend() {
  const l = mapView.legend();
  $('legend').innerHTML = `<span>${l.label}</span>` + l.stops.map(s => `<span class="flex items-center gap-0.5"><i class="inline-block h-2 w-3 rounded-sm" style="background:${s.c}"></i>${s.v}</span>`).join('');
}

document.querySelectorAll('[data-collapse]').forEach(btn => {
  const body = $(btn.dataset.collapse);
  const set = open => {
    body.classList.toggle('collapsed-body', !open);
    btn.setAttribute('aria-expanded', open);
    btn.querySelector('[data-chevron]').style.transform = open ? '' : 'rotate(-90deg)';
    if (btn.dataset.collapse === 'mapBody') { mapView.setActive(open); if (open && mapView.dirty) schedule(); }
    if (btn.dataset.collapse === 'chartBody' && open) setTimeout(() => chart.resize(), 30);
    store.set('open:' + btn.dataset.collapse, open ? '1' : '0');
  };
  btn.onclick = () => set(btn.getAttribute('aria-expanded') !== 'true');
  const saved = store.get('open:' + btn.dataset.collapse);
  if (saved === '0') set(false);
});

$('themeBtn').onclick = () => {
  const html = document.documentElement, next = html.dataset.theme === 'light' ? 'dark' : 'light';
  html.dataset.theme = next; store.set('theme', next);
  if (['dark', 'light'].includes(mapView.tileKey)) { mapView.setTiles(next); $('tileSwitch').querySelectorAll('button').forEach(b => { const a = b.dataset.key === next; b.classList.toggle('bg-cyan', a); b.classList.toggle('text-bg', a); }); }
  chart.refreshTheme();
};

function updateShare(s) {
  const base = location.origin + location.pathname;
  $('tgBtn').href = telegramLink(base, s, athlete);
}
$('gpxBtn').onclick = () => {
  if (engine.points.length < 2) return toast('Pas encore de trace à exporter');
  const d = new Date(engine.points[0].t).toISOString().slice(0, 10);
  downloadText(`sortie-${d}.gpx`, engine.toGPX(`Sortie du ${d}`));
};

/* ---------------------------------------------------------------- démarrage */
mapView.init(document.documentElement.dataset.theme);
drawLegend();
chart.init();
dash.render(engine.snapshot(), engine.clock());
setInterval(() => dash.tick(engine.clock()), 1000);              // « dernier point : il y a 45 s » vivant
transport.start().catch(e => { console.error(e); dash.setConn({ mode: 'offline', label: 'Serveur injoignable' }); });

// accès console / debug
window.tracker = { engine, transport, mapView, chart };
