import type { Providers } from "./providers/types.js";
import type { Poi, Trip, TripRequest } from "./types.js";
import { eligiblePoi, pickFlight, pickStay, scorePoi } from "./scoring.js";
import { PACE_PER_DAY, planDays } from "./planner.js";
import { centroid } from "./geo.js";

export async function generateTrip(req: TripRequest, providers: Providers): Promise<Trip> {
  const [flights, stays, pois] = await Promise.all([
    providers.flights.search(req), providers.stays.search(req), providers.pois.search(req),
  ]);
  const warnings: string[] = [];
  const pax = req.group.adults + req.group.children;

  const ranked = pois.filter((p) => eligiblePoi(p, req))
    .sort((a, b) => scorePoi(b, req) - scorePoi(a, req));
  const acts = ranked.filter((p) => p.kind === "activity")
    .slice(0, PACE_PER_DAY[req.pace] * req.days - req.days);
  const meals = ranked.filter((p) => p.kind === "restaurant").slice(0, req.days);
  const selected: Poi[] = [...acts, ...meals];

  const flight = pickFlight(flights);
  const nightlyCap = (req.budgetEur * 0.4) / Math.max(1, req.days);
  const stay = pickStay(stays, acts, nightlyCap);
  if (!flight) warnings.push("Aucun vol trouvé.");
  if (!stay) warnings.push("Aucun logement trouvé.");

  const base = stay?.location ?? centroid(selected.map((p) => p.location));
  const dayPlans = planDays(req.startDate, req.days, selected, base);
  for (const d of dayPlans) {
    if (d.dropped.length) warnings.push(`${d.date} : ${d.dropped.map((p) => p.name).join(", ")} ne tient pas (horaires ou durée).`);
  }

  const spots = dayPlans.flatMap((d) => d.slots).reduce((s, x) => s + x.poi.priceEur * pax, 0);
  const totalEur = (flight?.priceEur ?? 0) * pax + (stay?.pricePerNightEur ?? 0) * req.days + spots;
  if (totalEur > req.budgetEur) warnings.push(`Budget dépassé de ${Math.round(totalEur - req.budgetEur)} €.`);

  return { request: req, flight, stay, days: dayPlans, totalEur, warnings };
}
