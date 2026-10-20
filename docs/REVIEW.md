# Bounded integration review

Reviewed the dashboard, route contracts, AI validation, authentication, ranking, growth planning, document extraction and browser media limits against the requested research-to-original-script workflow. This is a focused source review with local tests; it is not proof of live TikTok access, production deployment, model accuracy or guaranteed virality.

The six actionable findings from the first pass were rechecked in current source:

| Finding | Current resolution |
|---|---|
| Date-only publication input lost the actual posting hour | Results now collect a Utah `datetime-local` value, convert with `America/Denver` rules, reject future/invalid times and reject nonexistent spring-forward times by round-trip checking. |
| In-flight AI output could restore stale sources or knowledge | Analysis/generation compare the project's monotonic `updatedAt` version before applying results; generation also compares the brief. Transcript retrieval preserves intervening manual edits. |
| More than 20 previous outcomes broke generation | The scripts route sorts supplied outcomes by publication date and selects the latest 20 before calling the bounded AI module. |
| Saved notes could exceed the per-document generation limit | Knowledge notes now cap at 50,000 characters, require 20 usable characters, and enforce the 100,000-character/20-document project limits. The library shows current usage. |
| Normalization removed signed CDN query parameters | Separate asset URL handling retains thumbnail/media queries; canonical source-video URLs still discard tracking parameters. Regression test added. |
| YouTube discovery could exceed a 60-second route budget | Discovery's declared route duration is now 180 seconds, covering its bounded sequential provider requests. Hosting-plan limits still apply. |

No blocker remains from those six findings in the inspected source. The following boundaries remain intentional:

- Every paid discovery, transcript, analysis, image-inspection, coaching and script route calls the server guard. Production requires a configured password of at least 16 characters; public status reports configuration booleans, not keys. Session integrity, expiry, origin checks and body limits have local tests.
- Counters remain source-reported observations; unavailable metrics remain missing. Growth requires separate timestamps. Rank scores describe the collected sample. Actual audience retention is not invented.
- Scripts require supplied knowledge documents, exact whitespace-normalized quotations and a separate model-based support audit. This reduces unsupported claims; it does not mathematically establish entailment or verify whether the uploaded source itself is true.
- Sampled images are explicitly transmitted to the configured model. Persistent projects discard frame bytes and retain text. Browser storage is local to that browser; export/import is the portability mechanism.

Verification run during this recheck: `npm test` passed **60 tests**. This includes mocked provider contracts and knowledge-grounding rejection cases, real local document extraction, signed-media normalization, session/body-limit tests, and real local FFmpeg frame decoding. These passing tests do not establish paid-provider or deployed browser success. Separate live smoke/deployment records must report their own evidence.

Read the installed Next.js route-handler and authentication guides before assessing the route contracts, as required by this repository's generated `AGENTS.md`.


## Final local-worker integration recheck

The completed browser UI uses the persistent worker queue, exact origin allowlist, private bearer token, bounded uploads, actual ASR segments and real decoded frame evidence. Manual login, Browser Use and Playwright MCP share an exclusive profile lease. A blocked source is not converted into fabricated analysis. Exact-date filtering excludes undated/out-of-window candidates.

Reopened jobs can import their original evidence without changing collection timestamps. Worker results return to their originating project; refresh preserves stable IDs by URL. Late AI results are rejected when current evidence, knowledge, outcomes or the creative brief differ. Saved creator/delivery choices survive project reload.

Final local verification: 61 dashboard tests and 45 worker tests plus 6 subtests passed; production build and HTTP/auth smoke passed. A real browser upload completed local ASR and direct vision, with no market counters or saved frame bytes. Mobile navigation passed at 390 pixels. TikTok probes remained blocked/empty; no successful live TikTok collection is claimed. See VERIFICATION.md for the exact scope and remaining infrastructure limits.
