// server.mjs — serveur auto-hébergé sans dépendance (Node ≥ 18).
//   node server.mjs               # prod : sert l'app, reçoit les positions du tracker
//   node server.mjs --replay      # démo : rejoue data/mock.json en direct (x REPLAY_SPEED)
//
// Endpoints
//   GET  /api/track?since=<ms>   points depuis `since` (polling de secours)   -> {meta, points, finished}
//   GET  /api/stream             Server-Sent Events (event: point | finish | hello)
//   POST /api/position           ingestion (header  Authorization: Bearer $INGEST_TOKEN)
//                                corps : {t?,lat,lon,alt?,bat?,speed?}  ou tableau, ou  {"finished":true}
// Env : PORT (8080), INGEST_TOKEN (obligatoire hors --replay), REPLAY_SPEED (30)
import http from 'node:http';
import { readFileSync, appendFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8080;
const TOKEN = process.env.INGEST_TOKEN || '';
const REPLAY = process.argv.includes('--replay');
const SPEED = +process.env.REPLAY_SPEED || 30;
const STORE = join(ROOT, 'data/live-track.ndjson');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.gpx': 'application/gpx+xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let meta = { name: 'Sortie en direct', routeUrl: 'data/route.gpx' };
let points = [];
let finished = false;
let simBase = 0, wall0 = 0;                   // replay : temps simulé = simBase + (maintenant - wall0) * SPEED
const speed = REPLAY ? SPEED : 1;
const serverNow = () => (REPLAY ? simBase + (Date.now() - wall0) * SPEED : Date.now());
const clients = new Set();

// --- état initial
if (REPLAY) {
  const mock = JSON.parse(readFileSync(join(ROOT, 'data/mock.json'), 'utf8'));
  meta = { ...meta, ...mock.meta };
  simBase = mock.points[0].t - 60000; wall0 = Date.now();
  let i = 0;
  const tick = () => {                       // les timestamps d'origine sont conservés ; seule l'horloge est accélérée
    while (i < mock.points.length && mock.points[i].t <= serverNow()) publish(mock.points[i++]);
    if (i >= mock.points.length) { setFinished(); clearInterval(timer); }
  };
  const timer = setInterval(tick, 500);
  console.log(`replay x${SPEED} — ${mock.points.length} points`);
} else if (existsSync(STORE)) {
  for (const l of readFileSync(STORE, 'utf8').split('\n')) if (l) { try { const o = JSON.parse(l); o.finished ? (finished = true) : points.push(o); } catch {} }
}

function send(res, evt, data) { res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`); }
function publish(p) {
  points.push(p);
  if (!REPLAY) appendFileSync(STORE, JSON.stringify(p) + '\n');
  for (const c of clients) send(c, 'point', p);
}
function setFinished() {
  finished = true;
  if (!REPLAY) appendFileSync(STORE, JSON.stringify({ finished: true }) + '\n');
  for (const c of clients) send(c, 'finish', {});
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);   // garde la connexion vivante derrière les proxys

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const authOK = req => {
  if (REPLAY) return true;
  const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  return TOKEN.length > 0 && got.length === want.length && timingSafeEqual(got, want);
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    send(res, 'hello', { meta, finished, now: serverNow(), speed });
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/track') {
    const since = +url.searchParams.get('since') || 0;
    return json(res, 200, { meta, finished, now: serverNow(), speed, points: points.filter(p => p.t > since) });
  }
  if (url.pathname === '/api/position' && req.method === 'POST') {
    if (!authOK(req)) return json(res, 401, { error: 'unauthorized' });
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg && msg.finished === true) { setFinished(); return json(res, 200, { ok: true }); }
        let n = 0;
        for (const p of Array.isArray(msg) ? msg : [msg]) {
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
          publish({ t: Number.isFinite(p.t) ? p.t : Date.now(), lat: p.lat, lon: p.lon, alt: p.alt ?? null, bat: p.bat ?? null, speed: p.speed ?? null }); n++;
        }
        json(res, 200, { ok: true, accepted: n });
      } catch { json(res, 400, { error: 'bad json' }); }
    });
    return;
  }

  // --- statique (path traversal bloqué ; node_modules / fichiers cachés / sources serveur exclus)
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
  if (rel.startsWith('..') || /(^|[/\\])(\.|node_modules|server\.mjs|test|tools)/.test(rel) || rel.endsWith('.ndjson')) { res.writeHead(404); return res.end(); }
  const file = join(ROOT, rel);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': rel.startsWith('data/') ? 'no-cache' : 'public, max-age=300' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`live-tracker → http://localhost:${PORT}  (${REPLAY ? 'REPLAY' : TOKEN ? 'prod' : '⚠ INGEST_TOKEN manquant : ingestion refusée'})`));
