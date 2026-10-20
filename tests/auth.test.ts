import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSession, validSession, passwordMatches, sameOrigin, readJson } from "../src/lib/auth";
test("signed sessions reject tampering, expiry and credential changes", () => {
  const old = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = "test-password-for-tests-only";
  try {
    const now = Date.now(), session = makeSession(now);
    assert.ok(validSession(session, now)); assert.ok(!validSession(session + "x", now));
    assert.ok(!validSession(session, now + 13 * 3600000)); assert.ok(passwordMatches("test-password-for-tests-only"));
    process.env.APP_PASSWORD = "another-password-for-tests"; assert.ok(!validSession(session, now));
  } finally { if (old === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = old; }
});
test("cross-origin requests cannot consume paid endpoints", () => {
  assert.throws(() => sameOrigin(new Request("https://example.com/api/scripts", { headers: { origin: "https://elsewhere.com" } })), /own page/);
});
test("same-origin checks accept Next normalized loopback URLs but reject forwarded-host spoofing", () => {
  assert.doesNotThrow(() => sameOrigin(new Request("http://localhost:4207/api/plan", { headers: { host: "127.0.0.1:4207", origin: "http://127.0.0.1:4207" } })));
  assert.throws(() => sameOrigin(new Request("https://example.com/api/plan", { headers: { host: "example.com", "x-forwarded-host": "unrelated.example", origin: "https://unrelated.example" } })), /own page/);
});
test("streaming body limits do not trust a missing content-length", async () => {
  const request = new Request("https://example.com", { method: "POST", body: JSON.stringify({ text: "a".repeat(2000) }), headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => readJson(request, 100), /too large/);
});
