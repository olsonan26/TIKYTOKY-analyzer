import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const COOKIE = "tikytoky_session";
export function productionPasswordRequired(): boolean { return process.env.NODE_ENV === "production" || !!process.env.VERCEL; }
export function passwordConfigured(): boolean { return (process.env.APP_PASSWORD?.length ?? 0) >= 16; }
export function passwordMatches(candidate: string): boolean {
  const actual = process.env.APP_PASSWORD ?? "";
  const a = Buffer.from(candidate), b = Buffer.from(actual);
  return a.length === b.length && actual.length >= 16 && timingSafeEqual(a, b);
}
function signature(expires: string): string {
  return createHmac("sha256", process.env.APP_PASSWORD ?? "").update(`tikytoky:${expires}`).digest("hex");
}
export function makeSession(now = Date.now()): string {
  if (!passwordConfigured()) throw new HttpError(503, "Set APP_PASSWORD to at least 16 characters on the server.");
  const expires = String(now + 12 * 3600000);
  return `${expires}.${signature(expires)}`;
}
export function validSession(value: string | undefined, now = Date.now()): boolean {
  if (!value || !passwordConfigured()) return false;
  const [expires, sig, extra] = value.split(".");
  if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(sig ?? "") || Number(expires) <= now || Number(expires) > now + 13 * 3600000) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(expires)));
}
export async function authenticated(): Promise<boolean> {
  if (!productionPasswordRequired() && !process.env.APP_PASSWORD) return true;
  return validSession((await cookies()).get(COOKIE)?.value);
}
export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost when listening on 127.0.0.1.
  // The browser's Host header carries the actual destination; never trust an arbitrary forwarded host.
  const expected = new URL(request.url);
  const destinationHost = request.headers.get("host") || expected.host;
  if (origin) {
    let originUrl: URL;
    try { originUrl = new URL(origin); } catch { throw new HttpError(403, "Use this workspace's own page to send requests."); }
    if (!["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== destinationHost) throw new HttpError(403, "Use this workspace's own page to send requests.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site requests are disabled.");
}
export async function guard(request: Request): Promise<void> {
  sameOrigin(request);
  if (productionPasswordRequired() && !passwordConfigured()) throw new HttpError(503, "Set APP_PASSWORD to at least 16 characters in Vercel, then redeploy.");
  if (!await authenticated()) throw new HttpError(401, "Sign in to your workspace first.");
}
export async function readJson(request: Request, maxBytes = 3500000): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) throw new HttpError(415, "Send JSON with Content-Type application/json.");
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, "This request is too large. Use fewer videos or smaller frames.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is missing.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new HttpError(413, "This request is too large. Use fewer videos or smaller frames."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Request body must be valid JSON."); }
}
