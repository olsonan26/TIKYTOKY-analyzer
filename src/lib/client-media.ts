import type { Brief, FrameEvidence, GeneratedScript, Project } from "./types";
import { z } from "zod";
import { knowledgeSchema, outcomeSchema, researchSchema, videoSchema } from "./validation";

const text = z.string();
const strings = z.array(text);
const restoredScript = z.object({ title: text, angle: text, hook: text, beats: z.array(z.object({ start: z.number().finite(), end: z.number().finite(), spoken: text, onScreen: text, visual: text })), caption: text, hashtags: strings, cta: text, sourceIds: strings, patternNames: strings, hypothesis: text, testPlan: text, knowledgeCitations: z.array(z.object({ documentId: text, quote: text, supports: text })).default([]) });
const restoredCoaching = z.object({ verdict: text, strengths: strings, fixes: z.array(z.object({ priority: z.enum(["high", "medium", "low"]), moment: text, problem: text, change: text, referenceVideoIds: strings })), revisedHook: text, suggestedCuts: strings, prePublishChecklist: strings, testHypothesis: text, limitations: strings, model: text, generatedAt: z.iso.datetime() });
const restoredPlan = z.object({ timezone: z.literal("America/Denver"), generatedAt: z.iso.datetime(), timingBasis: z.enum(["observed", "experiment"]), timingExplanation: text, schedule: z.array(z.object({ utc: z.iso.datetime(), localLabel: text, rationale: text })), duration: z.object({ seconds: z.number().finite(), lower: z.number().finite(), upper: z.number().finite(), sampleSize: z.number().int().nonnegative(), basis: text }), experiments: z.array(z.object({ title: text, change: text, measure: text })), checklist: strings, caveats: strings });
const savedProjectSchema = z.object({ id: text.min(1).max(200), subject: text.max(300), videos: z.array(videoSchema).max(500), outcomes: z.array(outcomeSchema).max(500).default([]), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), research: researchSchema.optional(), scripts: z.object({ scripts: z.array(restoredScript), generatedAt: z.iso.datetime(), model: text }).optional(), knowledge: z.array(knowledgeSchema).max(20).optional(), draft: videoSchema.optional(), coaching: restoredCoaching.optional(), plan: restoredPlan.optional() });

/** Validate nested UI data before replacing an existing workspace. */
export function parseSavedProject(value: unknown): Project {
  const result = savedProjectSchema.safeParse(value);
  if (!result.success) throw new Error("The project contains incomplete or invalid saved data. Your existing projects were left unchanged.");
  return withoutFrameBytes(result.data);
}

export function parseSavedBrief(value: unknown): Brief {
  const result = z.object({ subject: text.max(300), audience: text.max(1000), brand: text.max(300), offer: text.max(2000), tone: text.max(300), duration: z.number().int().min(10).max(180), cta: text.max(500), count: z.number().int().min(1).max(5), deliveryStyle: z.enum(["direct-teaching","story-led","reflective"]).optional(), studyCreators: z.array(z.enum(["alex-hormozi","mrbeast","zach-king","nick-grigolia","maren-altman","may-like-the-month","moon-omens"])).max(7).optional() }).safeParse(value);
  if (!result.success) throw new Error("The saved creative brief is invalid. Your existing workspace was left unchanged.");
  return result.data;
}

/** Sample local media in this browser. Frame bytes are ephemeral and never saved in a project. */
export async function captureVideoFrames(file: File): Promise<{ frames: FrameEvidence[]; duration: number }> {
  if (!file.type.startsWith("video/")) throw new Error("Choose a video file to inspect.");
  if (file.size > 500 * 1024 * 1024) throw new Error("Choose a video smaller than 500 MB.");
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("This video format could not be decoded by your browser.")); };
    const timer = window.setTimeout(fail, 20_000);
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener("error", fail); };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
  try {
    const loaded = waitFor("loadeddata");
    video.src = objectUrl;
    await loaded;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("The video has no readable duration.");
    if (duration > 600) throw new Error("Choose a video shorter than 10 minutes for frame inspection.");
    const times = [0, 1, 2, 3].filter(time => time < duration);
    const last = Math.max(0, duration - 0.1);
    if (last > 3) for (let index = 1; index <= 8; index++) times.push(3 + (last - 3) * index / 8);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create a video preview.");
    const frames: FrameEvidence[] = [];
    for (const seconds of [...new Set(times.map(time => Math.round(time * 100) / 100))].slice(0, 12)) {
      if (Math.abs(video.currentTime - seconds) > 0.005) {
        const seeked = waitFor("seeked");
        video.currentTime = seconds;
        await seeked;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ seconds, image: canvas.toDataURL("image/jpeg", 0.72) });
    }
    return { frames, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function withoutFrameBytes(project: Project): Project {
  const strip = (video: Project["videos"][number]) => { const { frames: _frames, ...safe } = video; return safe; };
  return { ...project, videos: project.videos.map(strip), draft: project.draft ? strip(project.draft) : undefined };
}

export function downloadFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function scriptsMarkdown(subject: string, scripts: GeneratedScript[]): string {
  return `# ${subject || "TIKY TOKY"} — original scripts\n\n` + scripts.map((script, index) => [
    `## ${index + 1}. ${script.title}`, `**Angle:** ${script.angle}`, `**Hook:** ${script.hook}`,
    ...script.beats.map(beat => `### ${beat.start}–${beat.end}s\n\n${beat.spoken}\n\nOn screen: ${beat.onScreen}\n\nVisual: ${beat.visual}`),
    `**CTA:** ${script.cta}`, `**Caption:** ${script.caption}`, script.hashtags.map(tag => tag.startsWith("#") ? tag : `#${tag}`).join(" "),
    `**Patterns:** ${script.patternNames.join(", ")}`, `**Source video IDs:** ${script.sourceIds.join(", ")}`,
    `**Hypothesis:** ${script.hypothesis}`, `**Test plan:** ${script.testPlan}`,
    ...(script.knowledgeCitations || []).map(citation => `**Knowledge source ${citation.documentId}:** “${citation.quote}”\n\nSupports: ${citation.supports}`),
  ].join("\n\n")).join("\n\n---\n\n");
}
