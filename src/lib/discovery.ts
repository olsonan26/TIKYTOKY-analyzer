import { randomUUID } from "node:crypto";
import type { DiscoveryJob, Video } from "./types";

type JsonRecord = Record<string, unknown>;
type DiscoveryInput = { subject: string; platform: "tiktok" | "youtube"; limit: number; periodDays: number };
const DAY = 86_400_000;
const APIFY_BASE = "https://api.apify.com/v2";
const YOUTUBE_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_RESULTS = 100;
const TIKTOK_COVERAGE = "Top performers found in a bounded TikTok search sample, collected by Apify. Results are not an exhaustive or global viral ranking. Optional search/date filters consume the configured provider budget.";
const YOUTUBE_COVERAGE = "Top performers found by YouTube keyword search, ordered by views within the requested date range. Short videos means under four minutes; results are not guaranteed Shorts or an exhaustive global ranking.";

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function string(value: unknown, max = 10_000): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}
function count(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}
function date(value: unknown): string | null {
  const candidate = typeof value === "number" ? value * 1000 : value;
  if (typeof candidate !== "string" && typeof candidate !== "number") return null;
  const time = new Date(candidate).getTime();
  return Number.isFinite(time) && time >= Date.UTC(2000, 0, 1) && time <= Date.now() + 300_000
    ? new Date(time).toISOString() : null;
}
function providerId(value: unknown): string {
  const id = string(value, 101);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("The provider returned an invalid resource identifier.");
  return id;
}
function thumbnail(value: unknown): string | undefined {
  try {
    const url = new URL(string(value, 4096));
    const domains = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibytedtos.com", "byteoversea.com", "apifyusercontent.com", "ytimg.com", "ggpht.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : undefined;
  } catch { return undefined; }
}

async function providerJson(url: string | URL, provider: "Apify" | "YouTube", init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(`${provider} could not be reached within the request timeout. Please retry.`);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(`${provider} authorization failed. Check the server API key, permissions, and available quota.`);
    if (response.status === 402) throw new Error(`${provider} requires available account credits. Check the provider account.`);
    if (response.status === 429) throw new Error(`${provider} rate or quota limit reached. Retry later or check the provider account.`);
    throw new Error(`${provider} returned HTTP ${response.status}. The request could not be completed.`);
  }
  try {
    const body = await response.text();
    if (body.length > 3_000_000) throw new Error("oversized");
    return JSON.parse(body);
  } catch { throw new Error(`${provider} returned an invalid response.`); }
}

function validateInput(input: DiscoveryInput): DiscoveryInput {
  const subject = input.subject.trim();
  if (!subject || subject.length > 200 || /[\u0000-\u001f]/.test(subject)) throw new Error("Enter a subject of 1 to 200 characters.");
  if (input.platform !== "youtube" && input.platform !== "tiktok") throw new Error("Choose TikTok or YouTube discovery.");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULTS) throw new Error("Choose between 1 and 100 videos per search.");
  if (!Number.isInteger(input.periodDays) || input.periodDays < 0 || input.periodDays > 3650) throw new Error("Choose a date window between 0 and 3650 days; 0 means all time.");
  return { ...input, subject };
}
function apifyConfig() {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error("TikTok discovery needs APIFY_API_TOKEN on the server. Import videos manually until it is configured.");
  const actor = process.env.APIFY_TIKTOK_ACTOR?.trim() || "clockworks~tiktok-scraper";
  if (!/^[A-Za-z0-9_-]+(?:~[A-Za-z0-9_-]+)?$/.test(actor) || actor.length > 160) throw new Error("The configured Apify Actor identifier is invalid.");
  const budget = Number(process.env.APIFY_MAX_CHARGE_USD || "1");
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("Set a positive APIFY_MAX_CHARGE_USD provider spending cap.");
  return { actor, budget, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}
function periodFilter(days: number): string {
  if (!days || days > 180) return "ALL_TIME";
  if (days <= 1) return "PAST_24_HOURS";
  if (days <= 7) return "PAST_WEEK";
  if (days <= 30) return "PAST_MONTH";
  if (days <= 90) return "LAST_3_MONTHS";
  return "LAST_6_MONTHS";
}
function jobToken(runId: string, days: number, startedAt: number): string {
  return `${providerId(runId)}.${days}.${startedAt}`;
}
function parseJobToken(id: string) {
  const match = /^([A-Za-z0-9_-]{1,100})\.(\d{1,4})\.(\d{13})$/.exec(id);
  if (!match) throw new Error("Invalid discovery job identifier.");
  const days = Number(match[2]);
  const startedAt = Number(match[3]);
  if (days > 3650 || startedAt > Date.now() + 300_000 || startedAt < Date.UTC(2020, 0, 1)) throw new Error("Invalid discovery job identifier.");
  return { runId: match[1], days, startedAt };
}

function normalizeTikTok(items: unknown[], run: JsonRecord, days: number, startedAt: number, limit: number): Video[] {
  const fetchedAt = new Date().toISOString();
  // A repeat poll reads the same collection run, not a newly observed performance snapshot.
  const observedAt = date(run.finishedAt) || date(run.startedAt) || new Date(startedAt).toISOString();
  const runId = providerId(run.id);
  const source = `Apify TikTok scraper (run ${runId})`;
  const cutoff = days ? startedAt - days * DAY : 0;
  const videos: Video[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const row = record(item);
    const author = record(row.authorMeta);
    const meta = record(row.videoMeta);
    const rawId = string(row.id, 31);
    if (!/^\d{5,30}$/.test(rawId) || seen.has(rawId)) continue;
    let creator = string(author.name, 64).replace(/^@/, "");
    let url: URL;
    try {
      url = new URL(string(row.webVideoUrl, 2048));
      if (url.protocol !== "https:" || !["www.tiktok.com", "tiktok.com", "m.tiktok.com"].includes(url.hostname) || url.port || url.username || url.password) continue;
      const path = /^\/@([^/]+)\/video\/(\d+)\/?$/.exec(url.pathname);
      if (!path || path[2] !== rawId) continue;
      if (!creator) creator = decodeURIComponent(path[1]);
    } catch { continue; }
    if (!/^[A-Za-z0-9._]{1,64}$/.test(creator)) continue;
    const publishedAt = date(row.createTimeISO) || date(row.createTime);
    // Unknown dates cannot support a claim that a post belongs to a requested window.
    if (cutoff && (!publishedAt || new Date(publishedAt).getTime() < cutoff)) continue;
    const duration = count(meta.duration);
    videos.push({
      id: rawId,
      url: `https://www.tiktok.com/@${creator}/video/${rawId}`,
      platform: "tiktok",
      title: string(row.text) || `TikTok video ${rawId}`,
      creator,
      publishedAt,
      duration: duration && duration > 0 ? duration : null,
      followers: count(author.fans),
      thumbnail: thumbnail(meta.coverUrl),
      mediaUrl: (() => {
        const candidate = string(row.videoUrl || row.downloadUrl || meta.downloadAddr || meta.playAddr, 4096);
        try { const url = new URL(candidate); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
      })(),
      snapshots: [{ observedAt, views: count(row.playCount), likes: count(row.diggCount), comments: count(row.commentCount), shares: count(row.shareCount), source }],
      source,
      fetchedAt,
    });
    seen.add(rawId);
    if (videos.length >= limit) break;
  }
  return videos;
}

async function apifyJob(runValue: unknown, token: string, subject: string, limit: number): Promise<DiscoveryJob> {
  const run = record(runValue);
  const { runId, days, startedAt } = parseJobToken(token);
  if (run.id !== runId) throw new Error("Apify returned an inconsistent discovery job.");
  const providerStatus = string(run.status);
  const terminal = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"] as const;
  const status: DiscoveryJob["status"] = terminal.includes(providerStatus as typeof terminal[number]) ? providerStatus as typeof terminal[number] : "RUNNING";
  if (!terminal.includes(providerStatus as typeof terminal[number]) && !["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(providerStatus)) throw new Error("Apify returned an unknown discovery status.");
  const job: DiscoveryJob = { id: token, status, subject, limit, coverage: TIKTOK_COVERAGE };
  if (status !== "SUCCEEDED") {
    job.message = status === "RUNNING" ? "TikTok discovery is running. Poll this job to collect results." : "The provider did not complete this discovery run. Check the provider account before starting another run.";
    return job;
  }
  const datasetId = providerId(run.defaultDatasetId);
  const endpoint = new URL(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items`);
  endpoint.search = new URLSearchParams({ format: "json", clean: "true", limit: String(limit) }).toString();
  const items = await providerJson(endpoint, "Apify", { headers: apifyConfig().headers });
  if (!Array.isArray(items)) throw new Error("Apify returned an invalid video dataset.");
  const videos = normalizeTikTok(items.slice(0, limit), run, days, startedAt, limit);
  return { ...job, datasetId, videos, message: videos.length ? `${videos.length} videos found in the available search sample.` : "No usable videos were found inside this date window. Try a broader subject or date window." };
}

function isoDuration(value: unknown): number | null {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(string(value));
  if (!match) return null;
  const seconds = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return seconds > 0 && Number.isFinite(seconds) ? seconds : null;
}
async function youtubeGet(resource: "search" | "videos" | "channels", params: Record<string, string>, apiKey: string): Promise<JsonRecord> {
  const endpoint = new URL(`${YOUTUBE_BASE}/${resource}`);
  endpoint.search = new URLSearchParams({ ...params, key: apiKey }).toString();
  const data = record(await providerJson(endpoint, "YouTube"));
  if (!Array.isArray(data.items)) throw new Error("YouTube returned an invalid result set.");
  return data;
}
async function youtubeDiscovery(input: DiscoveryInput): Promise<DiscoveryJob> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YouTube discovery needs YOUTUBE_API_KEY on the server. Import videos manually until it is configured.");
  const startedAt = Date.now();
  const publishedAfter = input.periodDays ? new Date(startedAt - input.periodDays * DAY).toISOString() : undefined;
  const ids = new Set<string>();
  let pageToken = "";
  const pageTokens = new Set<string>();
  // Bounded page count prevents unexpected provider pagination from spending unbounded quota.
  for (let page = 0; page < 2 && ids.size < input.limit; page++) {
    const data = await youtubeGet("search", {
      part: "snippet", type: "video", q: input.subject, order: "viewCount", videoDuration: "short",
      maxResults: String(Math.min(50, input.limit - ids.size)),
      ...(publishedAfter ? { publishedAfter } : {}), ...(pageToken ? { pageToken } : {}),
    }, key);
    for (const item of data.items as unknown[]) {
      const id = string(record(record(item).id).videoId);
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) ids.add(id);
    }
    pageToken = string(data.nextPageToken, 2048);
    if (!pageToken || pageTokens.has(pageToken)) break;
    pageTokens.add(pageToken);
  }
  const rows: unknown[] = [];
  const idList = [...ids].slice(0, input.limit);
  for (let offset = 0; offset < idList.length; offset += 50) {
    const data = await youtubeGet("videos", { part: "snippet,contentDetails,statistics", id: idList.slice(offset, offset + 50).join(",") }, key);
    rows.push(...data.items as unknown[]);
  }
  const observedAt = new Date().toISOString();
  const source = "YouTube Data API";
  const followers = new Map<string, number | null>();
  let followerMessage = "";
  const channels = [...new Set(rows.map(row => string(record(record(row).snippet).channelId)).filter(id => /^[A-Za-z0-9_-]{24}$/.test(id)))];
  try {
    for (let offset = 0; offset < channels.length; offset += 50) {
      const data = await youtubeGet("channels", { part: "statistics", id: channels.slice(offset, offset + 50).join(",") }, key);
      for (const item of data.items as unknown[]) {
        const channel = record(item);
        const stats = record(channel.statistics);
        followers.set(string(channel.id), stats.hiddenSubscriberCount === true ? null : count(stats.subscriberCount));
      }
    }
  } catch { followerMessage = " Creator follower counts could not be refreshed; video metrics remain available."; }
  const videos: Video[] = [];
  const seen = new Set<string>();
  for (const value of rows) {
    const row = record(value);
    const id = string(row.id);
    if (!ids.has(id) || seen.has(id)) continue;
    const snippet = record(row.snippet);
    const stats = record(row.statistics);
    const publishedAt = date(snippet.publishedAt);
    if (publishedAfter && (!publishedAt || publishedAt < publishedAfter)) continue;
    const duration = isoDuration(record(row.contentDetails).duration);
    // YouTube's short duration filter includes under-four-minute videos, not only Shorts.
    if (duration !== null && duration >= 240) continue;
    const thumbs = record(snippet.thumbnails);
    const cover = record(thumbs.medium || thumbs.high || thumbs.default);
    videos.push({
      id, url: `https://www.youtube.com/watch?v=${id}`, platform: "youtube",
      title: string(snippet.title, 1000) || `YouTube video ${id}`,
      creator: string(snippet.channelTitle, 200) || "Unknown creator", publishedAt, duration,
      followers: followers.get(string(snippet.channelId)) ?? null, thumbnail: thumbnail(cover.url),
      snapshots: [{ observedAt, views: count(stats.viewCount), likes: count(stats.likeCount), comments: count(stats.commentCount), shares: null, source }],
      source, fetchedAt: observedAt,
    });
    seen.add(id);
  }
  return { id: `youtube-${randomUUID()}`, status: "SUCCEEDED", subject: input.subject, limit: input.limit, videos, coverage: YOUTUBE_COVERAGE, message: `${videos.length} videos found in the available search sample.${followerMessage}` };
}

export async function startDiscovery(rawInput: DiscoveryInput): Promise<DiscoveryJob> {
  const input = validateInput(rawInput);
  if (input.platform === "youtube") return youtubeDiscovery(input);
  const config = apifyConfig();
  const startedAt = Date.now();
  const endpoint = new URL(`${APIFY_BASE}/actors/${encodeURIComponent(config.actor)}/runs`);
  endpoint.search = new URLSearchParams({ timeout: "180", maxTotalChargeUsd: String(config.budget), restartOnError: "false" }).toString();
  const response = record(await providerJson(endpoint, "Apify", {
    method: "POST", headers: config.headers,
    body: JSON.stringify({
      searchQueries: [input.subject], searchSection: "/video", resultsPerPage: input.limit,
      videoSearchSorting: "MOST_LIKED", videoSearchDateFilter: periodFilter(input.periodDays),
      shouldDownloadVideos: process.env.APIFY_DOWNLOAD_VIDEOS !== "false", shouldDownloadCovers: false, shouldDownloadAvatars: false,
      shouldDownloadSlideshowImages: false, shouldDownloadMusicCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES", aiVideoSummary: false, aiVideoDescription: false,
      commentsPerPost: 0, maxFollowersPerProfile: 0, maxFollowingPerProfile: 0,
    }),
  }));
  const run = record(response.data);
  const token = jobToken(providerId(run.id), input.periodDays, startedAt);
  return apifyJob(run, token, input.subject, input.limit);
}

export async function pollDiscovery(id: string, subject: string, limit: number): Promise<DiscoveryJob> {
  validateInput({ subject, platform: "tiktok", limit, periodDays: 0 });
  const { runId } = parseJobToken(id);
  const config = apifyConfig();
  const response = record(await providerJson(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`, "Apify", { headers: config.headers }));
  return apifyJob(response.data, id, subject, limit);
}
