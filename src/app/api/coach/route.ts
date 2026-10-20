import { z } from "zod";
import { guard, readJson } from "@/lib/auth";
import { coachVideo } from "@/lib/ai";
import { apiError, json } from "@/lib/http";
import { videoSchema } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({ subject: z.string().min(1).max(300), draft: videoSchema, benchmarks: z.array(videoSchema).min(1).max(10).refine(v => new Set(v.map(x => x.id)).size === v.length, "Benchmark IDs must be unique.") });
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = schema.parse(await readJson(request));
    return json(await coachVideo(input.draft, input.benchmarks, input.subject));
  } catch (e) { return apiError(e); }
}
