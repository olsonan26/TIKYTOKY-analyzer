# Metrics and subject discovery audit

Audited 2026-10-19. Static source inspection only: no upstream package installation, upstream execution, credentials, paid API calls, or provider accuracy test.

## Result

The combined product is feasible as a **bounded research sample**: discover public videos matching a subject, rank the returned sample using available counters, inspect evidence, compare patterns, and write original scripts. No reviewed provider establishes a complete census of every video or proves that the returned videos are the globally most viral. The product should say **Top performers found**, show the query, filters, source, sample size, and collection time, and distinguish observed counters from inferred creative advice.

## Repository 5: jcrowe85/tiktok-analytics

Pinned source: [`d0afad7bdbc333b27dcc1d686eaeba1363aa0b44`](https://github.com/jcrowe85/tiktok-analytics/tree/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44). Local reference clone is unchanged. Do not distribute the clone's database backups, temporary audio, images, or archives with the new application.

| Capability | Source evidence and verdict |
| --- | --- |
| Authorized account metrics | OAuth requests `user.info.basic` and `video.list` in [tiktokAuth.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/routes/tiktokAuth.ts#L14). [tiktokClient.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/tiktokClient.ts#L109-L209) paginates the user's videos and requests ID, timestamp, duration, description, views, likes, comments, shares, thumbnail, embed, and share links. This is not public keyword discovery. |
| Engagement rates and hashtags | [kpis.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/kpis.ts#L6-L43) extracts caption hashtags and computes interactions divided by views; zero views produces zero. It does not measure watch time or retention. |
| 24/48 hour velocity | [kpis.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/kpis.ts#L48-L88) picks the newest snapshot at least 24/48 hours old and divides delta views by the actual elapsed hours. These may span more than 24/48 hours; they require historical observations. [scheduler.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/scheduler.ts#L23-L56) fetches counters before appending file snapshots; its daily schedule is [09:00 cron](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/scheduler.ts#L96-L122). |
| Database snapshots | [snapshotService.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/services/snapshotService.ts#L33-L79) copies the database's current counters into one UTC date row, updating that row on a same-day repeat. This function itself does not refresh provider counters. Calling it on stale database values preserves stale counters. |
| Missing-history defect | [calculateMetricGrowth](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/services/snapshotService.ts#L160-L182) turns a missing comparison into zero and can report 100% growth. [backfillInitialSnapshot](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/services/snapshotService.ts#L211-L249) places current counters under yesterday's date. This creates a fabricated historical baseline; do not port either behavior. |
| Media/AI pipeline | [pipeline.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/ai/pipeline.ts#L88-L171) acquires media, extracts audio/frames, calls transcription, optionally OCR, and GPT content critique. [openai.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/ai/openai.ts#L13-L65) requests Whisper segment timestamps. However, the main result stores transcript text and frame timestamps rather than the segment array. |
| Hardcoded visual scores | [analyzeKeyframes](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/ai/pipeline.ts#L195-L230) ignores its frames and returns fixed visual scores and classifications, including architecture/cathedral. These are dummy data; no video-specific retention, motion, or emotion result can be trusted from this path. |
| Account-specific assumptions | [tiktokClient.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/tiktokClient.ts#L22-L48) hardcodes an upstream account username and fallback display name. [pipeline.ts](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/src/backend/ai/pipeline.ts#L133-L142) passes zero performance counts to creative analysis. Do not inherit these assumptions. |
| License | [README lines 481-483](https://github.com/jcrowe85/tiktok-analytics/blob/d0afad7bdbc333b27dcc1d686eaeba1363aa0b44/README.md#L481-L483) says MIT. The tracked tree has no LICENSE, COPYING, or NOTICE file and package.json has no license field. Record this as a README-only MIT declaration with full license text absent. The new application can independently implement the general ideas and cite the source. |

Takeaways to combine: timestamped observations, engagement calculations, and the account feedback loop. Reimplement them with explicit missing data and provenance. Do not transplant the dummy scores or backdated snapshots.

## First-party TikTok interfaces

### Display API: connected-account feedback

`POST https://open.tiktokapis.com/v2/video/list/` lists the authorizing user's public videos, newest first; `video.list` and a user access token are required. Pagination has at most 20 results per page. It is an account connection, not arbitrary subject search. [TikTok List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).

`POST /v2/video/query/` accepts up to 20 video IDs and verifies that they belong to the authorizing user. This cannot be used as a public competitor-video lookup. [TikTok Query Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query).

The documented video fields include duration, description, image/share/embed links, and like/comment/share/view counters. They contain no per-second retention, average watch time, or completion curve. A missing metric must remain missing. [TikTok Video Object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object).

### Research API: restricted research access

The Research API has public-video keyword, hashtag, username, and other query filters, with fields including descriptions, public counters, duration, and voice-to-text. This is a different API and scope (`research.data.basic`). [Research Query Videos](https://developers.tiktok.com/docs/en/research-api-specs-query-videos).

Access requires an eligible research affiliation, approved proposal, ethical review, and independence from commercial interests. It is not an ordinary commercial marketing search backend. [Research Tools eligibility](https://developers.tiktok.com/products/research-api/).

Even approved access is not real-time universal coverage: TikTok says newly posted videos can take up to 48 hours to enter its search and statistics can lag up to 10 days. [Research API FAQ](https://developers.tiktok.com/docs/en/research-api-faq).

## Practical commercial subject discovery: Apify

An optional adapter can call the maintained `clockworks/tiktok-scraper` Actor using the user's own Apify token and account budget. This is a third-party data provider, not TikTok's official API. Its published output supports captions, links, posting timestamps, views, likes, shares, comments, author metadata, duration, hashtags, and optional media/subtitles. Provider availability and field completeness must be checked on each run. [Actor documentation and output examples](https://apify.com/clockworks/tiktok-scraper).

Minimal bounded input:

```json
{
  "searchQueries": ["chosen subject"],
  "searchSection": "/video",
  "resultsPerPage": 50,
  "shouldDownloadVideos": false,
  "downloadSubtitlesOptions": "NEVER_DOWNLOAD_SUBTITLES",
  "shouldDownloadCovers": false,
  "shouldDownloadAvatars": false
}
```

The input schema permits `MOST_RELEVANT`, `MOST_LIKED`, or `LATEST` video sorting and named date ranges. Sorting/date filters are marked charged options and work with `/video`. Search results are not an exhaustive census. Avoid silently enabling optional paid filters. [Actor input schema](https://apify.com/clockworks/tiktok-scraper/input-schema).

Recommended async sequence (server-side token in Authorization header):

1. `POST https://api.apify.com/v2/actors/clockworks~tiktok-scraper/runs?timeout=120&maxTotalChargeUsd=<explicit-run-cap>` with the input JSON. Save the returned run ID immediately. [Run Actor](https://docs.apify.com/api/v2/actors-runs-post).
2. Poll `GET /v2/actor-runs/{runId}` with bounded backoff; persist provider failures and run status. [Get run](https://docs.apify.com/api/v2/actor-run-get).
3. After success, read `GET /v2/datasets/{defaultDatasetId}/items?format=json&clean=true&limit=50`. A dataset limit only caps the returned output. [Dataset items](https://docs.apify.com/api/v2/dataset-items-get).

The synchronous alternative is `/v2/actors/{actorId}/run-sync-get-dataset-items`. It can time out after 300 seconds or lose the connection while a run continues. The documented `maxTotalChargeUsd` is the total cost cap across pricing models; `maxItems` is a pay-per-result billing cap and does not guarantee output length. Use a server-side total-cost cap and actor timeout, plus an input result count and local output limit. [Synchronous execution and cost parameters](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post).

No fixed price is assumed: the Actor has chargeable features, pricing can change, and the account's plan/credits determine available usage. The current price and optional-event charges belong in setup instructions linked to the provider's pricing, not in a guaranteed application estimate. No paid request was made in this audit.

Normalize only validated fields:

| Internal field | Actor field |
| --- | --- |
| platform ID, permalink | `id`, `webVideoUrl` |
| caption, published time | `text`, `createTimeISO` or validated `createTime` |
| observed views, likes, shares, comments, saves | `playCount`, `diggCount`, `shareCount`, `commentCount`, `collectCount` |
| creator and followers | `authorMeta.name`, `authorMeta.fans` |
| duration, thumbnail | `videoMeta.duration`, `videoMeta.coverUrl` |
| tags | `hashtags[].name` |

Store `observedAt` separately from `publishedAt`. A caption is not a speech transcript, a thumbnail is not a full-video inspection, and missing counts are not zeros. Fields above follow the provider's published examples; real provider execution remains unverified.

## YouTube fallback / additional platform

Use public `search.list` with `part=snippet`, `type=video`, `q=<subject>`, `order=viewCount`, bounded `maxResults` and optional `publishedAfter`. Follow `nextPageToken`; the endpoint itself warns that ordering/date combinations can return incomplete samples. `videoDuration=short` means less than four minutes, not a guaranteed YouTube Short. Label that filter accurately. Require an enabled API project and key; read the project's current quota rather than assume an allocation. [YouTube search.list](https://developers.google.com/youtube/v3/docs/search/list).

Then fetch selected IDs using `videos.list` with `part=snippet,contentDetails,statistics` to obtain content metadata and available counts. Public counters include views, likes, and comments; shares and audience-retention curves are not public video statistics. Keep platform rankings separate or clearly normalize them. [YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [Video statistics schema](https://developers.google.com/youtube/v3/docs/videos#statistics).

## Optional transcript retrieval: Supadata

The optional adapter uses `GET https://api.supadata.ai/v1/transcript?url=...&text=true&mode=auto` with a server-side `x-api-key` header. It accepts actual content or a queued job ID and polls `GET /transcript/{jobId}` once per user poll. Native captions may fall back to paid generated transcription in auto mode. Empty or failed output is an error; a caption never substitutes for speech. No provider credential or billable request was used in the audit. [Transcript endpoint](https://docs.supadata.ai/api-reference/endpoint/transcript/transcript), [Transcript result](https://docs.supadata.ai/api-reference/endpoint/transcript/transcript-get).

## Implemented adapter verification

The new application independently implements bounded async TikTok discovery, YouTube search/detail/channel hydration, and optional Supadata transcription. The TikTok adapter fixes its exact date cutoff in an opaque job token, requests a supported broader provider period, then filters dates locally. It uses a total-cost cap, disables media/AI/transcription add-ons, and keeps collection-run observation times stable across repeated dataset polls. The configured MOST_LIKED/date search options are chargeable and disclosed in coverage text. Provider tokens are never returned. Mocked provider-contract and failure tests cover shape handling, missing values, timestamps, endpoint restrictions, and error sanitization. Real provider service behavior is still unverified without the user's corresponding credentials.

## Product rules derived from the audit

- A discovered cohort needs source/query/date/region/limit metadata; ranking is relative to that cohort.
- Prefer explicit view sorting, a minimum view threshold, and a clearly described comparison. Lifetime views divided by video age is average exposure, not a measured recent growth rate.
- Actual growth requires at least two authentic observations of the same video, recorded at their real observation times. Missing history means unavailable growth. Never backdate counters.
- Keep observed performance, media observations, model hypotheses, and user-imported outcomes distinct.
- A suggested attention-risk timeline is a model hypothesis, never a measured retention curve or a probability calibrated against creator analytics.
- Script generation should cite supporting video IDs/links and borrow general structures such as hook/payoff/CTA patterns while producing new wording, examples, and brand claims.
- A sample of high performers alone cannot prove causal mechanisms. Include comparison videos or label claims as hypotheses, then validate them using the user's own results.
- Without provider credentials, support an explicit user import/demo mode and show that live discovery is unavailable; never fabricate a successful live search.
