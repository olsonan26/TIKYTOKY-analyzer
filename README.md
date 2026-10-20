# TIKY TOKY Analyzer

A video research and creation studio for any niche. Start with astrology or numerology, find current high performers, compare your own draft, and write original scripts from **your knowledge** using observed presentation patterns.

This is an original integration informed by five source audits. It does not merge their incomplete applications or copy their unlicensed implementation code. See the [feature checklist](docs/FEATURE_CHECKLIST.md) and [upstream findings](docs/research/).

**Open-source research is the primary pipeline.** Run the integrated [Python worker](worker/README.md) alongside the Vercel dashboard for Browser Use navigation, TikTok-Api metadata, local faster-whisper transcription, yt-dlp/FFmpeg media processing, and GPT Researcher/Crawl4AI/SearXNG investigation. Apify and Supadata are optional cloud fallbacks. See [verification status](docs/VERIFICATION.md) for tested behavior and remaining live-access limits.

## Run locally

Use Node.js 22 or newer.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill the server-side settings in .env.local.
npm run dev
```

Open [localhost:3000](http://localhost:3000). No seeded research, fake views, example knowledge or synthetic retention curves are loaded.

## Deploy to Vercel

Import [olsonan26/TIKYTOKY-analyzer](https://github.com/olsonan26/TIKYTOKY-analyzer) into Vercel. Choose **Next.js**, repository root, Node.js 22 or newer, install command `npm ci` and build command `npm run build`. `vercel.json` supplies the framework and commands.

Set these **server-side environment variables** before deployment:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter credential. Never use `NEXT_PUBLIC_` for a secret. |
| `OPENROUTER_MODEL` | Default: `deepseek/deepseek-v4.1-flash`, with text/image input. |
| `APP_PASSWORD` | Required in production; at least 16 characters. Protects provider access with a signed, expiring browser session. |
| `APIFY_API_TOKEN` | Optional cloud TikTok discovery fallback; not needed by the local worker. |
| `APIFY_TIKTOK_ACTOR` | Optional; defaults to `clockworks~tiktok-scraper`. |
| `APIFY_DOWNLOAD_VIDEOS` | Defaults to `true`; request provider-hosted footage for automatic visual study. Set `false` for metadata-only collection. Downloads consume provider budget. |
| `APIFY_MAX_CHARGE_USD` | Optional; default total provider cap is $1 for each new TikTok collection run. |
| `YOUTUBE_API_KEY` | Optional alternative discovery provider. |
| `SUPADATA_API_KEY` | Optional transcript retrieval from supported public video links. |

Deploy, open the URL, sign in, and check **Connections & setup**. “Configured” means a setting exists; test an operation to confirm credits, permissions and service availability. Changing variables requires redeployment. Production paid routes refuse requests until a valid password is configured. Provider keys are excluded from the repository and browser bundle.

The dashboard runs on Vercel; long-running open-source browsing, transcription and research run in the separate persistent Windows/WSL2 worker. The optional cloud study route bundles `ffmpeg-static`, bounds temporary storage, and deletes decoding files. Local uploads are sampled in the browser. Cloud study fetches supported provider footage (35 MB limit), decodes up to 12 actual timestamped frames (45-second decode limit), and sends images to AI. Missing, denied, oversized or expired media is reported. Vercel function durations require a compatible Fluid Compute plan; request bodies stay below the documented function payload limit.

The schedule is a posting plan to follow manually; this version does not publish to TikTok. Automatic unattended daily research is not included. Use **Refresh current research** for a new collection. Current plan/source references: [Vercel function limits](https://vercel.com/docs/functions/limitations), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

## The complete workflow

1. **Video research:** enter any niche, choose TikTok/YouTube and a 24-hour, 7-, 30-, 90- or 365-day window. Collect up to 100 results per query. Without a discovery credential, import public links, actual counters and transcripts. Refresh to merge new authentic observations.
2. **Evidence:** review each source. Fetch or paste its transcript; upload a local copy to inspect up to 12 frames, including 0–3 seconds. Metadata alone cannot establish a spoken hook or visual technique.
3. **Automatic content study:** use **Study top 5 & analyze** on selected results. It retrieves speech through Supadata when configured, downloads available TikTok/Apify footage, decodes real timestamped frames, and analyzes the enriched evidence. It processes at most five sources per action and reports retrieval failures; examples with no creative evidence are excluded. Native YouTube discovery does not supply downloadable footage, so those examples use transcript evidence or a local copy.
4. **Pattern library:** select up to 20 examples and analyze the opening, structure, curiosity, CTA and available visual evidence. Every report identifies source IDs and evidence limits.
5. **Your knowledge:** add TXT, Markdown, JSON, searchable PDF or DOCX, or paste a named note. Review extracted text. Limit: 2.5 MB per file, 50,000 characters per document, 20 documents and 100,000 total characters. Scanned PDFs need text/OCR supplied separately.
6. **Creator study:** choose general study lenses from Alex Hormozi, MrBeast, Zach King, Nick Grigolia, Maren Altman, May Like the Month and Moon Omens. Direct, concise teaching is the starting delivery; other lenses include visual reveals, curiosity/payoff, reflection and recurring series. These are research questions, not fabricated performance findings or a creator voice clone.
7. **Script studio:** choose audience, delivery, tone, duration and 1–5 variants. An offer/brand/CTA is optional. Viral examples supply mechanics; uploaded knowledge supplies substantive claims. Scripts include timed speech, overlays, scene directions, captions, hashtags, citations and a test plan. Exact quote checks and a separate AI claim review reject invalid or unsupported output.
8. **Improve my video:** keep your own draft separate. Supply the transcript or sampled visuals, then compare it against up to 10 selected benchmarks for prioritized edits, a revised opening and a prepublish checklist.
9. **Posting plan:** get seven windows in `America/Denver`, including Utah daylight-saving changes, and a sample-based length to test. Without adequate own data, timing and the initial duration are explicitly experiments.
10. **Your results:** enter the actual Utah publication date/time and observed counters. Repeated observations append history. Timing learns descriptive associations only after enough comparable 23–25 hour snapshots; the latest 20 own outcomes provide later script-generation context.

Projects and knowledge text are saved in this browser's local storage. Export a JSON backup for portability; script packages export to Markdown. There is no cross-device/cloud project sync. Backups contain your knowledge and should be handled accordingly. Raw locally uploaded video is not sent to this server; automatic visual study downloads available provider footage to temporary server storage; sampled images go to the configured AI provider on request. Knowledge file extraction is temporary server processing; selected extracted text goes to OpenRouter for generation and verification.

## What “no fabrication” means here

- Missing counters are `null`; literal zero remains zero. No old baseline is backfilled from today's counters.
- Recent growth requires two distinct actual observations. Lifetime average views/hour is labeled separately.
- The research score ranks this sample; it is not a calibrated virality probability.
- No actual competitor viewer-retention, acoustic emotion, waveform or completion data is invented.
- Creator focus cards are explicitly study lenses. A public profile and an offer do not prove why content went viral or how well it converted.
- All generated factual claims must be supported by the supplied knowledge; citations must quote a known document. The second AI pass fails closed on unsupported claims. These checks remain fallible: review the script and quotations before publishing. A citation verifies consistency with supplied material, not external or scientific truth.
- Invalid provider output is an error, never a successful fake result. Claims about “all most viral videos” and guaranteed fame/views are unsupported.

Your audience, niche, creative execution and platform distribution affect results. Neither a posting window nor a script guarantees virality.

## Verify changes

```powershell
npm test
npm run typecheck
npm run build
```

`npm run smoke:ai` is an **opt-in, billable** live OpenRouter check using explicit local software-validation text, with no fabricated market performance. It reads `.env.local`, never prints the key, and checks research → grounded script → independent verification. Automated tests mock provider calls; they do not prove live TikTok scraping. See [verification evidence](docs/VERIFICATION.md) for completed checks and limits.

Provider contracts and current official documentation: [OpenRouter structured outputs](https://openrouter.ai/docs/features/structured-outputs), [Apify TikTok scraper](https://apify.com/clockworks/tiktok-scraper), [YouTube search](https://developers.google.com/youtube/v3/docs/search/list), [Supadata transcript API](https://docs.supadata.ai/getting-started).
