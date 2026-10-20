import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrowthPlan, utahWallTimeToUtc } from "../src/lib/growth";
import type { Outcome } from "../src/lib/types";
import { normalizeVideos } from "../src/lib/ranking";
test("Utah uses MDT in summer and MST in winter", () => {
  assert.equal(utahWallTimeToUtc(2026, 7, 10, 18, 30).toISOString(), "2026-07-11T00:30:00.000Z");
  assert.equal(utahWallTimeToUtc(2026, 12, 10, 18, 30).toISOString(), "2026-12-11T01:30:00.000Z");
});
test("schedule crosses daylight-saving boundary and always stays in future", () => {
  const now = new Date("2026-10-31T22:00:00Z");
  const plan = buildGrowthPlan([], [], now);
  assert.equal(plan.schedule.length, 7); assert.equal(plan.timingBasis, "experiment");
  for (const slot of plan.schedule) assert.ok(Date.parse(slot.utc) > +now);
  assert.ok(plan.schedule.some(s => s.localLabel.includes("MDT")));
  assert.ok(plan.schedule.some(s => s.localLabel.includes("MST")));
  assert.match(plan.duration.basis, /not a measured optimum/);
});
test("known benchmark lengths inform a sample-based range", () => {
  const videos = normalizeVideos([20, 30, 40].map((duration, i) => ({ url: `https://www.tiktok.com/@a/video/${i}`, duration, views: 1000 + i })));
  const plan = buildGrowthPlan(videos, []);
  assert.equal(plan.duration.seconds, 30); assert.equal(plan.duration.sampleSize, 3); assert.match(plan.duration.basis, /does not establish an optimal length/);
});
function post(id: string, date: string, views: number, ageHours = 24): Outcome {
  return { id, url: `https://www.tiktok.com/@me/video/${id}`, scriptTitle: "Recorded lesson", publishedAt: date, notes: "", snapshots: [{ observedAt: new Date(Date.parse(date) + ageHours * 3600000).toISOString(), views, likes: null, comments: null, shares: null, source: "Owner observation" }] };
}
test("own timing evidence needs comparable-aged real snapshots across hours", () => {
  const outcomes = Array.from({ length: 12 }, (_, i) => post(String(i), `2026-10-${String(i + 1).padStart(2, "0")}T${i % 2 ? "18" : "23"}:00:00Z`, i % 2 ? 500 : 1500));
  const plan = buildGrowthPlan([], outcomes, new Date("2026-10-20T00:00:00Z"));
  assert.equal(plan.timingBasis, "observed");
  assert.equal(buildGrowthPlan([], outcomes.slice(0, 3), new Date("2026-10-20T00:00:00Z")).timingBasis, "experiment");
  const oldCounts = outcomes.map(p => ({ ...p, snapshots: p.snapshots.map(s => ({ ...s, observedAt: new Date(Date.parse(p.publishedAt) + 7 * 86400000).toISOString() })) }));
  assert.equal(buildGrowthPlan([], oldCounts, new Date("2026-10-20T00:00:00Z")).timingBasis, "experiment");
});
