import test from "node:test";
import assert from "node:assert/strict";
import { analyzeVideos, coachVideo, generateScripts, inspectFrames } from "../src/lib/ai";
import type { Brief, KnowledgeDocument, Research, Video } from "../src/lib/types";

process.env.OPENROUTER_API_KEY = "test-provider-key";
process.env.OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash";

const source: Video = {
  id: "source-1", url: "https://www.tiktok.com/@example/video/123", platform: "tiktok",
  title: "Example title", creator: "example", publishedAt: null, duration: 30, followers: null,
  source: "manual import", fetchedAt: "2026-10-20T00:00:00.000Z",
  snapshots: [{ observedAt: "2026-10-20T00:00:00.000Z", views: 1000, likes: 100, comments: null, shares: null, source: "manual import" }],
};
const brief: Brief = {
  subject: "personality", audience: "curious adults", brand: "MyHiddenTruth", offer: "A personal profile",
  tone: "warm", duration: 30, cta: "Explore your profile", count: 1,
};
const knowledge: KnowledgeDocument[] = [{
  id: "knowledge-1", name: "User's product notes", uploadedAt: "2026-10-20T00:00:00.000Z",
  text: "MyHiddenTruth offers a personal profile for exploring your preferences. The exercise invites people to compare first impressions and talk about their preferences.",
}];

function rawResearch() {
  return {
    summary: "An exploratory sample.",
    patterns: [{ name: "Curiosity question", explanation: "A question introduces an idea.", videoIds: [source.id], evidence: "A supplied source mentions a question.", confidence: "high" }],
    videos: [{ videoId: source.id, hook: "The speaker asks a question.", structure: "Question, example, invitation.", visualTechnique: "A talking head.", audioTechnique: "Energetic music.", curiosity: "A question remains open.", cta: "An invitation.", attentionRisks: [] }],
    opportunities: ["Test an original question."], limitations: ["Small sample."], sourceIds: [source.id],
  };
}
function research(): Research {
  return {
    ...rawResearch(),
    patterns: [{ ...rawResearch().patterns[0], confidence: "low" }],
    videos: [{ ...rawResearch().videos[0], evidenceLevel: "metadata" }],
    generatedAt: "2026-10-20T00:00:00.000Z", model: "test",
  };
}
function rawScript() {
  return {
    scripts: [{
      title: "One surprising detail", angle: "Invite reflection without promising a result", hook: "What detail do you notice first?",
      beats: [
        { start: 0, end: 3, spoken: "What detail catches your eye?", onScreen: "Notice one detail", visual: "Close-up of two abstract shapes." },
        { start: 3, end: 25, spoken: "The way you describe it can begin a useful conversation about your preferences. Compare your first impression with a friend's and see what surprises you.", onScreen: "Compare your first impressions", visual: "Show two different written reactions." },
        { start: 25, end: 30, spoken: "Explore your profile with MyHiddenTruth.", onScreen: "Explore your profile", visual: "Show the brand and a clear invitation." },
      ],
      caption: "An invitation to notice your own preferences.", hashtags: ["#SelfReflection"], cta: "Explore your profile",
      sourceIds: [source.id], patternNames: ["Curiosity question"],
      hypothesis: "A reflective question may improve initial interest in this audience.",
      testPlan: "Compare two original opening questions with the same offer. Record actual views and profile visits after 24 and 48 hours.",
      knowledgeCitations: [{ documentId: knowledge[0].id, quote: "MyHiddenTruth offers a personal profile for exploring your preferences.", supports: "The script invites the viewer to explore a MyHiddenTruth profile." }],
    }],
  };
}

async function withResponse<T>(output: unknown, run: (calls: RequestInit[]) => Promise<T>, options: { status?: number; finish?: string; raw?: string; verification?: unknown } = {}): Promise<T> {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(init || {});
    const request = JSON.parse(init?.body as string);
    const verifying = request.messages[0].content.startsWith("KNOWLEDGE_ENTAILMENT_VERIFIER");
    const outputScripts = typeof output === "object" && output !== null && "scripts" in output && Array.isArray(output.scripts) ? output.scripts : [];
    const verification = options.verification ?? { scripts: outputScripts.map((_, scriptIndex) => ({ scriptIndex, verdict: "supported", unsupportedClaims: [], citationIssues: [] })) };
    return new Response(JSON.stringify(options.status && options.status >= 400 ? { error: "private-provider-body" } : {
      choices: [{ finish_reason: options.finish || "stop", message: { content: verifying ? JSON.stringify(verification) : options.raw ?? JSON.stringify(output) } }],
    }), { status: options.status || 200, headers: { "content-type": "application/json" } });
  };
  try { return await run(calls); } finally { globalThis.fetch = original; }
}

test("metadata-only research cannot claim transcript, visual, or acoustic observations", async () => {
  await withResponse(rawResearch(), async calls => {
    const result = await analyzeVideos("personality", [source]);
    assert.equal(result.videos[0].evidenceLevel, "metadata");
    assert.match(result.videos[0].hook, /Unavailable from metadata/);
    assert.match(result.videos[0].visualTechnique, /unavailable/i);
    assert.match(result.videos[0].audioTechnique, /not measured/);
    assert.equal(result.patterns[0].confidence, "low");
    assert.match(result.patterns[0].evidence, /1 of 1/);
    assert.ok(result.limitations.some(value => value.includes("Actual viewer retention")));
    const request = JSON.parse(calls[0].body as string);
    assert.equal(request.model, "deepseek/deepseek-v4.1-flash");
    assert.equal(request.max_tokens, 8000);
    assert.ok(calls[0].signal);
    assert.match(request.messages[0].content, /UNTRUSTED DATA/);
  });
});

test("evidence labels come from actual supplied evidence, not provider claims", async () => {
  const payload = { ...rawResearch(), videos: [{ ...rawResearch().videos[0], evidenceLevel: "metadata" }] };
  await withResponse(payload, async () => {
    const result = await analyzeVideos("personality", [{ ...source, transcript: "A real supplied transcript", visualNotes: "User notes describe an abstract shape." }]);
    assert.equal(result.videos[0].evidenceLevel, "transcript_and_frames");
    assert.ok(result.limitations.some(value => value.includes("human annotation")));
    assert.match(result.videos[0].audioTechnique, /not measured/);
  });
});

test("unknown source citations and missing per-video analyses fail closed", async () => {
  const unknown = { ...rawResearch(), patterns: [{ ...rawResearch().patterns[0], videoIds: ["invented-id"] }] };
  await withResponse(unknown, () => assert.rejects(analyzeVideos("personality", [source]), /unknown source|failed validation \(scripts\.0\.sourceIds/));
  const wrongVideo = { ...rawResearch(), videos: [{ ...rawResearch().videos[0], videoId: "other-video" }] };
  await withResponse(wrongVideo, () => assert.rejects(analyzeVideos("personality", [source]), /unknown source|failed validation \(scripts\.0\.sourceIds/));
});

test("valid fenced JSON is accepted; trailing prose, malformed JSON and truncation are rejected", async () => {
  await withResponse(null, async () => {
    const result = await analyzeVideos("personality", [source]);
    assert.equal(result.sourceIds[0], source.id);
  }, { raw: "```json\n" + JSON.stringify(rawResearch()) + "\n```" });
  await withResponse(null, () => assert.rejects(analyzeVideos("personality", [source]), /malformed JSON/), { raw: JSON.stringify(rawResearch()) + " trailing prose" });
  await withResponse(rawResearch(), () => assert.rejects(analyzeVideos("personality", [source]), /incomplete or blocked/), { finish: "length" });
});

test("provider failure is explicit and does not expose its body or credentials", async () => {
  await withResponse(null, async () => {
    await assert.rejects(analyzeVideos("personality", [source]), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /402/);
      assert.doesNotMatch(error.message, /private-provider-body|test-provider-key/);
      return true;
    });
  }, { status: 402 });
});

test("batch size and duplicate IDs are checked before any provider request", async () => {
  await withResponse(rawResearch(), async calls => {
    await assert.rejects(analyzeVideos("personality", Array.from({ length: 21 }, (_, index) => ({ ...source, id: `${index}` }))), /1 and 20/);
    await assert.rejects(analyzeVideos("personality", [source, source]), /unique/);
    assert.equal(calls.length, 0);
  });
});

test("valid script preserves structured production details and provenance", async () => {
  await withResponse(rawScript(), async calls => {
    const result = await generateScripts(brief, research(), [source], knowledge);
    assert.equal(result.scripts.length, 1);
    assert.equal(result.scripts[0].beats.at(-1)?.end, brief.duration);
    assert.equal(result.scripts[0].sourceIds[0], source.id);
    assert.ok(result.scripts[0].testPlan.includes("actual views"));
    assert.equal(result.scripts[0].knowledgeCitations[0].documentId, knowledge[0].id);
    assert.equal(calls.length, 2);
  });
});

test("overlapping, out-of-range and incomplete script timings fail", async () => {
  const overlapping = rawScript();
  overlapping.scripts[0].beats[1].start = 2;
  await withResponse(overlapping, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /timings/));
  const outOfRange = rawScript();
  outOfRange.scripts[0].beats[2].end = 31;
  await withResponse(outOfRange, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /timings/));
  const incomplete = rawScript();
  incomplete.scripts[0].beats[2].end = 27;
  await withResponse(incomplete, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /duration/));
});

test("scripts reject invented sources and research patterns", async () => {
  const inventedSource = rawScript();
  inventedSource.scripts[0].sourceIds = ["imaginary-video"];
  await withResponse(inventedSource, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /unknown source|failed validation \(scripts\.0\.sourceIds/));
  const inventedPattern = rawScript();
  inventedPattern.scripts[0].patternNames = ["A pattern that was not researched"];
  await withResponse(inventedPattern, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /unknown research pattern/));
});

test("source-transcript phrase copying fails the originality check", async () => {
  const transcript = "This unusually specific sequence of words belongs to the source creator and should never be copied by the generated script.";
  const copied = rawScript();
  copied.scripts[0].beats[1].spoken = transcript;
  await withResponse(copied, () => assert.rejects(generateScripts(brief, research(), [{ ...source, transcript }], knowledge), /too close to a source transcript/));
});

test("invalid image formats and timestamps are rejected before transmission", async () => {
  await withResponse({}, async calls => {
    await assert.rejects(inspectFrames(source, [{ seconds: 0, image: "https://private.example/image.jpg" }]), /valid JPEG/);
    await assert.rejects(inspectFrames(source, [{ seconds: -1, image: "data:image/jpeg;base64,YWJj" }]), /valid JPEG/);
    assert.equal(calls.length, 0);
  });
});

test("image inspection sends only bounded explicit frames and accepts no-text result", async () => {
  await withResponse({ visualNotes: "0.00s: a blue card is visible.", onScreenText: "" }, async calls => {
    const result = await inspectFrames(source, [{ seconds: 0, image: "data:image/jpeg;base64,YWJj" }]);
    assert.equal(result.onScreenText, "");
    const request = JSON.parse(calls[0].body as string);
    assert.equal(request.max_tokens, 2500);
    assert.equal(request.messages[1].content.filter((part: { type: string }) => part.type === "image_url").length, 1);
    assert.match(request.messages[1].content[0].text, /Do not infer speech/);
  });
});

function rawCoaching() {
  return {
    verdict: "The draft has a clear premise, with room for a more specific question.",
    strengths: ["The transcript gives a concrete example."],
    fixes: [
      { priority: "low", moment: "Closing transcript phrase; exact timing unverified", problem: "The invitation is broad.", change: "Use one clear invitation.", referenceVideoIds: [] },
      { priority: "high", moment: "Opening transcript phrase; exact timing unverified", problem: "The premise takes time to arrive.", change: "Lead with the concrete question.", referenceVideoIds: [source.id] },
    ],
    revisedHook: "Which small detail would you notice before your friends?",
    suggestedCuts: ["Consider removing the introductory greeting; locate it in the source before cutting."],
    prePublishChecklist: ["Check that the opening question receives a payoff."],
    testHypothesis: "Test two questions with the same body and compare actual profile visits per view.",
    limitations: ["The sample is small."],
  };
}

test("draft coaching ranks concrete fixes and cites only known reference videos", async () => {
  await withResponse(rawCoaching(), async () => {
    const draft = { ...source, id: "draft-1", transcript: "Hello everyone. Here is an example to think about." };
    const result = await coachVideo(draft, [source], "personality");
    assert.equal(result.fixes[0].priority, "high");
    assert.deepEqual(result.fixes[0].referenceVideoIds, [source.id]);
    assert.ok(result.limitations.some(value => value.includes("Actual viewer retention")));
    assert.ok(result.limitations.some(value => value.includes("Draft visuals were not supplied")));
  });
});

test("coaching refuses metadata-only drafts without making a provider request", async () => {
  await withResponse(rawCoaching(), async calls => {
    await assert.rejects(coachVideo({ ...source, id: "draft-1" }, [source], "personality"), /Add a draft transcript/);
    assert.equal(calls.length, 0);
  });
});

test("coaching rejects hallucinated citations and copied benchmark hooks", async () => {
  const draft = { ...source, id: "draft-1", transcript: "A draft opening." };
  const unknown = rawCoaching();
  unknown.fixes[0].referenceVideoIds = ["invented-source"];
  await withResponse(unknown, () => assert.rejects(coachVideo(draft, [source], "personality"), /unknown source|failed validation \(scripts\.0\.sourceIds/));
  const copied = rawCoaching();
  copied.revisedHook = "This specific benchmark opening must remain the work of its original creator without copied words.";
  await withResponse(copied, () => assert.rejects(coachVideo(draft, [{ ...source, transcript: copied.revisedHook }], "personality"), /too close to a source transcript/));
});

test("script generation requires nonempty bounded knowledge before any provider call", async () => {
  await withResponse(rawScript(), async calls => {
    await assert.rejects(generateScripts(brief, research(), [source], []), /nonempty knowledge/);
    await assert.rejects(generateScripts(brief, research(), [source], [{ ...knowledge[0], text: "  \n " }]), /nonempty knowledge/);
    await assert.rejects(generateScripts(brief, research(), [source], [{ ...knowledge[0], text: "x".repeat(100_001) }]), /100,000-character/);
    assert.equal(calls.length, 0);
  });
});

test("unknown knowledge IDs and altered quotes fail before semantic verification", async () => {
  const unknown = rawScript();
  unknown.scripts[0].knowledgeCitations[0].documentId = "unknown-document";
  await withResponse(unknown, async calls => {
    await assert.rejects(generateScripts(brief, research(), [source], knowledge), /unknown knowledge document|failed validation \(scripts\.0\.knowledgeCitations/);
    assert.equal(calls.length, 1);
  });
  const changed = rawScript();
  changed.scripts[0].knowledgeCitations[0].quote = "MyHiddenTruth guarantees accurate predictions about your future.";
  await withResponse(changed, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /did not exactly match/));
});

test("citation matching permits whitespace normalization only", async () => {
  const wrapped = rawScript();
  wrapped.scripts[0].knowledgeCitations[0].quote = "MyHiddenTruth offers a\npersonal profile for exploring your preferences.";
  await withResponse(wrapped, async () => {
    const result = await generateScripts(brief, research(), [source], knowledge);
    assert.equal(result.scripts.length, 1);
  });
  const changedCase = rawScript();
  changedCase.scripts[0].knowledgeCitations[0].quote = knowledge[0].text.split(". ")[0].toLowerCase() + ".";
  await withResponse(changedCase, () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /did not exactly match/));
});

test("independent verification rejects unsupported facts even with a real exact citation", async () => {
  const output = rawScript();
  output.scripts[0].hook = "This profile predicts your future with 99 percent accuracy.";
  await withResponse(output, async calls => {
    await assert.rejects(generateScripts(brief, research(), [source], knowledge), /unsupported factual claims/);
    assert.equal(calls.length, 2);
  }, { verification: { scripts: [{ scriptIndex: 0, verdict: "unsupported", unsupportedClaims: [{ field: "hook", claim: output.scripts[0].hook, reason: "No uploaded document establishes predictive accuracy." }], citationIssues: [] }] } });
});

test("verification fails closed on missing scripts and contradictory verdicts", async () => {
  await withResponse(rawScript(), () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /unknown source|failed validation \(scripts\.0\.sourceIds/), {
    verification: { scripts: [{ scriptIndex: 1, verdict: "supported", unsupportedClaims: [], citationIssues: [] }] },
  });
  await withResponse(rawScript(), () => assert.rejects(generateScripts(brief, research(), [source], knowledge), /unsupported factual claims/), {
    verification: { scripts: [{ scriptIndex: 0, verdict: "supported", unsupportedClaims: [], citationIssues: ["The quote does not support the claim."] }] },
  });
});

test("viral transcripts are withheld as factual inputs and genuine outcomes are performance context only", async () => {
  await withResponse(rawScript(), async calls => {
    await generateScripts(brief, research(), [{ ...source, transcript: "SOURCE ONLY CLAIM ABOUT A MIRACLE RESULT" }], knowledge, [{
      id: "outcome-1", scriptTitle: "Prior question experiment", url: source.url,
      publishedAt: "2026-10-19T00:00:00.000Z", snapshots: source.snapshots, notes: "The opening felt rushed to me.",
    }]);
    const firstRequest = JSON.parse(calls[0].body as string);
    assert.doesNotMatch(firstRequest.messages[1].content, /SOURCE ONLY CLAIM ABOUT A MIRACLE RESULT/);
    assert.match(firstRequest.messages[1].content, /performance observations ONLY/);
    assert.match(firstRequest.messages[1].content, /Prior question experiment/);
    assert.match(firstRequest.messages[1].content, /SOLE factual source/);
    const verifierRequest = JSON.parse(calls[1].body as string);
    assert.match(verifierRequest.messages[0].content, /independently enumerate factual claims/);
    assert.doesNotMatch(verifierRequest.messages[1].content, /Prior question experiment/);
  });
});
