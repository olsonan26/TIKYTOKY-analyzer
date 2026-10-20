import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { startDiscovery, pollDiscovery } from "../src/lib/discovery";
import { startTranscript, pollTranscript } from "../src/lib/transcripts";

const keys = ["APIFY_API_TOKEN", "APIFY_TIKTOK_ACTOR", "APIFY_MAX_CHARGE_USD", "YOUTUBE_API_KEY", "SUPADATA_API_KEY"];
let prior: Record<string, string | undefined>;
beforeEach(() => {
  prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
});
afterEach(() => {
  mock.restoreAll();
  for (const key of keys) {
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
  }
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const input = { subject: "gardening", platform: "tiktok" as const, limit: 10, periodDays: 7 };
const id = "7551234567890123456";
const runId = "validRun123";
const publishedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
const finishedAt = new Date().toISOString();
const row = {
  id, text: "An original gardening caption", webVideoUrl: `https://www.tiktok.com/@grower/video/${id}`,
  authorMeta: { name: "grower", fans: 2000 }, videoMeta: { duration: 25, coverUrl: "https://p16.tiktokcdn.com/cover.jpg" },
  createTimeISO: publishedAt, playCount: 100000, diggCount: 7000, commentCount: 200,
};

test("unconfigured providers make no network requests and give actionable setup errors", async () => {
  const network = mock.method(globalThis, "fetch", async () => { throw new Error("must not call"); });
  await assert.rejects(startDiscovery(input), /APIFY_API_TOKEN/);
  await assert.rejects(startDiscovery({ ...input, platform: "youtube" }), /YOUTUBE_API_KEY/);
  await assert.rejects(startTranscript("https://youtu.be/abcdefghijk"), /SUPADATA_API_KEY/);
  assert.equal(network.mock.callCount(), 0);
});

test("TikTok launch uses an async provider run, current schema, and total dollar spending cap", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  process.env.APIFY_MAX_CHARGE_USD = "0.75";
  const network = mock.method(globalThis, "fetch", async (value: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(value));
    assert.equal(url.origin, "https://api.apify.com");
    assert.equal(url.pathname, "/v2/actors/clockworks~tiktok-scraper/runs");
    assert.equal(url.searchParams.get("maxTotalChargeUsd"), "0.75");
    assert.equal(url.searchParams.has("token"), false);
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-apify-secret");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.searchQueries, ["gardening"]);
    assert.equal(body.searchSection, "/video");
    assert.equal(body.resultsPerPage, 10);
    assert.equal(body.videoSearchDateFilter, "PAST_WEEK");
    assert.equal(body.downloadSubtitlesOptions, "NEVER_DOWNLOAD_SUBTITLES");
    assert.equal(body.shouldDownloadVideos, true);
    return json({ data: { id: runId, status: "READY" } }, 201);
  });
  const job = await startDiscovery(input);
  assert.equal(job.status, "RUNNING");
  assert.match(job.id, /^validRun123\.7\.\d{13}$/);
  assert.match(job.coverage, /not an exhaustive/);
  assert.equal(network.mock.callCount(), 1);
});

test("TikTok polls only fixed provider endpoints and keeps missing metrics and original dates", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  const token = `${runId}.7.${Date.now()}`;
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    calls.push(url.href);
    if (url.pathname === `/v2/actor-runs/${runId}`) return json({ data: { id: runId, status: "SUCCEEDED", defaultDatasetId: "dataset123", finishedAt, datasetUrl: "https://untrusted.invalid/results" } });
    assert.equal(url.pathname, "/v2/datasets/dataset123/items");
    return json([row, row, { ...row, id: "7551234567890123457", webVideoUrl: "https://untrusted.invalid/video" }]);
  });
  const first = await pollDiscovery(token, "gardening", 10);
  const second = await pollDiscovery(token, "gardening", 10);
  assert.equal(first.videos?.length, 1);
  const video = first.videos![0];
  assert.equal(video.publishedAt, publishedAt);
  assert.equal(video.snapshots[0].observedAt, finishedAt);
  assert.equal(second.videos![0].snapshots[0].observedAt, finishedAt, "re-reading a dataset must not invent a later collection observation");
  assert.equal(video.snapshots[0].views, 100000);
  assert.equal(video.snapshots[0].shares, null);
  assert.equal(video.transcript, undefined, "caption is not speech evidence");
  assert.equal(video.mediaUrl, undefined);
  assert.equal(calls.length, 4);
  assert.equal(calls.some(url => url.includes("untrusted.invalid")), false);
});

test("TikTok exact date filtering excludes old and unknown posting times", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  const token = `${runId}.7.${Date.now()}`;
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    if (String(value).includes("/actor-runs/")) return json({ data: { id: runId, status: "SUCCEEDED", defaultDatasetId: "dataset123", finishedAt } });
    return json([
      { ...row, createTimeISO: new Date(Date.now() - 8 * 86_400_000).toISOString() },
      { ...row, id: "7551234567890123457", webVideoUrl: "https://www.tiktok.com/@grower/video/7551234567890123457", createTimeISO: undefined },
    ]);
  });
  const job = await pollDiscovery(token, "gardening", 10);
  assert.deepEqual(job.videos, []);
});

test("a fresh daily collection produces a new current observation rather than reusing yesterday's counters", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  const before = Date.now();
  const firstTime = new Date(before - 2000).toISOString();
  const secondTime = new Date(before - 1000).toISOString();
  const tokenA = `firstRun123.7.${before}`;
  const tokenB = `secondRun123.7.${before}`;
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    if (url.pathname.endsWith("/actor-runs/firstRun123")) return json({ data: { id: "firstRun123", status: "SUCCEEDED", defaultDatasetId: "firstDataset", finishedAt: firstTime } });
    if (url.pathname.endsWith("/actor-runs/secondRun123")) return json({ data: { id: "secondRun123", status: "SUCCEEDED", defaultDatasetId: "secondDataset", finishedAt: secondTime } });
    if (url.pathname.includes("firstDataset")) return json([row]);
    return json([{ ...row, playCount: 150000, diggCount: undefined }]);
  });
  const first = (await pollDiscovery(tokenA, "gardening", 10)).videos![0];
  const refreshed = (await pollDiscovery(tokenB, "gardening", 10)).videos![0];
  assert.equal(first.id, refreshed.id);
  assert.equal(refreshed.publishedAt, publishedAt, "refreshing counters must not change the original posting time");
  assert.equal(first.snapshots[0].observedAt, firstTime);
  assert.equal(refreshed.snapshots[0].observedAt, secondTime);
  assert.equal(first.snapshots[0].views, 100000);
  assert.equal(refreshed.snapshots[0].views, 150000);
  assert.equal(refreshed.snapshots[0].likes, null, "a newly missing count must not inherit a stale count or turn into zero");
  assert.equal(refreshed.snapshots[0].shares, null);
  assert.ok(Date.parse(refreshed.fetchedAt) >= before);
  assert.ok(Date.parse(refreshed.fetchedAt) <= Date.now());
  assert.match(refreshed.snapshots[0].source, /secondRun123/);
});

test("TikTok rejects malformed jobs and invalid budget before a request", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  const network = mock.method(globalThis, "fetch", async () => { throw new Error("must not call"); });
  await assert.rejects(pollDiscovery("../other", "gardening", 10), /Invalid discovery/);
  process.env.APIFY_MAX_CHARGE_USD = "0";
  await assert.rejects(startDiscovery(input), /spending cap/);
  assert.equal(network.mock.callCount(), 0);
});

test("provider error bodies and network errors cannot expose keys or arbitrary URLs", async () => {
  process.env.APIFY_API_TOKEN = "test-apify-secret";
  mock.method(globalThis, "fetch", async () => json({ message: "test-apify-secret https://private.invalid" }, 401));
  await assert.rejects(startDiscovery(input), error => error instanceof Error && /authorization/.test(error.message) && !/secret|private\.invalid/.test(error.message));
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => { throw new Error("test-apify-secret https://private.invalid"); });
  await assert.rejects(startDiscovery(input), error => error instanceof Error && /timeout/.test(error.message) && !/secret|private\.invalid/.test(error.message));
});

test("YouTube hydrates real counters and subscriber counts without inventing shares or history", async () => {
  process.env.YOUTUBE_API_KEY = "test-youtube-secret";
  const videoId = "abcdefghijk";
  const channelId = "UCabcdefghijklmnopqrstuv";
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    calls.push(url.pathname);
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.searchParams.get("key"), "test-youtube-secret");
    if (url.pathname.endsWith("/search")) {
      assert.equal(url.searchParams.get("order"), "viewCount");
      assert.equal(url.searchParams.get("videoDuration"), "short");
      assert.ok(url.searchParams.get("publishedAfter"));
      return json({ items: [{ id: { videoId } }] });
    }
    if (url.pathname.endsWith("/videos")) return json({ items: [{ id: videoId, snippet: { title: "Grow your own food", channelId, channelTitle: "Garden creator", publishedAt }, contentDetails: { duration: "PT1M15S" }, statistics: { viewCount: "120000", commentCount: "14" } }] });
    assert.ok(url.pathname.endsWith("/channels"));
    return json({ items: [{ id: channelId, statistics: { subscriberCount: "10000", hiddenSubscriberCount: false } }] });
  });
  const job = await startDiscovery({ ...input, platform: "youtube" });
  assert.equal(job.status, "SUCCEEDED");
  assert.equal(job.videos?.length, 1);
  const video = job.videos![0];
  assert.equal(video.publishedAt, publishedAt);
  assert.equal(video.duration, 75);
  assert.equal(video.followers, 10000);
  assert.equal(video.snapshots.length, 1);
  assert.equal(video.snapshots[0].views, 120000);
  assert.equal(video.snapshots[0].likes, null);
  assert.equal(video.snapshots[0].shares, null);
  assert.ok(Date.parse(video.snapshots[0].observedAt) > Date.parse(publishedAt));
  assert.equal(calls.length, 3);
});

test("YouTube does not treat unavailable follower stats as unavailable video metrics", async () => {
  process.env.YOUTUBE_API_KEY = "test-youtube-secret";
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    if (url.pathname.endsWith("/search")) return json({ items: [{ id: { videoId: "abcdefghijk" } }] });
    if (url.pathname.endsWith("/videos")) return json({ items: [{ id: "abcdefghijk", snippet: { channelId: "UCabcdefghijklmnopqrstuv", publishedAt }, statistics: { viewCount: "123" } }] });
    return json({ privateError: "test-youtube-secret" }, 429);
  });
  const job = await startDiscovery({ ...input, platform: "youtube" });
  assert.equal(job.videos![0].followers, null);
  assert.equal(job.videos![0].snapshots[0].views, 123);
  assert.match(job.message || "", /follower counts could not/);
  assert.ok(!JSON.stringify(job).includes("test-youtube-secret"));
});

test("Supadata immediate and asynchronous result shapes return actual speech only", async () => {
  process.env.SUPADATA_API_KEY = "test-supadata-secret";
  let calls = 0;
  mock.method(globalThis, "fetch", async (value: string | URL | Request, init?: RequestInit) => {
    calls++;
    const url = new URL(String(value));
    assert.equal(url.origin, "https://api.supadata.ai");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-supadata-secret");
    assert.equal(init?.redirect, "error");
    if (calls === 1) {
      assert.equal(url.searchParams.get("mode"), "auto");
      assert.equal(url.searchParams.get("text"), "true");
      return json({ content: "Actual spoken words" });
    }
    if (calls === 2) return json({ jobId: "valid-job-id" }, 202);
    if (calls === 3) return json({ status: "active" });
    assert.equal(url.pathname, "/v1/transcript/valid-job-id");
    return json({ status: "completed", result: { content: [{ text: "Hello", offset: 0 }, { text: "world", offset: 1000 }] } });
  });
  assert.equal((await startTranscript("https://youtu.be/abcdefghijk")).transcript, "Actual spoken words");
  const queued = await startTranscript("https://www.tiktok.com/@grower/video/7551234567890123456");
  assert.equal(queued.status, "queued");
  assert.equal((await pollTranscript(queued.jobId!)).status, "queued");
  assert.equal((await pollTranscript(queued.jobId!)).transcript, "Hello\nworld");
});

test("Supadata rejects arbitrary URLs, invalid jobs, and empty or failed transcripts", async () => {
  process.env.SUPADATA_API_KEY = "test-supadata-secret";
  const network = mock.method(globalThis, "fetch", async () => json({ content: [] }));
  await assert.rejects(startTranscript("https://127.0.0.1/internal"), /HTTPS TikTok/);
  await assert.rejects(startTranscript("https://youtube.com.evil.invalid/watch"), /HTTPS TikTok/);
  await assert.rejects(pollTranscript("../../private"), /Invalid transcript job/);
  assert.equal(network.mock.callCount(), 0);
  await assert.rejects(startTranscript("https://youtu.be/abcdefghijk"), /no usable speech/);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => json({ status: "failed", error: { message: "test-supadata-secret" } }));
  await assert.rejects(pollTranscript("valid-job-id"), error => error instanceof Error && !error.message.includes("test-supadata-secret") && /could not process/.test(error.message));
});

