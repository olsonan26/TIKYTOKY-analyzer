import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ffmpeg from "ffmpeg-static";
import { approvedMediaUrl, downloadMedia, extractMediaFrames } from "../src/lib/media";
const execute = promisify(execFile);
test("automatic media requests only approved HTTPS CDN or Apify assets", () => {
  assert.equal(approvedMediaUrl("https://api.apify.com/v2/key-value-stores/abc123/records/video.mp4").hostname, "api.apify.com");
  assert.equal(approvedMediaUrl("https://v16.tiktokcdn.com/video.mp4?signature=example").search, "?signature=example");
  for (const url of ["http://localhost/video", "https://tiktokcdn.com.evil.example/video", "https://127.0.0.1/video", "https://api.apify.com/v2/users/me", "https://user:pass@v16.tiktokcdn.com/video", "https://v16.tiktokcdn.com:444/video"]) assert.throws(() => approvedMediaUrl(url));
});
test("media downloads are size-bounded without content-length and do not leak keys", async () => {
  const originalFetch = globalThis.fetch, old = process.env.APIFY_API_TOKEN;
  process.env.APIFY_API_TOKEN = "test-only-provider-token";
  try {
    let sent: HeadersInit | undefined;
    globalThis.fetch = async (_url, init) => { sent = init?.headers; return new Response(new Uint8Array(200), { headers: { "content-type": "video/mp4" } }); };
    assert.equal((await downloadMedia("https://v16.tiktokcdn.com/video.mp4")).length, 200);
    assert.equal((sent as Record<string, string>).Authorization, undefined);
    await downloadMedia("https://api.apify.com/v2/key-value-stores/id/records/video.mp4");
    assert.equal((sent as Record<string, string>).Authorization, "Bearer test-only-provider-token");
    globalThis.fetch = async () => new Response("", { headers: { "content-length": "35000001" } });
    await assert.rejects(() => downloadMedia("https://v16.tiktokcdn.com/video.mp4"), /35 MB/);
    globalThis.fetch = async () => { throw new Error("private-key-in-network-error"); };
    await assert.rejects(() => downloadMedia("https://v16.tiktokcdn.com/video.mp4"), error => error instanceof Error && !error.message.includes("private-key"));
  } finally { globalThis.fetch = originalFetch; if (old === undefined) delete process.env.APIFY_API_TOKEN; else process.env.APIFY_API_TOKEN = old; }
});
test("real FFmpeg decoding returns actual increasing frame timestamps and JPEGs", async () => {
  assert.ok(ffmpeg);
  const directory = await mkdtemp(join(tmpdir(), "tikytoky-media-test-"));
  try {
    const file = join(directory, "authored-test-clip.mp4");
    // Explicit generated test footage, not a viral example or a performance observation.
    await execute(ffmpeg, ["-hide_banner", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10", "-t", "5", "-c:v", "mpeg4", "-y", file], { timeout: 15000, windowsHide: true });
    const frames = await extractMediaFrames(await readFile(file), 5);
    assert.ok(frames.length >= 4 && frames.length <= 12);
    assert.equal(frames[0].seconds, 0);
    for (let index = 0; index < frames.length; index++) {
      assert.match(frames[index].image, /^data:image\/jpeg;base64,/);
      if (index) assert.ok(frames[index].seconds > frames[index - 1].seconds);
    }
  } finally {
    if (resolve(dirname(directory)) === resolve(tmpdir()) && basename(directory).startsWith("tikytoky-media-test-")) await rm(directory, { recursive: true, force: true });
  }
});
