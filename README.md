# TIKY TOKY Analyzer

A video research and creation studio for **any niche**. Find promising public videos, study the available evidence, improve your own draft, and write original scripts grounded in **your uploaded knowledge**.

The primary pipeline combines a Next.js dashboard with a persistent local Python worker: Browser Use, TikTok-Api, yt-dlp, FFmpeg, faster-whisper, GPT Researcher, and Crawl4AI. SearXNG is optional. Apify and Supadata are optional cloud alternatives; neither is required by the local pipeline. OpenRouter powers the AI operations and requires a funded key.

See the [feature checklist](docs/FEATURE_CHECKLIST.md), [verification record](docs/VERIFICATION.md), [worker guide](worker/README.md), and [source audits](docs/research/). This is an original integration; it does not merge the incomplete upstream applications or copy their unlicensed code.

## Start on Windows

Prerequisites: Node.js 22+, Python 3.12, [uv](https://docs.astral.sh/uv/getting-started/installation/), and FFmpeg/ffprobe available on PATH. Setup downloads Python dependencies and Chromium; the first transcription also downloads the selected Whisper model.

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env.local
# Set OPENROUTER_API_KEY in .env.local.
.\worker\setup.ps1
.\Start-TikyToky.ps1
```

If `.env.local` already exists, edit it instead of replacing it. Keep credentials out of Git.

The launcher starts the worker on `127.0.0.1:8765` and the dashboard at [localhost:4199](http://localhost:4199). It opens the dashboard and prints the worker pairing-file location. In **Autonomous research**, pair this browser using that local worker token. The token authorizes access to your worker; it is separate from your OpenRouter key.

Use `.\Start-TikyToky.ps1 -NoBrowser` to leave the browser closed. The launcher uses development mode by default. For a production-mode local dashboard, configure an `APP_PASSWORD` of at least 16 characters, run `npm run build`, then launch with `-Production`. Neither mode installs a background service.

For WSL2 setup, individual process commands, optional SearXNG, or troubleshooting, use the [worker guide](worker/README.md). Windows and WSL2 need their own virtual environments.

## Use the complete workflow

1. **Add your knowledge.** Upload TXT, Markdown, JSON, searchable PDF, or DOCX, or paste a named note. Review the extracted text. Limits: 2.5 MB per file, 50,000 characters per document, 20 documents, and 100,000 total characters. Scanned PDFs need text supplied separately.
2. **Prepare TikTok access.** Use **Open TikTok login** in Autonomous research when needed, sign in manually, then finish the login session before starting research. Browser Use, manual login, and the alternative Playwright MCP launcher share one exclusive persistent profile. No CAPTCHA solving or access-control bypass is included.
3. **Research your niche.** Enter any subject. Optional creator handles, hashtags, and direct video URLs narrow the search; you do not have to paste URLs. Browser Use investigates search, requested profiles/hashtags, and Creative Center. The local workflow collects up to 30 candidates and can study up to five videos per job. Its period choices are 1, 7, 30, or 90 days. Unknown dates and unavailable information remain explicit.
4. **Study actual evidence.** TikTok-Api attempts secondary metadata enrichment. Available public media is processed by yt-dlp, FFmpeg, and local faster-whisper; timestamped speech segments and real sampled frames supply creative evidence. GPT Researcher and Crawl4AI provide additional public-web investigation. Blocked pages, failed downloads, and unavailable dependencies produce partial results or errors.
5. **Compare patterns.** Review the collected sample and analyze up to 20 references. Reports cover the opening, story, curiosity, CTA, available visuals, and limitations. Metadata alone cannot establish spoken wording or editing technique. Seven creator-study lenses help frame questions; they do not claim measured success or clone a creator's voice.
6. **Create original scripts.** Choose the audience, tone, delivery, duration, and 1–5 variants. Brand, offer, and CTA preferences are optional. References supply presentation mechanics; your knowledge supplies substantive facts. Output includes timed spoken beats, shots, overlays, captions, citations, and a test plan. Exact quotation checks and a separate AI claim review reject invalid or unsupported output.
7. **Improve your own video.** In **Improve my video**, use **Upload to local worker** for a video up to 50 MB and three minutes. It extracts speech locally, preserves timestamped segments, and inspects sampled frames. The browser-only frame-inspection option samples up to 12 images and does not transcribe audio. Review the evidence, then compare the draft with up to 10 selected benchmarks for prioritized edits, a revised opening, and a prepublish checklist.
8. **Test and learn.** Follow seven suggested posting windows in `America/Denver` and an evidence-based or explicitly experimental duration range. Enter the actual Utah publication date/time and observed counters for your own posts. Repeated observations append real history; the latest 20 outcomes can guide later script experiments. This is observational feedback, not automatic model training.

Worker jobs and collected evidence persist locally. Completed research can be imported into dashboard projects. Projects, knowledge, and script packages live in this browser; export JSON for backup or Markdown for scripts. There is no cross-device project sync, unattended daily scheduler, or automatic TikTok publishing.

## What has actually been verified

The [verification record](docs/VERIFICATION.md) distinguishes automated tests, local processing, live provider checks, and remaining limits.

- Live OpenRouter analysis and knowledge-grounded script generation, including the separate claim verifier, were exercised with explicit software-validation material.
- Local speech transcription and frame processing were exercised. GPT Researcher and Crawl4AI were exercised against public software documentation.
- The bounded live Browser Use TikTok search launched the real browser, encountered an access restriction, and returned **zero videos**. The actual TikTok-Api public-detail request returned an empty response and supplied **no new metrics**. See [Browser Use evidence](docs/research/browser-public-smoke.json) and [TikTok-Api evidence](docs/research/tiktok-api-public-smoke.json).
- End-to-end public TikTok discovery, download, transcription, and script creation has therefore **not** been verified as a successful live workflow. Access may require manual login and can remain unavailable. The optional local SearXNG service was not verified operational in this environment.
- No production Vercel deployment, exhaustive viral-video search, guaranteed reach, or automatic publishing is claimed.

## Configure the dashboard and worker

The worker reuses the root `.env.local` OpenRouter settings and has its own template at [worker/.env.example](worker/.env.example). The two Python runtimes have separate locked dependencies because Browser Use and GPT Researcher require incompatible MCP versions.

| Setting | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Server/worker AI credential. Never use `NEXT_PUBLIC_` for a secret. |
| `OPENROUTER_MODEL` | Default: `deepseek/deepseek-v4.1-flash`. AI operations need provider availability and credits. |
| `APP_PASSWORD` | Required for a production dashboard; at least 16 characters. |
| `WORKER_ALLOWED_ORIGINS` | Exact dashboard origins allowed to use the local worker. Defaults cover local development. |
| `WORKER_TOKEN` | Optional worker token override; otherwise the worker creates a private local pairing token. |
| `WHISPER_MODEL` | Local speech model; default `base` with CPU/int8 settings. |
| `SEARXNG_URL` | Optional operator-run search service for additional web research. |
| `APIFY_API_TOKEN` | Optional cloud TikTok collection alternative. Its configurable default charge cap is $1 per collection run; this cap does not cover other providers. |
| `YOUTUBE_API_KEY` | Optional YouTube Data API discovery. |
| `SUPADATA_API_KEY` | Optional cloud transcript retrieval. |

Browser Use's installed DeepSeek adapter uses DOM evidence rather than browser screenshots. Separate direct OpenRouter image calls handle video frames. Configuration indicators report settings or installed software; only a successful operation confirms a working provider.

## Use Vercel with the local worker

Import [olsonan26/TIKYTOKY-analyzer](https://github.com/olsonan26/TIKYTOKY-analyzer) into Vercel as a Next.js project, repository root, Node.js 22+, `npm ci`, and `npm run build`. Set `OPENROUTER_API_KEY`, the optional model override, and `APP_PASSWORD` as server-side environment variables.

Vercel hosts the dashboard and its bounded API routes. Browser automation, persistent profiles, local transcription, and long-running research run in the separate Windows/WSL2 worker. Add the exact deployed dashboard origin to `WORKER_ALLOWED_ORIGINS`, restart the worker, and pair from the dashboard on the same computer. The browser may require local-network permission. Access from another device needs an operator-configured secure HTTPS worker endpoint; deploying the dashboard does not provide that endpoint.

Optional cloud discovery/study routes can operate without the worker when their providers are configured. Their account quotas, media availability, Vercel function limits, and billing still apply. Cloud video study bounds download size and decode time and removes temporary decoding files. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and the [worker guide](worker/README.md). A successful build is not evidence of a successful production deployment.

## Evidence, privacy, and costs

Missing counters remain `null`; literal zero stays zero. Recent growth requires two distinct real observations. A relative research score describes this sample, not a calibrated probability of virality. The app does not invent competitor retention curves, watch time, acoustic emotion, or completion rates.

Uploaded knowledge is the sole factual source for new scripts. Exact quotations establish that cited text is present, and a second AI pass checks support across the script. These fallible checks do not prove external or scientific truth; review the final claims and quotations before publishing. Reference videos, web research, briefs, and previous performance notes are not permission to add unsupported facts.

Browser projects and backups contain your knowledge. The worker stores job/history data and persistent browser cookies under its ignored local data directory. Draft uploads sent to the local worker are temporary and removed after processing. Browser-only inspection sends sampled images rather than the raw video to the dashboard. Selected text, knowledge, and frame images are sent to the configured AI provider for requested operations. Local speech recognition does not require a paid transcription service; AI calls and optional cloud services have their own costs.

No model, script, posting window, or feature guarantees virality.

## Verify changes

```powershell
npm test
npm run typecheck
npm run build
Push-Location worker
.\.venv\Scripts\python.exe -m unittest discover -s tests
Pop-Location
```

`npm run smoke:ai` is an opt-in, billable OpenRouter check. The worker public-browser smoke is also opt-in and may incur AI usage. Ordinary automated tests mock external providers where appropriate and do not certify live TikTok access. Consult the [verification record](docs/VERIFICATION.md) for dated results and scope.

This product includes software developed by UncleCode (https://x.com/unclecode) as part of the Crawl4AI project (https://github.com/unclecode/crawl4ai). See [third-party notices](docs/THIRD_PARTY.md) and the pinned [browser](docs/research/open-source-browser-stack.md), [media](docs/research/open-source-media-stack.md), and [research](docs/research/open-source-research-stack.md) audits.
