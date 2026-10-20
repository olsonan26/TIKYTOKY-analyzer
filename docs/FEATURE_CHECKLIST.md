# TIKY TOKY feature checklist

Reviewed October 20, 2026. **Implemented** means code is present. **Locally checked** identifies actual local checks. **Live limited** means a real provider or platform was exercised but the stated limitation remains. Neither implementation nor passing tests certifies production access.

## Integrated dashboard and local worker

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Dashboard plus persistent worker | Next.js dashboard with authenticated local Python job API, progress, cancellation, persistent SQLite jobs/history, and result import. | Local operation and automated checks are recorded in [VERIFICATION.md](VERIFICATION.md). Vercel hosts the dashboard; the worker runs separately. |
| One-command Windows launch | After dependency/configuration setup, `Start-TikyToky.ps1` starts worker and dashboard at localhost:4199. Default is development mode; `-Production` requires a build and production password. | No installed background service or unattended scheduler. |
| Isolated research runtime | Main Browser Use/media runtime and GPT Researcher/Crawl4AI runtime have separate virtual environments and locks. | Required by incompatible MCP dependency versions; not a single combined Python environment. |
| Private pairing | Worker token, allowed-origin checks, bounded request bodies, and dashboard production sessions protect operations. | Production dashboard requires `APP_PASSWORD` of at least 16 characters. Worker pairing token is separate from provider credentials. |
| Manual TikTok login | Dashboard button opens the dedicated persistent profile for human sign-in and closes it before research. | Browser Use, manual login, and the alternative Playwright MCP launcher share an exclusive profile lease. No competing controllers, CAPTCHA solving, or access-control bypass. |

## Finding and ranking videos

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Any niche | Freeform subject, optional creators/hashtags, audience, delivery, tone, brand, and offer. | Astrology/numerology are defaults or examples, not a restricted domain or preloaded factual doctrine. |
| Primary Browser Use discovery | Actual Browser Use navigation investigates TikTok search, requested profiles/hashtags, and Creative Center, with bounded creator follow-up. Model-returned URLs must also have been observed in page evidence. | **Live verified in a bounded sample:** retry collected two dated astrology videos with actual counters; queued numerology discovery collected one. Access can vary and login may be required. |
| Optional direct video URLs | Users can supply public URLs alongside or instead of open-ended discovery. | URLs are optional; supplied links can still be blocked or unavailable. |
| Actual TikTok-Api enrichment | Uses the installed library's real session/request methods in a separate plain browser context, preserving provenance and existing evidence. | **Live limited:** actual public-detail request returned an empty response; no new counters were fabricated. No added stealth patches, proxies, replayed tokens, or challenge bypass. |
| Bounded local research | Up to 30 candidates and five media studies per job; 1-, 7-, 30-, or 90-day period. Up to three requested creators and three hashtags. | Available results can be fewer. Unknown dates are not silently promoted to verified recent posts. |
| Optional cloud alternatives | Apify TikTok discovery, YouTube Data API discovery, and Supadata transcripts remain available when configured. | Apify/Supadata/paid search are not mandatory for the local pipeline. OpenRouter AI still needs a funded key. Optional provider accounts have separate quotas and costs. |
| Real counters and history | Stores source metadata, publication/fetch/collection times, and timestamped metric snapshots. Missing counters stay unknown; zero stays zero. | Re-reading a dataset does not create a new historical collection. No synthetic backfilled baseline. |
| Sample ranking and growth | Relative cohort score, available engagement/follower context, lifetime average views/hour, and recent growth between distinct real observations. | No calibrated virality probability, exhaustive worldwide ranking, causal attribution, or automatic daily monitoring. |

## Actual media and deeper research

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Public-media study | yt-dlp downloads available footage; FFmpeg obtains media facts and real timestamped frames; faster-whisper extracts speech locally. | Local media processing was checked. Successful end-to-end TikTok download/study was not established; public platform restrictions are reported. |
| Timestamped local speech | Actual faster-whisper transcript with timed speech segments retained for review and evidence. | Actual local recorded-speech processing was exercised. Model weights download on first use; accuracy varies. No paid transcription service required. |
| Own video upload | **Improve my video → Upload to local worker** accepts up to 50 MB and three minutes, extracts speech, and studies frames. | Requires a paired running worker. Temporary uploaded file is removed after processing. |
| Browser-only inspection | Samples up to 12 frames, including the opening, for image-capable AI inspection. | Does not transcribe audio. Frame bytes are not saved into dashboard project exports. |
| Separate image analysis | Direct OpenRouter frame calls produce available visual notes and readable overlay text. | Browser Use's installed DeepSeek adapter is DOM-only; frame vision uses a separate direct provider call. Sparse frames do not measure continuous edit cadence. |
| GPT Researcher | Real GPT Researcher investigation runs in the separate research runtime. | A real public software-documentation smoke passed. This does not verify unrestricted TikTok investigation or every niche/source. |
| Crawl4AI | Real public-page crawling supplies additional source evidence for research. | A real public software-documentation smoke passed. Pages can still block or fail. Third-party attribution is included. |
| Optional SearXNG | Supports an operator-run search endpoint. | The optional local SearXNG service was not verified operational in this environment. No paid search provider is mandatory. |
| Partial-result reporting | Blocked navigation, empty metadata, missing media, unavailable research services, and decoding/transcription failures are surfaced. | Missing evidence does not become a successful fake result. |

## Analysis, knowledge, and original scripts

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Reference comparison | Up to 20 videos per analysis: opening, story, curiosity, CTA, visual presentation, opportunities, confidence, and cited source IDs. | Evidence level follows supplied metadata/transcript/visuals. Captions do not prove spoken hooks; untimed transcripts do not prove precise timing. Transcript context is bounded and truncation disclosed. |
| Knowledge library | TXT, Markdown, JSON, searchable PDF, DOCX, and named pasted notes; extracted text is reviewable. | 2.5 MB/file, 50,000 characters/document, 20 documents, 100,000 combined characters. Scanned-page OCR and a vector search service are not included. |
| Sole factual source | At least one nonempty knowledge document is required for generation. Viral examples supply mechanics, while uploaded knowledge supplies substantive claims. | Briefs, web research, creator references, and own outcome notes are not additional factual sources for generated scripts. |
| Exact citations and independent claim review | Each script needs known document IDs and quotations present in the source. A second AI call checks factual support across hook, speech, overlays, caption, and CTA. | Invalid or unsupported claims fail closed. Model-based review remains fallible and does not prove the supplied material is externally/scientifically true. |
| Original script packages | 1–5 variants, 10–180 seconds: hook, timed beats, scene directions, overlays, CTA, caption, hashtags, cited mechanics/knowledge, and test plan. | Shape, known source IDs, timing, exact quotations, and excessive source-transcript overlap are checked. No creator voice clone or guaranteed performance. |
| Creator-study lenses | Alex Hormozi, MrBeast, Zach King, Nick Grigolia, Maren Altman, May Like the Month, and Moon Omens guide research questions and delivery choices. | Cards do not establish measured performance, conversion, or the cause of virality. |
| Own-draft coaching | Separate draft compared with up to 10 benchmarks; prioritized edits/cuts, revised hook, strengths, checklist, hypothesis, and uncertainty. | Revised hook rephrases draft-backed claims. New factual script content belongs in the knowledge-grounded generation workflow. |
| Stale-result protection | Changed project/knowledge/brief state prevents late AI results from replacing newer work; manual transcript edits are guarded. | Reviewed in [REVIEW.md](REVIEW.md). |
| AI provider | Server-only OpenRouter; default `deepseek/deepseek-v4.1-flash`. | Live analysis, grounded script generation, and separate verification passed with explicit software-validation text. Model availability, credits, and input limits still apply. |
| Attention and retention | Qualitative attention-risk hypotheses tied to available evidence. | No actual competitor retention curve, waveform/pitch/emotion measurement, calibrated retention heatmap, or guaranteed virality. |

## Posting experiments and feedback

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Utah posting plan | Seven upcoming suggested windows in `America/Denver` with MDT/MST conversion. | Explicit experiments until enough comparable own-post observations exist. No scientifically established universal best time. |
| Observational timing | Requires at least 12 unique own posts with comparable 23–25 hour observations, with at least three posts in each of two eligible posting hours. | Descriptive associations; not controlled causal proof or promised lift. Actual Utah publication date/time is recorded and nonexistent DST times are rejected. |
| Duration suggestion | Uses stronger references when at least three usable measured lengths exist; otherwise an experimental 20–40 second starting range. | Not an optimal-duration guarantee. |
| Own outcomes | Actual links, script names, publication times, counters, repeated observations, and notes. Latest 20 outcomes can inform later script experiments. | No fabricated improvement rates, backfilled history, or automatic model training. |
| Publishing | Script and posting plan are ready for manual use. | Automatic social publishing, TikTok scheduling, and unattended daily research are not implemented. |

## Storage, delivery, and live status

| Feature | Delivered behavior | Verification and limits |
| --- | --- | --- |
| Projects and exports | Browser-local projects, knowledge, JSON backup/restore, and Markdown script export; worker jobs/history stored locally. | No cross-device/cloud project sync. Backups contain uploaded knowledge. |
| Credentials and privacy | Provider keys remain server/worker-side. Worker profile/cookies/data and local secrets are ignored by Git. Local uploads are temporary. | Selected text, knowledge, and sampled images go to the configured AI provider on request. Local processing does not mean every stage is offline or free. |
| Optional provider budget | Apify collection has a configurable default $1 cap per collection run. | Applies only to that optional provider operation; not a global OpenRouter/research/transcription budget. |
| Vercel-ready dashboard | Build configuration, environment examples, authentication, and bounded dashboard routes are present. | Persistent worker runs separately. Hosted dashboard access to a local worker needs exact allowed origin and possible browser local-network permission. Other devices need an operator-provided secure worker endpoint. |
| GitHub source | Target repository is [olsonan26/TIKYTOKY-analyzer](https://github.com/olsonan26/TIKYTOKY-analyzer). | Commit/push status must be checked at delivery. Source readiness is not production deployment certification. |
| Real TikTok end-to-end result | Actual browser and library probes are preserved as evidence. | Primary browser discovery and page counters passed; secondary API remained empty. Public media downloads were unavailable/403, so the full public-media chain remains unverified. Production is deployed; login, protected APIs and browser-to-worker pairing passed. |

See [VERIFICATION.md](VERIFICATION.md) for dated checks, [REVIEW.md](REVIEW.md) for bounded integration review, [browser source audit](research/open-source-browser-stack.md), [media source audit](research/open-source-media-stack.md), [research source audit](research/open-source-research-stack.md), and [third-party notices](THIRD_PARTY.md). Automated provider mocks, local fixture tests, actual software-documentation research, and real platform results are distinct evidence categories.
