import { guard, readJson } from "@/lib/auth";
import { analyzeVideos } from "@/lib/ai";
import { apiError, json } from "@/lib/http";
import { analyzeRequest } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = analyzeRequest.parse(await readJson(request));
    return json(await analyzeVideos(input.subject, input.videos));
  } catch (e) { return apiError(e); }
}
