import { guard, readJson } from "@/lib/auth";
import { inspectFrames } from "@/lib/ai";
import { apiError, json } from "@/lib/http";
import { inspectRequest } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = inspectRequest.parse(await readJson(request));
    return json(await inspectFrames(input.video, input.frames));
  } catch (e) { return apiError(e); }
}
