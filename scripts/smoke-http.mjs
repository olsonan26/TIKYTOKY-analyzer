/** Production HTTP smoke: temporary password, no paid provider calls or saved user data. */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const port = 4207, base = `http://127.0.0.1:${port}`, password = randomBytes(24).toString("hex");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "production", APP_PASSWORD: password }, stdio: "ignore", windowsHide: true
});
async function post(path, body, cookie) {
  return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(base + "/api/status")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Production HTTP server did not start.");
  const status = await (await fetch(base + "/api/status")).json();
  assert.equal(status.authenticated, false); assert.equal(status.passwordRequired, true);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await post("/api/discover", {})).status, 401);
  assert.equal((await post("/api/session", { password: "wrong" })).status, 401);
  const login = await post("/api/session", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  assert.equal((await post("/api/scripts", {}, cookie)).status, 400);
  assert.equal((await post("/api/discover", {}, cookie)).status, 400);
  const planResponse = await post("/api/plan", { videos: [], outcomes: [] }, cookie);
  assert.equal(planResponse.status, 200);
  const plan = await planResponse.json();
  assert.equal(plan.timezone, "America/Denver"); assert.equal(plan.timingBasis, "experiment"); assert.equal(plan.schedule.length, 7);
  const form = new FormData();
  form.append("file", new File(["Explicit software-validation knowledge document. This is test-only text."], "validation.txt", { type: "text/plain" }));
  const knowledgeResponse = await fetch(base + "/api/knowledge", { method: "POST", headers: { Cookie: cookie, Origin: base }, body: form });
  assert.equal(knowledgeResponse.status, 200);
  assert.match((await knowledgeResponse.json()).document.text, /test-only text/);
  const crossOrigin = await fetch(base + "/api/plan", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://unrelated.example" }, body: JSON.stringify({ videos: [], outcomes: [] }) });
  assert.equal(crossOrigin.status, 403);
  let secret;
  try { secret = (await readFile(".env.local", "utf8")).split(/\r?\n/).find(line => line.startsWith("OPENROUTER_API_KEY="))?.slice("OPENROUTER_API_KEY=".length).trim(); } catch {}
  async function scan(directory) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) await scan(path);
      else if (secret) assert.ok(!(await readFile(path)).includes(Buffer.from(secret)), "A server secret appeared in the browser assets.");
    }
  }
  await scan(".next/static");
  console.log(JSON.stringify({ productionHttp: "passed", auth: "signed session enforced", validation: "passed", utahPlan: "passed", knowledgeUpload: "passed", originCheck: "passed", clientSecretScan: "passed", paidProviderCalls: 0 }));
} catch (error) { console.error(error instanceof Error ? error.message : "HTTP smoke failed."); process.exitCode = 1; }
finally { child.kill(); }
