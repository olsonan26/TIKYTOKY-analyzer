import { guard, readJson } from "@/lib/auth";
import { startDiscovery, pollDiscovery } from "@/lib/discovery";
import { apiError, json } from "@/lib/http";
import { discoverRequest } from "@/lib/validation";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try { await guard(request); return json(await startDiscovery(discoverRequest.parse(await readJson(request, 5000)))); }
  catch (e) { return apiError(e); }
}
export async function GET(request: Request) {
  try {
    await guard(request);
    const params = new URL(request.url).searchParams;
    const query = z.object({ id: z.string().min(1).max(200), subject: z.string().min(1).max(200), limit: z.coerce.number().int().min(3).max(100) }).parse(Object.fromEntries(params));
    return json(await pollDiscovery(query.id, query.subject, query.limit));
  } catch (e) { return apiError(e); }
}
