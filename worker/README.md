# Integrated local research worker

The Vercel dashboard connects directly to this worker on the same computer. Browser Use discovers videos; TikTok-Api checks available public metadata; yt-dlp/FFmpeg/faster-whisper inspect accessible media; GPT Researcher coordinates a source-bounded investigation, with Crawl4AI and an optional operator-hosted SearXNG instance supplying supporting pages. Apify and Supadata remain optional dashboard fallbacks.

## Windows setup

Install Node.js 22+, Python 3.12, uv, and FFmpeg/FFprobe. From the repository root:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Add your OpenRouter key to .env.local; never commit it.
Copy-Item worker/.env.example worker/.env
./worker/setup.ps1
Set-Location worker
./.venv/Scripts/python.exe -m tikytoky serve
```

In another terminal, run `npm run dev` from the repository root. Open **Autonomous research**, connect to `http://127.0.0.1:8765`, and paste the local pairing token from `worker/.data/worker-token.txt`. This is a private worker access token, not a paid cloud API key. The token is kept in the dashboard tab's session storage. Research jobs and actual metric history persist in local SQLite; raw temporary media is cleaned up.

If TikTok requires a login, stop jobs and run `./.venv/Scripts/python.exe -m tikytoky login` from `worker`. Complete login yourself in the isolated persistent browser, then press Enter in the terminal. Challenges and denied access are reported, never bypassed. `python -m tikytoky mcp` starts the pinned Microsoft Playwright MCP alternative under the same exclusive profile lock; it cannot compete with Browser Use for that session.

## WSL2 / Linux

Run `bash worker/setup.sh` from the root, then `cd worker && .venv/bin/python -m tikytoky serve`. Install the system browser libraries requested by Playwright when needed. Use the matching Linux environment for all worker commands; Windows and Linux virtual environments are not interchangeable.

## Vercel connection

Set `WORKER_ALLOWED_ORIGINS` in `worker/.env` to your exact dashboard origin, for example `https://your-project.vercel.app`. Restart the worker. The browser may request local-network permission. The default worker listens only on loopback. Access from another computer needs an operator-configured secure HTTPS endpoint; do not expose an unauthenticated worker. The Vercel dashboard needs its own server-side OpenRouter settings and `APP_PASSWORD` of at least 16 characters.

## Isolated research runtime

Browser Use requires MCP 2.x while GPT Researcher requires MCP 1.x. Setup creates `worker/.venv` and `worker/research-runtime/.venv`, each pinned by its own `uv.lock`. The worker launches research as a bounded subprocess and exchanges JSON evidence, not separate user applications. No OpenAI key is required. An unavailable research stage preserves the actual collected videos and reports its limitation.

SearXNG is additional search infrastructure, not a mandatory paid API. See [searxng/README.md](searxng/README.md). Without it, video discovery and source-bounded comparison still operate; broader search coverage is explicitly limited.

Dependencies, profiles, model weights, local knowledge, SQLite history and credentials are excluded from Git. See [verification](../docs/VERIFICATION.md) for actual live results and unresolved host/platform limits.

This product includes software developed by UncleCode (https://x.com/unclecode) as part of the Crawl4AI project (https://github.com/unclecode/crawl4ai).
