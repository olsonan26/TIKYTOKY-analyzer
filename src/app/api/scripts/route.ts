import { guard, readJson } from "@/lib/auth";
import { generateScripts } from "@/lib/ai";
import { apiError, json } from "@/lib/http";
import { scriptsRequest } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = scriptsRequest.parse(await readJson(request));
    const recentOutcomes = (input.outcomes ?? []).toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 20);
    return json(await generateScripts(input.brief, input.research, input.videos, input.knowledge, recentOutcomes));
  } catch (e) { return apiError(e); }
}
