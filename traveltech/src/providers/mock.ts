import type { Poi, TripRequest } from "../types.js";
import type { Providers } from "./types.js";

const pois: Poi[] = [
  { id: "p1", name: "Ortigia – centre historique", kind: "activity", tags: ["history", "walk"], location: { lat: 37.06, lng: 15.293 }, visitMinutes: 120, priceEur: 0, rating: 4.7, reviews: 5000 },
  { id: "p2", name: "Parc archéologique de Neapolis", kind: "activity", tags: ["history", "art"], location: { lat: 37.077, lng: 15.277 }, visitMinutes: 120, priceEur: 15, rating: 4.5, reviews: 9000, opens: 540, closes: 1080 },
  { id: "p3", name: "Musée Paolo Orsi", kind: "activity", tags: ["art", "history"], location: { lat: 37.075, lng: 15.272 }, visitMinutes: 90, priceEur: 8, rating: 4.4, reviews: 1500, opens: 540, closes: 1080, closedDays: [1] },
  { id: "p4", name: "Noto – baroque", kind: "activity", tags: ["art", "walk"], location: { lat: 36.891, lng: 15.07 }, visitMinutes: 180, priceEur: 0, rating: 4.7, reviews: 7000 },
  { id: "p5", name: "Réserve de Vendicari", kind: "activity", tags: ["nature", "beach"], location: { lat: 36.79, lng: 15.09 }, visitMinutes: 180, priceEur: 4, rating: 4.7, reviews: 3000 },
  { id: "p6", name: "Marzamemi", kind: "activity", tags: ["food", "walk"], location: { lat: 36.74, lng: 15.12 }, visitMinutes: 120, priceEur: 0, rating: 4.5, reviews: 2500 },
  { id: "r1", name: "Caseificio Borderi", kind: "restaurant", tags: ["food", "local"], location: { lat: 37.063, lng: 15.292 }, visitMinutes: 60, priceEur: 20, rating: 4.7, reviews: 4000, diet: ["vegetarian"] },
  { id: "r2", name: "Trattoria del Porto", kind: "restaurant", tags: ["food", "seafood"], location: { lat: 37.058, lng: 15.295 }, visitMinutes: 75, priceEur: 35, rating: 4.4, reviews: 900 },
  { id: "r3", name: "Ristorante Cantina Siciliana", kind: "restaurant", tags: ["food", "local"], location: { lat: 36.889, lng: 15.072 }, visitMinutes: 75, priceEur: 28, rating: 4.6, reviews: 1800, diet: ["vegetarian", "vegan"] },
];

export function mockProviders(): Providers {
  return {
    flights: { search: async (_r: TripRequest) => [
      { id: "f1", priceEur: 320, durationMin: 150, stops: 0, co2Kg: 190, pricedAt: new Date().toISOString() },
      { id: "f2", priceEur: 210, durationMin: 330, stops: 1, co2Kg: 260, pricedAt: new Date().toISOString() },
    ] },
    stays: { search: async () => [
      { id: "s1", name: "Boutique hôtel Ortigia", location: { lat: 37.06, lng: 15.294 }, pricePerNightEur: 120, rating: 4.6 },
      { id: "s2", name: "Résidence périphérie", location: { lat: 37.12, lng: 15.2 }, pricePerNightEur: 80, rating: 4.1 },
    ] },
    pois: { search: async () => pois },
  };
}
