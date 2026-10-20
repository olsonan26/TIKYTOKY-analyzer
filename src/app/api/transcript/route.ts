import { z } from "zod";
import { guard, HttpError, readJson } from "@/lib/auth";
import { startTranscript, pollTranscript } from "@/lib/transcripts";
import { apiError, json } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await guard(request);
    const { url } = z.object({ url: z.url().max(2048) }).parse(await readJson(request, 5000));
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !/(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com)$/.test(parsed.hostname) || parsed.username || parsed.password) throw new HttpError(400, "Use an HTTPS TikTok, YouTube, or Instagram video link.");
    return json(await startTranscript(url));
  } catch (e) { return apiError(e); }
}
export async function GET(request: Request) {
  try {
    await guard(request);
    const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).parse(new URL(request.url).searchParams.get("id"));
    return json(await pollTranscript(id));
  } catch (e) { return apiError(e); }
}
