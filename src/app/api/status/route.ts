import { authenticated, passwordConfigured, productionPasswordRequired } from "@/lib/auth";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await authenticated();
  return json({
    authenticated: auth,
    passwordRequired: productionPasswordRequired() || passwordConfigured(),
    ai: !!process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4.1-flash",
    tiktok: !!process.env.APIFY_API_TOKEN,
    youtube: !!process.env.YOUTUBE_API_KEY,
    transcripts: !!process.env.SUPADATA_API_KEY
  });
}
