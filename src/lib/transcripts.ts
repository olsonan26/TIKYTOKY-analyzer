export type TranscriptResult = { status: "completed" | "queued"; transcript?: string; jobId?: string; message?: string };
const BASE = "https://api.supadata.ai/v1";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function validateJobId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error("Invalid transcript job identifier.");
  return value;
}
function videoUrl(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.port || url.username || url.password || value.length > 2048) throw new Error("invalid");
    const allowed = ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "instagram.com", "www.instagram.com"];
    if (!allowed.includes(host)) throw new Error("invalid");
    return url.href;
  } catch { throw new Error("Enter an HTTPS TikTok, YouTube, or Instagram video link."); }
}
async function request(path: string, params?: Record<string, string>): Promise<{ status: number; data: Record<string, unknown> }> {
  const key = process.env.SUPADATA_API_KEY?.trim();
  if (!key) throw new Error("Transcript retrieval needs SUPADATA_API_KEY on the server. You can paste a transcript manually.");
  const endpoint = new URL(`${BASE}${path}`);
  if (params) endpoint.search = new URLSearchParams(params).toString();
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { "x-api-key": key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000) });
  } catch { throw new Error("The transcript provider could not be reached within the request timeout. Please retry."); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Transcript provider authorization failed. Check the server API key and permissions.");
    if (response.status === 402) throw new Error("The transcript provider requires available account credits.");
    if (response.status === 429) throw new Error("Transcript provider rate or quota limit reached. Please retry later.");
    if (response.status === 404) throw new Error("No transcript or transcript job was found by the provider.");
    throw new Error(`Transcript provider returned HTTP ${response.status}. The request could not be completed.`);
  }
  try {
    const body = await response.text();
    if (body.length > 1_000_000) throw new Error("oversized");
    const data = JSON.parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid");
    return { status: response.status, data: record(data) };
  } catch { throw new Error("The transcript provider returned an invalid response."); }
}
function contentText(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, 100_000);
  if (!Array.isArray(value)) return "";
  return value.map(item => typeof record(item).text === "string" ? String(record(item).text).trim() : "").filter(Boolean).join("\n").slice(0, 100_000);
}
function completed(data: Record<string, unknown>, partial = false): TranscriptResult {
  const transcript = contentText(data.content);
  if (!transcript) throw new Error("The provider returned no usable speech transcript. Paste a transcript manually or try another video.");
  return { status: "completed", transcript, ...(partial ? { message: "The provider returned a partial transcript. Review it before analysis." } : {}) };
}

export async function startTranscript(url: string): Promise<TranscriptResult> {
  const validUrl = videoUrl(url);
  // Auto can use paid generated speech-to-text when native captions are unavailable.
  const { status, data } = await request("/transcript", { url: validUrl, text: "true", mode: "auto" });
  if (status === 202 || typeof data.jobId === "string") {
    return { status: "queued", jobId: validateJobId(data.jobId), message: "Transcript processing is queued. Poll the job to collect its result." };
  }
  return completed(data, status === 206);
}

export async function pollTranscript(id: string): Promise<TranscriptResult> {
  const jobId = validateJobId(id);
  const { data } = await request(`/transcript/${encodeURIComponent(jobId)}`);
  if (data.status === "queued" || data.status === "active") return { status: "queued", jobId, message: "Transcript processing is still running." };
  if (data.status === "failed") throw new Error("The transcript provider could not process this video. Paste a transcript manually or try another video.");
  if (data.status !== "completed") throw new Error("The transcript provider returned an unknown job status.");
  // Official SDK wraps completed content in result; direct content is also documented.
  return completed(data.result && typeof data.result === "object" ? record(data.result) : data);
}
