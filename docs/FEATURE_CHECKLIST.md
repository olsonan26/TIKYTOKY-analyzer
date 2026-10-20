# TIKY TOKY feature checklist

Source review: October 19, 2026. `IMPLEMENTED` means working code is present; it does not certify a live provider account or a deployed service. `REQUIRES_PROVIDER_CONFIGURATION` means the adapter exists but needs its server credentials, available credits/quota, and a successful live check. `NOT_IMPLEMENTED` identifies capabilities this version does not provide.

## Research and fresh performance data

| Status | Feature | Delivered behavior and limits |
| --- | --- | --- |
| IMPLEMENTED | Any subject or niche | Freeform subjects, separate research projects, and configurable audience/brand/offer/tone. Supports the user's astrology and numerology focus without restricting other niches or importing a built-in doctrine. |
| IMPLEMENTED | Time windows and manual refresh | Last 24 hours, 7, 30, 90, or 365 days; seven days is the initial window. **Refresh current research** starts a new search and merges returned observations. |
| REQUIRES_PROVIDER_CONFIGURATION | TikTok keyword discovery | Apify collects a bounded public-video search sample with source-reported counters. Searches request 3–100 items, use configured spending limits, and apply the exact requested posting-date cutoff. Requires `APIFY_API_TOKEN`; default Actor is `clockworks~tiktok-scraper`. Results may be fewer than requested. |
| REQUIRES_PROVIDER_CONFIGURATION | YouTube discovery | YouTube Data API keyword search plus video details/statistics and available channel subscriber counts. Requires `YOUTUBE_API_KEY`. Its short-duration filter means under four minutes, not verified Shorts classification. |
| IMPLEMENTED | Manual research import | Add links and known metadata, metrics, transcripts, on-screen text, or visual notes. Missing information remains unknown. Supports normalized provider-shaped JSON imports. |
| IMPLEMENTED | Observed counters and provenance | Stores source, original publication time, collection/fetch times, and timestamped metric snapshots. Re-reading one Apify dataset does not invent a fresh collection observation. |
| IMPLEMENTED | Cohort ranking and growth | Views, available engagement, average views/hour, available follower multiple, and growth between two distinct real observations. The cohort research signal is a relative heuristic. Average lifetime views/hour is separate from observed recent growth; unknown history gives unknown growth. Current engagement is `(likes + comments) / views` when both counts are known. |
| NOT_IMPLEMENTED | Automatic daily background research | Refresh is user-triggered. There is no saved daily job, unattended search scheduler, or automatic account monitoring. |
| NOT_IMPLEMENTED | Exhaustive worldwide viral census | No provider proves coverage of every public video or a globally complete ranking. The app reports the strongest videos found in its available sample. |

## Creative evidence and original scripts

| Status | Feature | Delivered behavior and limits |
| --- | --- | --- |
| IMPLEMENTED | Comparison and pattern library | Select up to 20 videos per analysis. Structured hook, story, curiosity, visual presentation, CTA, attention-risk commentary, opportunities, confidence, and linked source IDs. Evidence is identified as metadata, transcript, supplied visuals, or a combination. |
| IMPLEMENTED | Evidence limits | Titles/captions do not prove the spoken hook. Untimed transcripts do not prove exact timestamps. Sparse frames do not measure continuous motion or edit cadence. Analysis currently includes the first 2,000 transcript characters per source and discloses truncation. |
| REQUIRES_PROVIDER_CONFIGURATION | Public URL transcription | Optional Supadata transcript retrieval with synchronous or queued results; requires `SUPADATA_API_KEY`. Its auto mode can incur generated-transcription charges. Pasting a transcript works without that service. |
| REQUIRES_PROVIDER_CONFIGURATION | Automatic content study | **Study top 5 & analyze** enriches up to five selected examples: retrieves actual transcript when configured, downloads available TikTok/Apify footage, decodes up to 12 frames with actual video timestamps, and analyzes the acquired evidence. Missing/expired/blocked/oversized media and unfinished speech jobs are reported; sources with no creative evidence are excluded. Requires downloadable provider footage, AI configuration, and optional Supadata. Footage is capped at 35 MB and decoding at 45 seconds, with temporary-file cleanup. Native YouTube discovery does not supply footage URLs. |
| REQUIRES_PROVIDER_CONFIGURATION | Local video frame inspection | Browser samples up to 12 frames, including the opening seconds, and sends those images to the configured AI service. Readable overlay text and visual notes are retained; frame image bytes are excluded from saved projects and exports. Requires an image-capable configured model. |
| IMPLEMENTED | Own draft review | A separate draft workspace compares supplied transcript/visual evidence with up to 10 references. Produces prioritized edits, a revised opening, suggested cuts, a prepublish checklist, limitations, and a test hypothesis. New factual script content requires the knowledge-backed script workflow. |
| REQUIRES_PROVIDER_CONFIGURATION | OpenRouter / DeepSeek 4.1 | Server-side OpenRouter integration for analysis, scripts, verification, coaching, and images. Default model identifier: `deepseek/deepseek-v4.1-flash`; configurable using `OPENROUTER_MODEL`. Requires `OPENROUTER_API_KEY`, provider availability, and credits. |
| IMPLEMENTED | Creator study and delivery | Seven user-selected creator lenses: Alex Hormozi, MrBeast, Zach King, Nick Grigolia, Maren Altman, May Like the Month, and Moon Omens. Direct concise teaching, story/payoff, or reflective delivery; selected questions guide original mechanics without adding facts, copying a persona, inventing predictions, or claiming unmeasured success. Each card links a public reference and identifies evidence limits. |
| IMPLEMENTED | Original script packages | Generate 1–5 scripts, 10–180 seconds each: original hook, timed spoken beats, scene/shot directions, on-screen copy, CTA, caption, hashtags, supporting reference mechanics, knowledge citations, and a practical test plan. Viral examples supply abstract mechanics; uploaded knowledge supplies factual content. |
| IMPLEMENTED | Output checks | Validates response shape, known source IDs/patterns, timing, exact knowledge quotations, and excessive transcript phrase overlap. Invalid or unsupported results are rejected rather than saved as successful output. These checks and AI review are fallible. |
| NOT_IMPLEMENTED | Acoustic measurements or actual retention curves | No waveform/BPM/pitch/vocal-emotion measurement, actual competitor watch-time curve, or calibrated second-by-second retention heatmap. Attention-risk text is a hypothesis, not audience measurement. |
| NOT_IMPLEMENTED | Guaranteed virality or fame | No score, hook, model, video length, or posting slot guarantees performance. Sample patterns describe associations and testable ideas. |

## Your specific knowledge as the factual source

| Status | Feature | Delivered behavior and limits |
| --- | --- | --- |
| IMPLEMENTED | Knowledge library | Upload TXT, Markdown, JSON, searchable PDF, or DOCX; or paste a named note. Review extracted text and remove documents. No example knowledge or private material is preloaded. |
| IMPLEMENTED | Safe, bounded extraction | One file per upload; 2.5 MB file / 3 MB request / 50,000 extracted characters. UTF-8 text and JSON structure preserved; PDF text and DOCX paragraphs extracted. Empty, malformed, oversized, encrypted/unreadable, or scanned PDFs without text are rejected. DOCX archive expansion, XML entities, nesting, and structure are bounded. |
| IMPLEMENTED | Factual-source separation | Generation instructions restrict substantive factual claims to uploaded knowledge. Creator videos, briefs, and previous post notes are not factual sources. Every script requires document-ID quotations and an explanation of what they support. |
| IMPLEMENTED | Citation and claim verifier | Checks that quotations occur in the supplied document, then performs a separate AI review of factual claims across the entire script. Unsupported or ambiguous claims cause rejection. This verifies consistency with supplied material; it does not independently establish that astrology, numerology, or other source claims are scientifically true. Human review remains necessary. |
| IMPLEMENTED | Knowledge context limits | At least one knowledge document is required for generation; at most 20 documents and 100,000 combined characters per request. |
| NOT_IMPLEMENTED | Scanned-page OCR or a full document search engine | Upload extraction does not perform document OCR, run a vector database, or silently supplement missing factual knowledge from the web. |

## Posting experiments and real feedback

| Status | Feature | Delivered behavior and limits |
| --- | --- | --- |
| IMPLEMENTED | Utah posting plan | Seven upcoming suggested windows in IANA `America/Denver`, with MDT/MST daylight-saving conversion. Without enough own data, times are explicitly experiments. Observational timing requires at least 12 unique posts with comparable 23–25 hour observations and two eligible posting hours containing at least three posts each. |
| IMPLEMENTED | Duration recommendation | Uses measured lengths from the stronger reference sample when at least three usable examples exist; otherwise starts with an explicitly experimental 20–40 second range. The suggested duration can populate the creative brief. It is not a measured optimum. |
| IMPLEMENTED | Own outcome log and feedback | Record published links, script names, actual publication times, metric snapshots, and notes. Supplied outcomes inform later script experiments and eligible timing comparisons; missing baselines are never backfilled as historical facts. This is saved observational feedback, not automatic model training. |
| NOT_IMPLEMENTED | Automatic publishing or TikTok scheduling | Posting windows are a plan to follow manually. This version does not upload, publish, or schedule videos inside TikTok or another social account. |

## Delivery, storage, privacy, and verification

| Status | Feature | Delivered behavior and limits |
| --- | --- | --- |
| IMPLEMENTED | Browser workspace and exports | Multiple locally saved projects; JSON backup/restore; Markdown script download and copy. Restore validates saved data and creates a separate project. Browser storage can fill or be cleared; it does not sync across devices. |
| IMPLEMENTED | Authentication and secret handling | Production requires a server password of at least 16 characters, signed expiring sessions, origin checks, validated bodies, and server-only provider credentials. No provider secrets are entered in the browser setup UI. |
| IMPLEMENTED | Privacy and costs | Knowledge extraction temporarily processes files on this server without file persistence. Automatic visual study temporarily downloads provider footage and deletes its decoding directory afterward. Selected knowledge/text and sampled images are sent to the configured AI provider for requested operations. Project backups include knowledge text. TikTok's default total provider cap is $1 per new run, configurable on the server; optional services have their own billing/quota. |
| IMPLEMENTED | Capability status | Setup reports which server credential settings are present. A “Connected” configuration indicator alone is not proof of a working, funded provider request. |
| IMPLEMENTED | Vercel-ready source and GitHub target | Next.js application, build scripts, environment template, and `vercel.json`; Git origin points to [olsonan26/TIKYTOKY-analyzer](https://github.com/olsonan26/TIKYTOKY-analyzer). Publication and deployment URLs must be verified separately at delivery. |
| NOT_IMPLEMENTED | Production deployment certification | Source/build readiness does not establish a deployed Vercel service, funded discovery accounts, or a successful end-to-end production workflow. |

Local verification includes automated provider-contract tests using mocked HTTP, ranking/history tests, AI guardrail tests, Utah daylight-saving tests, authentication tests, and real generated PDF/DOCX extraction tests. These checks do not certify live TikTok scraping, YouTube data access, Supadata availability, or real OpenRouter generation. Record successful live checks separately with their date and scope.

The static reviews of the five upstream repositories are preserved in [docs/research](research/); upstream databases, temporary media, and full third-party repositories are excluded from this deliverable.
