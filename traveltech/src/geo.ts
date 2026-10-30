import type { LatLng } from "./types.js";

const R = 6371;
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough urban travel time; swap for a routing matrix (OSRM/Valhalla) later. */
export function travelMinutes(a: LatLng, b: LatLng, kmh = 25): number {
  return Math.ceil((haversineKm(a, b) / kmh) * 60);
}

export function centroid(pts: LatLng[]): LatLng {
  const n = pts.length || 1;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / n,
    lng: pts.reduce((s, p) => s + p.lng, 0) / n,
  };
}
