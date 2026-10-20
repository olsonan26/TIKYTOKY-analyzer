import { z } from "zod";
import { guard, readJson } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
import { outcomeSchema, videoSchema } from "@/lib/validation";
import { buildGrowthPlan } from "@/lib/growth";
export const runtime = "nodejs";
const schema = z.object({ videos: z.array(videoSchema).max(500), outcomes: z.array(outcomeSchema).max(500) });
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = schema.parse(await readJson(request));
    return json(buildGrowthPlan(input.videos, input.outcomes));
  } catch (e) { return apiError(e); }
}
