import type { DayPlan, Pace, Poi, Slot } from "./types.js";
import { centroid, haversineKm, travelMinutes } from "./geo.js";

export const PACE_PER_DAY: Record<Pace, number> = { intense: 5, balanced: 3, relaxed: 2 };
const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const LUNCH = 12 * 60 + 30;

/** k-means on coordinates; deterministic init (farthest-first). */
export function cluster(items: Poi[], k: number): Poi[][] {
  if (k <= 1 || items.length <= k) return k <= 1 ? [items] : items.map((i) => [i]);
  const centers = [items[0].location];
  while (centers.length < k) {
    let best = items[0], bestD = -1;
    for (const p of items) {
      const d = Math.min(...centers.map((c) => haversineKm(c, p.location)));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push(best.location);
  }
  let groups: Poi[][] = [];
  for (let it = 0; it < 20; it++) {
    groups = Array.from({ length: k }, () => []);
    for (const p of items) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = haversineKm(c, p.location); if (d < bd) { bd = d; bi = i; } });
      groups[bi].push(p);
    }
    groups.forEach((g, i) => { if (g.length) centers[i] = centroid(g.map((p) => p.location)); });
  }
  return groups.filter((g) => g.length);
}

function isOpen(p: Poi, start: number, dow: number): boolean {
  if (p.closedDays?.includes(dow)) return false;
  if (p.opens !== undefined && start < p.opens) return false;
  if (p.closes !== undefined && start + p.visitMinutes > p.closes) return false;
  return true;
}

/**
 * Greedy nearest-neighbour with time windows: from the current position pick the
 * closest POI that fits (opening hours, day end); wait if it opens later (<= 60 min).
 * Restaurants are favoured around lunch. Anything that cannot fit is returned as dropped.
 */
export function orderDay(date: string, pois: Poi[], origin: Poi["location"]): DayPlan {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  const remaining = [...pois];
  const slots: Slot[] = [];
  let t = DAY_START, pos = origin;

  while (remaining.length) {
    const lunchTime = t >= LUNCH - 60 && !slots.some((s) => s.poi.kind === "restaurant");
    const candidates = remaining
      .map((p) => {
        const travel = travelMinutes(pos, p.location);
        let start = t + travel;
        if (p.opens !== undefined && start < p.opens && p.opens - start <= 60) start = p.opens;
        return { p, travel, start };
      })
      .filter((c) => isOpen(c.p, c.start, dow) && c.start + c.p.visitMinutes <= DAY_END)
      .sort((a, b) => {
        if (lunchTime && a.p.kind !== b.p.kind) return a.p.kind === "restaurant" ? -1 : 1;
        if (!lunchTime && a.p.kind !== b.p.kind) return a.p.kind === "activity" ? -1 : 1;
        return a.travel - b.travel;
      });
    const next = candidates[0];
    if (!next) break;
    slots.push({ poi: next.p, startMin: next.start, endMin: next.start + next.p.visitMinutes, travelMinFromPrev: next.travel });
    t = next.start + next.p.visitMinutes;
    pos = next.p.location;
    remaining.splice(remaining.indexOf(next.p), 1);
  }
  return { date, slots, dropped: remaining };
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Group by geography, then order each day. Biggest clusters go on the earliest days. */
export function planDays(startDate: string, days: number, pois: Poi[], base: Poi["location"]): DayPlan[] {
  const groups = cluster(pois, days).sort((a, b) => b.length - a.length);
  return Array.from({ length: days }, (_, i) => orderDay(addDays(startDate, i), groups[i] ?? [], base));
}
