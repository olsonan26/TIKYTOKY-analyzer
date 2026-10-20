import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorStudies, creativeDirections } from "../src/lib/creators";
import { briefSchema } from "../src/lib/validation";
test("all seven creator references are study lenses with a factual-source boundary", () => {
  assert.equal(creatorStudies.length, 7);
  assert.equal(new Set(creatorStudies.map(c => c.id)).size, 7);
  for (const c of creatorStudies) { assert.equal(new URL(c.url).protocol, "https:"); assert.equal(c.questions.length, 3); }
  const direction = creativeDirections("direct-teaching", ["alex-hormozi", "moon-omens"]);
  assert.match(direction, /short spoken sentences/); assert.match(direction, /not evidence of success/); assert.match(direction, /do not pretend/i);
  assert.match(direction, /Alex Hormozi/); assert.doesNotMatch(direction, /Zach King/);
});
test("any niche can use teaching direction without requiring a commercial offer", () => {
  const brief = briefSchema.parse({ subject: "Woodworking", audience: "New hobbyists", brand: "", offer: "", tone: "Clear", duration: 37, cta: "", count: 1, deliveryStyle: "direct-teaching", studyCreators: ["zach-king"] });
  assert.equal(brief.subject, "Woodworking"); assert.equal(brief.duration, 37);
  assert.throws(() => briefSchema.parse({ ...brief, studyCreators: ["invented-profile"] }));
});
