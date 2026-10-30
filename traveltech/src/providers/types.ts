import type { FlightOffer, Poi, Stay, TripRequest } from "../types.js";

// One adapter per external API (Duffel, Expedia Rapid, Foursquare...).
// The planner only ever sees these normalised shapes.
export interface FlightProvider { search(req: TripRequest): Promise<FlightOffer[]> }
export interface StayProvider { search(req: TripRequest): Promise<Stay[]> }
export interface PoiProvider { search(req: TripRequest): Promise<Poi[]> }
export interface Providers { flights: FlightProvider; stays: StayProvider; pois: PoiProvider }
