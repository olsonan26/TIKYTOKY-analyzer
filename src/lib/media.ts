import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import type { FrameEvidence } from "./types";

const execute = promisify(execFile);
const MAX_BYTES = 35_000_000;
const CDN_DOMAINS = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "byteoversea.com", "ibytedtos.com", "muscdn.com", "apifyusercontent.com"];
export function approvedMediaUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || value.length > 6000) throw new Error();
    const apifyRecord = url.hostname === "api.apify.com" && /^\/v2\/key-value-stores\/[A-Za-z0-9_-]+\/records\/[A-Za-z0-9_.%~-]+$/.test(url.pathname);
    if (!apifyRecord && !CDN_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error();
    return url;
  } catch { throw new Error("Automatic visual study needs a downloadable video URL from the supported TikTok or Apify media hosts. Refresh discovery or inspect a local copy."); }
}
export async function downloadMedia(value: string): Promise<Buffer> {
  const url = approvedMediaUrl(value);
  // Only Apify's fixed asset endpoint receives its credential; no redirects carry it elsewhere.
  const headers: Record<string, string> = { "User-Agent": "TIKYTOKY-Research/0.1" };
  if (url.hostname === "api.apify.com" && process.env.APIFY_API_TOKEN) headers.Authorization = `Bearer ${process.env.APIFY_API_TOKEN}`;
  let response: Response;
  try { response = await fetch(url, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error("Video footage could not be fetched within 25 seconds. The URL may be expired or blocked; refresh discovery or upload a local copy."); }
  if (!response.ok || !response.body) throw new Error(`Video footage could not be retrieved (HTTP ${response.status}). Refresh discovery or upload a local copy.`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("This video exceeds the automatic 35 MB study limit. Use a shorter local clip.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error("This video exceeds the automatic 35 MB study limit. Use a shorter local clip."); }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  if (total < 100) throw new Error("The footage response did not contain a usable video.");
  return Buffer.concat(chunks);
}

/** Decode a real local buffer offline; showinfo supplies actual selected frame PTS. */
export async function extractMediaFrames(buffer: Buffer, duration: number | null): Promise<FrameEvidence[]> {
  if (!ffmpegPath) throw new Error("The automatic video decoder is unavailable on this deployment. Inspect a local video instead.");
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error("Video footage is empty or exceeds the automatic 35 MB study limit.");
  const directory = await mkdtemp(join(tmpdir(), "tikytoky-study-"));
  try {
    const input = join(directory, "input.mp4");
    await writeFile(input, buffer);
    const span = duration && Number.isFinite(duration) ? Math.min(180, Math.max(4, duration)) : 60;
    const laterGap = Math.max(1, (span - 3) / 8);
    const select = `select='isnan(prev_selected_t)+if(lt(t,3.1),gte(t-prev_selected_t,0.95),gte(t-prev_selected_t,${laterGap.toFixed(3)}))',showinfo,scale=512:512:force_original_aspect_ratio=decrease`;
    let stderr: string;
    try {
      const result = await execute(ffmpegPath, ["-hide_banner", "-nostdin", "-protocol_whitelist", "file,pipe", "-threads", "1", "-format_whitelist", "mov,matroska,webm,avi,flv,mpegts", "-i", input, "-an", "-t", "180", "-vf", select, "-vsync", "vfr", "-frames:v", "12", "-q:v", "5", join(directory, "frame-%02d.jpg")], { timeout: 45000, maxBuffer: 1_000_000, windowsHide: true });
      stderr = result.stderr;
    } catch { throw new Error("Video decoding failed or exceeded 45 seconds. Try another video or inspect a local copy."); }
    const times = [...stderr.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([0-9.e+-]+)/g)].map(match => Number(match[1])).filter(t => Number.isFinite(t) && t >= 0);
    const files = (await readdir(directory)).filter(name => /^frame-\d+\.jpg$/.test(name)).sort();
    if (!files.length || times.length < files.length) throw new Error("Decoded frames had no verifiable timestamps. Use a local copy for inspection.");
    return Promise.all(files.slice(0, 12).map(async (file, index) => ({ seconds: times[index], image: `data:image/jpeg;base64,${(await readFile(join(directory, file))).toString("base64")}` })));
  } finally {
    // This is a newly-created unique temporary directory, never a user-supplied path.
    if (resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith("tikytoky-study-")) await rm(directory, { recursive: true, force: true });
  }
}
