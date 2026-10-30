import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTrip } from "../src/generate.js";
import { mockProviders } from "../src/providers/mock.js";
import { cluster, orderDay } from "../src/planner.js";
import type { TripRequest } from "../src/types.js";

const req: TripRequest = {
  destination: "Sicile", startDate: "2026-06-02", days: 3, budgetEur: 2500, pace: "balanced",
  group: { type: "couple", adults: 2, children: 0 }, interests: ["art", "food"],
};

test("clustering keeps far-apart POIs on different days", async () => {
  const pois = await mockProviders().pois.search(req);
  const acts = pois.filter((p) => p.kind === "activity");
  const groups = cluster(acts, 2);
  const ids = (g: typeof acts) => g.map((p) => p.id);
  const ortigiaGroup = groups.find((g) => ids(g).includes("p1"))!;
  assert.ok(!ids(ortigiaGroup).includes("p5"), "Ortigia and Vendicari must not share a day");
});

test("no slot overlaps and every slot respects opening hours", async () => {
  const trip = await generateTrip(req, mockProviders());
  for (const d of trip.days) {
    d.slots.forEach((s, i) => {
      if (i) assert.ok(s.startMin >= d.slots[i - 1].endMin + s.travelMinFromPrev - 1);
      if (s.poi.closes !== undefined) assert.ok(s.endMin <= s.poi.closes);
      if (s.poi.opens !== undefined) assert.ok(s.startMin >= s.poi.opens);
    });
  }
});

test("museum closed on Monday is never scheduled that day", async () => {
  const pois = (await mockProviders().pois.search(req)).filter((p) => p.id === "p3");
  const monday = orderDay("2026-06-01", pois, pois[0].location);
  assert.equal(monday.slots.length, 0);
  assert.equal(monday.dropped.length, 1);
});

test("vegan diet only keeps vegan restaurants", async () => {
  const trip = await generateTrip({ ...req, diet: "vegan" }, mockProviders());
  const meals = trip.days.flatMap((d) => d.slots).filter((s) => s.poi.kind === "restaurant");
  assert.ok(meals.every((s) => s.poi.diet?.includes("vegan")));
});

test("over-budget trips raise a warning", async () => {
  const trip = await generateTrip({ ...req, budgetEur: 300 }, mockProviders());
  assert.ok(trip.warnings.some((w) => w.startsWith("Budget dépassé")));
});
