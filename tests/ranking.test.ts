import { test } from "node:test";
import assert from "node:assert/strict";
import { counter, growthPerHour, mergeVideos, normalizeVideos, rankVideos } from "../src/lib/ranking";
import type { MetricSnapshot } from "../src/lib/types";
const snapshot = (time: string, views: number | null): MetricSnapshot => ({ observedAt: time, views, likes: null, comments: null, shares: null, source: "Recorded" });
test("zero is real; missing, negative and abbreviated counters remain unknown", () => {
  assert.equal(counter(0), 0); assert.equal(counter(null), null); assert.equal(counter("1.2M"), null); assert.equal(counter(-1), null); assert.equal(counter("1,200"), 1200);
});
test("normalization preserves canonical observation timestamps and unknown metrics", () => {
  const [v] = normalizeVideos([{ url: "https://www.tiktok.com/@a/video/1?tracking=test", fetchedAt: "2026-10-15T00:00:00Z", snapshots: [snapshot("2026-10-15T00:00:00Z", 0)] }]);
  assert.equal(v.fetchedAt, "2026-10-15T00:00:00.000Z");
  assert.equal(v.snapshots[0].views, 0); assert.equal(v.snapshots[0].likes, null);
  assert.equal(v.url, "https://www.tiktok.com/@a/video/1");
});
test("no growth is invented from one observation or duplicate timestamps", () => {
  const a = snapshot("2026-10-15T00:00:00Z", 500);
  assert.equal(growthPerHour([a]), null); assert.equal(growthPerHour([a, { ...a, views: 700 }]), null);
  assert.equal(growthPerHour([a, snapshot("2026-10-15T02:00:00Z", 900)]), 200);
});
test("signed media query parameters survive normalization", () => {
  const signed = "https://p16.tiktokcdn.com/cover.jpg?x-expires=2000000000&x-signature=real-signature";
  const [video] = normalizeVideos([{ url: "https://www.tiktok.com/@a/video/1", thumbnail: signed, mediaUrl: signed }]);
  assert.equal(video.thumbnail, signed); assert.equal(video.mediaUrl, signed);
});
test("refresh preserves old observations and manually added evidence", () => {
  const [a] = normalizeVideos([{ url: "https://www.tiktok.com/@a/video/1", transcript: "My saved transcript", snapshots: [snapshot("2026-10-15T00:00:00Z", 500)] }]);
  const b = { ...a, transcript: undefined, snapshots: [snapshot("2026-10-15T01:00:00Z", 800)] };
  const [merged] = mergeVideos([a], [b]);
  assert.equal(merged.transcript, a.transcript); assert.equal(merged.snapshots.length, 2); assert.equal(growthPerHour(merged.snapshots), 300);
  assert.equal(mergeVideos([merged], [b])[0].snapshots.length, 2);
});
test("rank score is sample-relative and missing signals remain null", () => {
  const videos = normalizeVideos([{ url: "https://youtu.be/a", views: 100, likes: 10, comments: 3 }, { url: "https://youtu.be/b", views: 1000, likes: 100, comments: 30 }, { url: "https://youtu.be/c" }]);
  const ranked = rankVideos(videos);
  assert.equal(ranked[0].url, "https://youtu.be/b");
  assert.equal(ranked[2].score, null); assert.equal(ranked[0].growthPerHour, null); assert.equal(ranked[0].followerMultiple, null);
});
