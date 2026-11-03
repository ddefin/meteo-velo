/**
 * transport.js — acheminement des points vers le TrackerEngine.
 *
 * Deux sources interchangeables (même interface) :
 *   LiveTransport  : SSE (/api/stream) avec repli HTTP polling 30 s (/api/track?since=)
 *   MockTransport  : rejoue data/mock.json côté client (démo / dev, sans serveur applicatif)
 *
 * Interface : start(), stop(), now() -> ms (horloge « serveur », éventuellement simulée)
 * Callbacks : onMeta(meta), onPoints(points[]), onFinish(), onStatus({mode, label})
 */

class Clock {
  /** Horloge synchronisée sur le serveur (corrige le décalage de l'appareil) et pouvant être accélérée (démo). */
  constructor() { this.set(Date.now(), 1); }
  set(serverNow, speed = 1) { this.ref = Date.now(); this.base = serverNow; this.speed = speed; }
  now() { return this.base + (Date.now() - this.ref) * this.speed; }
}

export class LiveTransport {
  constructor({ apiBase = '', pollMs = 30000, onMeta, onPoints, onFinish, onStatus }) {
    Object.assign(this, { apiBase, pollMs, onMeta, onPoints, onFinish, onStatus });
    this.clock = new Clock();
    this.lastT = 0;
    this.es = null; this.pollTimer = null; this.sseFails = 0; this.pollsSinceSse = 0; this.stopped = false;
  }
  now() { return this.clock.now(); }

  async start() {
    this.stopped = false;
    document.addEventListener('visibilitychange', this._onVis = () => { if (!document.hidden) this.catchUp(); });
    await this.catchUp(true);
    this.openSSE();
  }
  stop() {
    this.stopped = true; this.es?.close(); clearTimeout(this.pollTimer);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  /** Récupère (ou rattrape après coupure) les points depuis le dernier timestamp reçu. */
  async catchUp(first = false) {
    try {
      const r = await fetch(`${this.apiBase}api/track?since=${this.lastT}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      this.clock.set(j.now, j.speed || 1);
      if (first) this.onMeta?.(j.meta);
      this._deliver(j.points);
      if (j.finished) this.onFinish?.();
      return true;
    } catch (e) {
      this.onStatus?.({ mode: 'offline', label: 'Hors ligne — nouvelle tentative…' });
      return false;
    }
  }

  _deliver(points) {
    if (!points?.length) return;
    this.lastT = Math.max(this.lastT, points[points.length - 1].t);
    this.onPoints?.(points);
  }

  openSSE() {
    if (this.stopped || !('EventSource' in window)) return this.startPolling();
    clearTimeout(this.pollTimer);
    const es = this.es = new EventSource(`${this.apiBase}api/stream`);
    es.addEventListener('hello', e => {
      const j = JSON.parse(e.data);
      this.clock.set(j.now, j.speed || 1);
      this.sseFails = 0;
      this.onStatus?.({ mode: 'sse', label: j.speed > 1 ? `Démo ×${j.speed}` : 'En direct' });
      this.catchUp();                                       // comble le trou éventuel après reconnexion
      if (j.finished) this.onFinish?.();
    });
    es.addEventListener('point', e => this._deliver([JSON.parse(e.data)]));
    es.addEventListener('finish', () => this.onFinish?.());
    es.onerror = () => {
      this.sseFails++;
      // EventSource se reconnecte seul ; après 3 échecs on bascule en polling et on retentera SSE plus tard
      if (this.sseFails >= 3 || es.readyState === EventSource.CLOSED) { es.close(); this.startPolling(); }
    };
  }

  startPolling() {
    if (this.stopped) return;
    this.onStatus?.({ mode: 'poll', label: `Actualisation ${this.pollMs / 1000} s` });
    const tick = async () => {
      if (this.stopped) return;
      if (!document.hidden) await this.catchUp();
      if (++this.pollsSinceSse >= 10) { this.pollsSinceSse = 0; this.sseFails = 0; return this.openSSE(); }   // retente SSE
      this.pollTimer = setTimeout(tick, this.pollMs);
    };
    this.pollTimer = setTimeout(tick, this.pollMs);
  }
}

export class MockTransport {
  /**
   * @param {object} o  url: mock.json ; speed: facteur de temps ; fromPct: part de la sortie déjà « passée » au démarrage (%)
   */
  constructor({ url = 'data/mock.json', speed = 30, fromPct = 35, onMeta, onPoints, onFinish, onStatus }) {
    Object.assign(this, { url, speed, fromPct, onMeta, onPoints, onFinish, onStatus });
    this.clock = new Clock();
  }
  now() { return this.clock.now(); }

  async start() {
    const mock = await (await fetch(this.url, { cache: 'no-store' })).json();
    const pts = mock.points;
    this.onMeta?.(mock.meta);
    const startIdx = Math.max(1, Math.floor((pts.length * this.fromPct) / 100));
    this.clock.set(pts[startIdx - 1].t + 2000, this.speed);
    this.onPoints?.(pts.slice(0, startIdx));
    this.onStatus?.({ mode: 'mock', label: `Démo ×${this.speed}` });
    let i = startIdx;
    this.timer = setInterval(() => {
      const batch = [], now = this.clock.now();
      while (i < pts.length && pts[i].t <= now) batch.push(pts[i++]);
      if (batch.length) this.onPoints?.(batch);
      if (i >= pts.length) { clearInterval(this.timer); this.onFinish?.(); }
    }, 500);
  }
  stop() { clearInterval(this.timer); }
}
