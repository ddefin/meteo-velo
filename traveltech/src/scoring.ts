import type { FlightOffer, Poi, Stay, TripRequest } from "./types.js";
import { haversineKm } from "./geo.js";

/** Bayesian average: few reviews pull the rating toward the prior. */
export function bayesRating(rating: number, reviews: number, prior = 4.0, weight = 50): number {
  return (rating * reviews + prior * weight) / (reviews + weight);
}

export function scorePoi(p: Poi, req: TripRequest): number {
  const quality = bayesRating(p.rating, p.reviews) / 5;
  const match = req.interests.length
    ? p.tags.filter((t) => req.interests.includes(t)).length / req.interests.length
    : 0;
  return quality * 0.6 + Math.min(1, match) * 0.4;
}

/** Hard constraints: diet applies to restaurants only. */
export function eligiblePoi(p: Poi, req: TripRequest): boolean {
  if (p.kind === "restaurant" && req.diet) return p.diet?.includes(req.diet) ?? false;
  return true;
}

export function pickFlight(offers: FlightOffer[]): FlightOffer | undefined {
  // Compromise: price + value of time (0.5 €/min) + 20 € per stop.
  const cost = (f: FlightOffer) => f.priceEur + f.durationMin * 0.5 + f.stops * 20;
  return [...offers].sort((a, b) => cost(a) - cost(b))[0];
}

/** Best stay = quality vs. mean distance to the chosen activities, within budget share. */
export function pickStay(stays: Stay[], activities: Poi[], nightlyCap: number): Stay | undefined {
  const within = stays.filter((s) => s.pricePerNightEur <= nightlyCap);
  const pool = within.length ? within : stays;
  const meanKm = (s: Stay) =>
    activities.length
      ? activities.reduce((t, p) => t + haversineKm(s.location, p.location), 0) / activities.length
      : 0;
  const score = (s: Stay) => s.rating - meanKm(s) * 0.15;
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}
