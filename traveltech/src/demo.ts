import { generateTrip } from "./generate.js";
import { mockProviders } from "./providers/mock.js";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const trip = await generateTrip({
  destination: "Sicile", startDate: "2026-06-02", days: 3, budgetEur: 1800, pace: "balanced",
  group: { type: "couple", adults: 2, children: 0 }, interests: ["art", "food", "nature"],
}, mockProviders());

console.log(`Vol ${trip.flight?.id} · ${trip.stay?.name} · total ${trip.totalEur} €`);
for (const d of trip.days) {
  console.log(`\n${d.date}`);
  for (const s of d.slots) console.log(`  ${hhmm(s.startMin)}–${hhmm(s.endMin)}  ${s.poi.name} (+${s.travelMinFromPrev} min)`);
}
trip.warnings.forEach((w) => console.log("⚠", w));
