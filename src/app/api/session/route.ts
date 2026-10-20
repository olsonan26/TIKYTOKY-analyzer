import { cookies } from "next/headers";
import { z } from "zod";
import { COOKIE, HttpError, makeSession, passwordMatches, readJson, sameOrigin } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { password } = z.object({ password: z.string().max(256) }).parse(await readJson(request, 2048));
    if (!passwordMatches(password)) throw new HttpError(401, "The workspace password is incorrect, or APP_PASSWORD is not configured with at least 16 characters.");
    const token = makeSession();
    (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 43200 });
    return json({ authenticated: true });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    (await cookies()).delete(COOKIE);
    return json({ authenticated: false });
  } catch (e) { return apiError(e); }
}
