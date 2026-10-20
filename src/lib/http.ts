import { z } from "zod";
import { HttpError } from "./auth";

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: `Check your input: ${error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, 400);
  if (error instanceof Error) {
    // Provider messages are constructed locally. Strip credential patterns as defense in depth.
    const message = error.message.replace(/sk-or-v1-[a-zA-Z0-9]+/g, "[redacted]").replace(/([?&](?:token|key|api_key)=)[^&\s]+/gi, "$1[redacted]");
    return json({ error: message.slice(0, 500) }, 502);
  }
  return json({ error: "The request failed. Try again." }, 500);
}
