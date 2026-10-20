import { z } from "zod";
import { guard, readJson } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
import { videoSchema } from "@/lib/validation";
import { downloadMedia, extractMediaFrames } from "@/lib/media";
import { inspectFrames } from "@/lib/ai";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    await guard(request);
    const { video } = z.object({ video: videoSchema }).parse(await readJson(request, 300000));
    if (!video.mediaUrl) throw new Error("This source has no downloadable footage. Refresh TikTok discovery with downloads enabled, or inspect a local copy.");
    const frames = await extractMediaFrames(await downloadMedia(video.mediaUrl), video.duration);
    const notes = await inspectFrames(video, frames);
    return json({ ...notes, frameCount: frames.length, frameTimes: frames.map(frame => frame.seconds), source: "AI interpretation of decoded video frames; not a continuous audiovisual measurement" });
  } catch (error) { return apiError(error); }
}
