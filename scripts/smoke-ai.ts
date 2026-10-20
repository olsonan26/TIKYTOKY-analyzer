/** Opt-in live provider smoke. Fixture content is test-only, never market evidence. */
import { analyzeVideos, generateScripts } from "../src/lib/ai";
import type { KnowledgeDocument, Video } from "../src/lib/types";

const now = new Date().toISOString();
const knowledge: KnowledgeDocument[] = [{
  id: "validation-notes", name: "Software validation notes (test fixture)", uploadedAt: now,
  text: "TIKY TOKY is a video research workspace. It compares a supplied video sample and helps creators write original scripts. Creators can upload their own knowledge documents. The posting plan displays dates and times in the America/Denver time zone. The workspace does not guarantee views or virality."
}];
const source: Video = {
  id: "local-validation-transcript", url: "local://validation-transcript", platform: "other",
  title: "Local authored validation transcript; not a public viral example", creator: "Software validation",
  publishedAt: null, duration: 20, followers: null, snapshots: [],
  transcript: "Want a clearer way to research video ideas? Compare a video sample, add your own knowledge, and write an original script. Keep your sources with your script.",
  transcriptSource: "Authored validation text; no recorded audio or video supplied", source: "Test fixture, not market evidence", fetchedAt: now
};
async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Set OPENROUTER_API_KEY before opting into a live provider test.");
  console.log("Running a live DeepSeek smoke with explicit test-only text and no invented performance metrics.");
  const research = await analyzeVideos("Video research software", [source]);
  console.log(JSON.stringify({ stage: "research", model: research.model, sources: research.sourceIds.length, patterns: research.patterns.length }));
  const scripts = await generateScripts({ subject: "Video research software", audience: "Creators researching their next original video", brand: "TIKY TOKY", offer: "A video research workspace", tone: "Clear, practical and factual", duration: 20, cta: "Add your own knowledge documents", count: 1 }, research, [source], knowledge);
  console.log(JSON.stringify({ stage: "grounded-scripts", model: scripts.model, scripts: scripts.scripts.length, citations: scripts.scripts[0]?.knowledgeCitations.length, verified: true }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Live smoke failed."); process.exitCode = 1; });
