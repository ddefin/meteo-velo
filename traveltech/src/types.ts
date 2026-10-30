export type Pace = "intense" | "balanced" | "relaxed";
export type GroupType = "solo" | "couple" | "family" | "friends";

export interface TripRequest {
  destination: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  budgetEur: number;
  pace: Pace;
  group: { type: GroupType; adults: number; children: number };
  interests: string[]; // ex: "art", "food", "nature"
  diet?: "vegetarian" | "vegan";
}

export interface LatLng { lat: number; lng: number }

export interface Poi {
  id: string;
  name: string;
  kind: "activity" | "restaurant";
  tags: string[];
  location: LatLng;
  visitMinutes: number;
  priceEur: number;
  rating: number; // 0..5
  reviews: number;
  /** Opening window in minutes from midnight; absent = always open. */
  opens?: number;
  closes?: number;
  /** Days of week closed, 0 = Sunday. */
  closedDays?: number[];
  diet?: ("vegetarian" | "vegan")[];
}

export interface Stay {
  id: string; name: string; location: LatLng;
  pricePerNightEur: number; rating: number;
}

export interface FlightOffer {
  id: string; priceEur: number; durationMin: number; stops: number;
  co2Kg: number; pricedAt: string; // ISO, freshness is shown to the user
}

export interface Slot { poi: Poi; startMin: number; endMin: number; travelMinFromPrev: number }
export interface DayPlan { date: string; slots: Slot[]; dropped: Poi[] }

export interface Trip {
  request: TripRequest;
  flight?: FlightOffer;
  stay?: Stay;
  days: DayPlan[];
  totalEur: number;
  warnings: string[];
}
