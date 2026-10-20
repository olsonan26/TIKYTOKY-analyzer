import type { MetricSnapshot, RankedVideo, Video } from "./types";

type Row = Record<string, unknown>;
function obj(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function str(value: unknown, max = 10000): string { return typeof value === "string" ? value.slice(0, max) : ""; }
export function counter(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d[\d,]*(\.\d+)?$/.test(value) ? Number(value.replaceAll(",", "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = typeof value === "number" ? value * (value < 1e12 ? 1000 : 1) : Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
export function canonicalUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = "";
    const id = url.searchParams.get("v");
    url.search = "";
    if (id && /(^|\.)youtube\.com$/.test(url.hostname)) url.searchParams.set("v", id);
    return url.toString();
  } catch { return ""; }
}
function assetUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch { return undefined; }
}
export function normalizeVideos(input: unknown): Video[] {
  const envelope = obj(input);
  const rows = Array.isArray(input) ? input : Array.isArray(envelope.videos) ? envelope.videos : Array.isArray(envelope.items) ? envelope.items : null;
  if (!rows) throw new Error("Import a JSON array of videos, or an object with a videos array.");
  if (rows.length > 500) throw new Error("Import at most 500 videos at a time.");
  const now = new Date().toISOString();
  const seen = new Set<string>();
  return rows.flatMap((raw): Video[] => {
    const row = obj(raw), author = obj(row.authorMeta), meta = obj(row.videoMeta), stats = obj(row.statistics);
    const url = canonicalUrl(row.url ?? row.webVideoUrl ?? row.video_url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const host = new URL(url).hostname;
    const platform = /(^|\.)tiktok\.com$/.test(host) ? "tiktok" : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? "youtube" : /(^|\.)instagram\.com$/.test(host) ? "instagram" : "other";
    const source = str(row.source, 200) || "User import";
    const snapshots: MetricSnapshot[] = Array.isArray(row.snapshots) ? row.snapshots.slice(-100).flatMap((item) => {
      const s = obj(item), time = iso(s.observedAt);
      return time ? [{ observedAt: time, views: counter(s.views), likes: counter(s.likes), comments: counter(s.comments), shares: counter(s.shares), source: str(s.source, 200) || source }] : [];
    }) : [{
      observedAt: now,
      views: counter(row.views ?? row.playCount ?? row.view_count ?? stats.viewCount),
      likes: counter(row.likes ?? row.diggCount ?? row.like_count ?? stats.likeCount),
      comments: counter(row.comments ?? row.commentCount ?? row.comment_count ?? stats.commentCount),
      shares: counter(row.shares ?? row.shareCount ?? row.share_count),
      source
    }];
    return [{
      id: str(row.id, 200) || `${platform}-${hash(url)}`,
      url, platform,
      title: str(row.title ?? row.text ?? row.description, 10000) || "Untitled video",
      creator: str(row.creator ?? author.name ?? row.uploader, 200) || "Unknown creator",
      publishedAt: iso(row.publishedAt ?? row.createTimeISO ?? row.createTime ?? row.upload_date),
      duration: counter(row.duration ?? meta.duration),
      followers: counter(row.followers ?? author.fans),
      thumbnail: assetUrl(row.thumbnail ?? meta.coverUrl),
      mediaUrl: assetUrl(row.mediaUrl ?? row.videoUrl ?? meta.downloadAddr ?? meta.playAddr),
      transcript: str(row.transcript, 40000) || undefined,
      transcriptSource: str(row.transcriptSource, 200) || (row.transcript ? "User import" : undefined),
      transcriptSegments: Array.isArray(row.transcriptSegments) ? row.transcriptSegments.slice(0,2000).flatMap(value => { const s=obj(value); const start=counter(s.start), end=counter(s.end); return start !== null && end !== null && end >= start && end <= 600 ? [{start,end,text:str(s.text,4000)}] : []; }) : undefined,
      description: str(row.description ?? row.desc, 10000) || undefined,
      hashtags: Array.isArray(row.hashtags) ? row.hashtags.filter((x): x is string => typeof x === "string").slice(0,100).map(x=>x.slice(0,200)) : undefined,
      onScreenText: str(row.onScreenText, 10000) || undefined,
      visualNotes: str(row.visualNotes, 10000) || undefined,
      snapshots, source, fetchedAt: iso(row.fetchedAt) || now
    }];
  });
}
export function latestSnapshot(video: Pick<Video, "snapshots">): MetricSnapshot | undefined {
  return video.snapshots.filter(s => Number.isFinite(Date.parse(s.observedAt))).toSorted((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).at(-1);
}
export function growthPerHour(snapshots: MetricSnapshot[]): number | null {
  const sorted = snapshots.filter(s => s.views !== null && Number.isFinite(Date.parse(s.observedAt))).toSorted((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const last = sorted.at(-1);
  if (!last) return null;
  const previous = sorted.findLast(s => Date.parse(s.observedAt) < Date.parse(last.observedAt));
  if (!previous || last.views === null || previous.views === null) return null;
  const hours = (Date.parse(last.observedAt) - Date.parse(previous.observedAt)) / 3600000;
  return (last.views - previous.views) / hours;
}
export function rankVideos(videos: Video[]): RankedVideo[] {
  const rows = videos.map((video): RankedVideo => {
    const s = latestSnapshot(video);
    const views = s?.views ?? null;
    const ageHours = video.publishedAt && s ? (Date.parse(s.observedAt) - Date.parse(video.publishedAt)) / 3600000 : NaN;
    return {
      ...video, score: null,
      engagementRate: views && s?.likes !== null && s?.comments !== null && s?.likes !== undefined && s?.comments !== undefined ? (s.likes + s.comments) / views : null,
      viewsPerHour: views !== null && Number.isFinite(ageHours) && ageHours >= 1 ? views / ageHours : null,
      followerMultiple: views !== null && video.followers !== null && video.followers > 0 ? views / video.followers : null,
      growthPerHour: growthPerHour(video.snapshots)
    };
  });
  const percentile = (value: number | null, pool: (number | null)[]) => {
    const valid = pool.filter((x): x is number => x !== null && Number.isFinite(x));
    if (value === null || !valid.length) return null;
    if (valid.length === 1 || valid.every(n => n === valid[0])) return 0.5;
    const below = valid.filter(n => n < value).length;
    const ties = valid.filter(n => n === value).length;
    return (below + (ties - 1) / 2) / (valid.length - 1);
  };
  for (const row of rows) {
    const signals: [number | null, number][] = [
      [percentile(latestSnapshot(row)?.views ?? null, rows.map(v => latestSnapshot(v)?.views ?? null)), 0.45],
      [percentile(row.engagementRate, rows.map(v => v.engagementRate)), 0.25],
      [percentile(row.growthPerHour ?? row.viewsPerHour, rows.map(v => v.growthPerHour ?? v.viewsPerHour)), 0.20],
      [percentile(row.followerMultiple, rows.map(v => v.followerMultiple)), 0.10]
    ];
    const available = signals.filter((s): s is [number, number] => s[0] !== null);
    row.score = available.length ? Math.round(100 * available.reduce((sum, [n, w]) => sum + n * w, 0) / available.reduce((sum, [, w]) => sum + w, 0)) : null;
  }
  return rows.toSorted((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export function mergeVideos(existing: Video[], incoming: Video[]): Video[] {
  const merged = new Map<string, Video>();
  for (const video of existing) merged.set(canonicalUrl(video.url) || video.id, video);
  for (const video of incoming) {
    const key = canonicalUrl(video.url) || video.id;
    const old = merged.get(key);
    if (!old) { merged.set(key, video); continue; }
    const observations = new Map<string, MetricSnapshot>();
    for (const s of [...old.snapshots, ...video.snapshots]) observations.set(`${s.observedAt}|${s.source}`, s);
    merged.set(key, {
      ...old, ...video, id: old.id,
      transcript: old.transcript || video.transcript,
      transcriptSource: old.transcriptSource || video.transcriptSource,
      visualNotes: old.visualNotes || video.visualNotes,
      onScreenText: old.onScreenText || video.onScreenText,
      snapshots: [...observations.values()].toSorted((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-100)
    });
  }
  return [...merged.values()];
}
