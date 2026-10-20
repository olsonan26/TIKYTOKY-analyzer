import { z } from "zod";

export const snapshotSchema = z.object({
  observedAt: z.iso.datetime(),
  views: z.number().finite().nonnegative().nullable(),
  likes: z.number().finite().nonnegative().nullable(),
  comments: z.number().finite().nonnegative().nullable(),
  shares: z.number().finite().nonnegative().nullable(),
  source: z.string().max(200)
});
export const frameSchema = z.object({
  seconds: z.number().finite().min(0).max(600),
  image: z.string().max(300000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
});
export const videoSchema = z.object({
  id: z.string().min(1).max(200), url: z.string().max(2048),
  platform: z.enum(["tiktok", "youtube", "instagram", "other"]),
  title: z.string().max(10000), creator: z.string().max(200),
  publishedAt: z.iso.datetime().nullable(), duration: z.number().finite().min(0).max(86400).nullable(),
  followers: z.number().finite().nonnegative().nullable(),
  thumbnail: z.string().max(4096).optional(), mediaUrl: z.string().max(4096).optional(),
  transcript: z.string().max(40000).optional(), transcriptSource: z.string().max(200).optional(),
  transcriptSegments: z.array(z.object({start: z.number().finite().min(0).max(600), end: z.number().finite().min(0).max(600), text: z.string().max(4000)}).refine(s => s.end >= s.start)).max(2000).optional(),
  description: z.string().max(10000).optional(), hashtags: z.array(z.string().max(200)).max(100).optional(),
  onScreenText: z.string().max(10000).optional(), visualNotes: z.string().max(10000).optional(),
  frames: z.array(frameSchema).max(12).optional(),
  snapshots: z.array(snapshotSchema).max(100), source: z.string().max(200), fetchedAt: z.iso.datetime()
});
const videos = z.array(videoSchema).min(1).max(20).refine(rows => new Set(rows.map(v => v.id)).size === rows.length, "Video IDs must be unique.");
export const analyzeRequest = z.object({ subject: z.string().trim().min(1).max(300), videos });
export const briefSchema = z.object({
  subject: z.string().trim().min(1).max(300), audience: z.string().min(1).max(1000),
  brand: z.string().max(300), offer: z.string().max(2000), tone: z.string().max(300),
  duration: z.number().int().min(10).max(180), cta: z.string().max(500), count: z.number().int().min(1).max(5),
  deliveryStyle: z.enum(["direct-teaching", "story-led", "reflective"]).optional(),
  studyCreators: z.array(z.enum(["alex-hormozi", "mrbeast", "zach-king", "nick-grigolia", "maren-altman", "may-like-the-month", "moon-omens"])).max(7).optional()
});
export const researchSchema = z.object({
  summary: z.string().max(15000),
  patterns: z.array(z.object({ name: z.string().max(300), explanation: z.string().max(5000), videoIds: z.array(z.string().max(200)).max(20), evidence: z.string().max(5000), confidence: z.enum(["low", "medium", "high"]) })).max(20),
  videos: z.array(z.object({ videoId: z.string().max(200), hook: z.string().max(3000), structure: z.string().max(3000), visualTechnique: z.string().max(3000), audioTechnique: z.string().max(3000), curiosity: z.string().max(3000), cta: z.string().max(3000), attentionRisks: z.array(z.string().max(2000)).max(20), evidenceLevel: z.enum(["metadata", "transcript", "frames", "transcript_and_frames"]) })).max(20),
  opportunities: z.array(z.string().max(5000)).max(20), limitations: z.array(z.string().max(5000)).max(20),
  sourceIds: z.array(z.string().max(200)).max(20), generatedAt: z.iso.datetime(), model: z.string().max(200)
});
export const knowledgeSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(300), text: z.string().trim().min(1).max(12000000), uploadedAt: z.iso.datetime(),pageCount:z.number().int().min(1).max(5000).optional(),extraction:z.string().max(300).optional() });
export const outcomeSchema = z.object({ id: z.string().max(200), scriptTitle: z.string().max(500), url: z.string().max(2048), publishedAt: z.iso.datetime(), snapshots: z.array(snapshotSchema).max(100), notes: z.string().max(5000) });
export const scriptsRequest = z.object({ brief: briefSchema, research: researchSchema, videos,
  knowledge: z.array(knowledgeSchema).min(1).max(20).refine(docs => docs.reduce((total, doc) => total + doc.text.length, 0) <= 100000, "Select knowledge totaling at most 100,000 characters.").refine(docs => new Set(docs.map(d => d.id)).size === docs.length, "Knowledge IDs must be unique."),
  outcomes: z.array(outcomeSchema).max(200).optional()
});
export const discoverRequest = z.object({ subject: z.string().trim().min(1).max(200), platform: z.enum(["tiktok", "youtube"]), limit: z.number().int().min(3).max(100), periodDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.literal(365)]) });
export const inspectRequest = z.object({ video: videoSchema, frames: z.array(frameSchema).min(1).max(12) });
