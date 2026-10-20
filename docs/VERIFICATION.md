# Verification — October 20, 2026

Passing local checks establish the behavior described here. They do not certify complete TikTok coverage, future access, or guaranteed virality. The production deployment and its verified operations are recorded below.

## Dashboard and worker

| Check | Actual result |
| --- | --- |
| Dashboard automated tests | 61 passed; provider contract cases use mocked HTTP, not fabricated market observations. |
| Worker automated tests | 45 passed plus 6 subtests in the installed isolated Python runtime. Includes metadata, media bounds, real frame timestamps, exclusive profile ownership, research source boundaries, job persistence, authentication, origins, date windows, and upload cleanup. |
| TypeScript / production build | Passed locally. Vercel runs the dashboard; Python jobs run in the local worker. |
| Production HTTP smoke | Signed login, denied unauthenticated requests, input validation, Utah plan, actual text-file extraction, cross-origin denial and browser-bundle secret scan passed. No provider calls in this check. |
| Real browser-to-worker upload | Chromium paired to the running worker through its actual dashboard UI, uploaded an 11-second recorded-speech test MP4, polled the real job and saved draft evidence. Local faster-whisper produced 108 transcript characters and a timestamped segment; direct OpenRouter vision described the actual black frames. No market snapshots or frame bytes were saved in the browser project. Temporary uploaded file was deleted. |
| Mobile layout | 390-pixel viewport navigation opens/closes correctly after transitions, with no horizontal overflow. Desktop and mobile screenshots were inspected locally; screenshots stay outside Git. |
| One-command Windows startup | `Start-TikyToky.ps1 -NoBrowser` found/started the local dashboard and worker and confirmed both HTTP services. Numeric loopback readiness checks avoid this host's slow IPv6 localhost resolution. |

The browser smoke used an isolated temporary browser context. Its test clip is explicitly software-validation media, not an observed TikTok video or user knowledge document.

## Actual AI, extraction and research

- A real OpenRouter/DeepSeek request completed evidence analysis, one knowledge-cited script with five citations, and a separate factual-claim verification pass. The input explicitly identified software-validation material. This does not prove future script accuracy or performance.
- Real searchable PDF and DOCX extraction passed, alongside oversized/archive/XML rejection tests.
- Real faster-whisper speech recognition and FFmpeg frame decoding passed on the upstream JFK recorded-speech fixture. The model used for the smoke was tiny, CPU/int8; the configurable application default is base. Model-generated speech recognition remains fallible.
- A real Crawl4AI request read the official Browser Use GitHub repository. Real GPT Researcher planning/writing completed a 1,798-character report citing that supplied source and disclosing incomplete source coverage. This verifies the installed investigation path, not a viral-market finding.
- Actual installed signatures were checked for Browser Use 0.13.11, TikTokApi 7.3.3, Playwright 1.64, GPT Researcher 0.16.1, and Crawl4AI 0.9.5.

## Live TikTok outcomes and limits

- The initial Browser Use attempt stopped at an access restriction. A later real six-step retry succeeded, returning **two dated astrology videos with actual page counters**: one with 418,300 views and one with 1,044 views at the recorded observation times. The authenticated worker queue also completed a numerology discovery job and retained one dated source with 5,793 observed views. This is a bounded sample, not a platform-wide viral census. No CAPTCHA bypass was attempted.
- The secondary TikTok-Api public detail attempt returned EmptyResponseException, with **zero new observed metrics**.
- Public TikTok URL downloads returned unexpected upstream responses, including the newly discovered 52-second source. Its actual observed playback URLs also returned HTTP 403 on ordinary requests. No downloaded TikTok footage or transcript is claimed. The system retains available metadata and reports missing creative evidence rather than inventing analysis.
- Sanitized evidence is in [browser-public-smoke.json](research/browser-public-smoke.json), [tiktok-api-public-smoke.json](research/tiktok-api-public-smoke.json), and the [media investigation](research/open-source-media-stack.md).
- The dashboard supplies an authenticated **Open TikTok login** button and a **Finish login and close browser** button for the isolated persistent profile. Login must be completed by the user. A valid session may help, but does not guarantee TikTok will permit discovery or downloads.
- Exact-window research excludes sources whose publication date cannot be verified. Missing counts remain unknown. Historical growth needs distinct real observations.

## Compatibility repairs and remaining infrastructure

- Browser Use and GPT Researcher require incompatible MCP major versions. Two pinned Python environments communicate through the single worker/job dashboard, preserving both original dependency contracts.
- Actual ASR testing exposed PyAV 19's removed metadata_errors argument. The primary runtime pins PyAV 16.1.0, and the real speech test passes with that version.
- ASR subprocess caches are isolated under worker data, avoiding inherited Hugging Face caches on an unavailable external drive.
- Browser Use 0.13.11 forces DeepSeek navigation to DOM mode. Actual frame interpretation uses the separate direct vision-capable OpenRouter call, verified with decoded images.
- SearXNG configuration, loopback Docker Compose service, and startup script are provided. This computer's Docker Desktop backend fails during startup. No local SearXNG search is claimed as successful. Broader web enrichment reports that limitation while source-bounded comparison remains available.
- Both GitHub Linux jobs passed for application/CI commit `a9fb66f57e9e8a3c6f0e2adb1cf1dc142c2e4e5d`: dashboard dependency install, tests, TypeScript and production build; and worker locked-dependency install, research lockfile check and tests. [Verified workflow run](https://github.com/olsonan26/TIKYTOKY-analyzer/actions/runs/39387093843). The first worker run exposed missing runner FFmpeg; the workflow now installs it explicitly before verification. Subsequent changes only clarify documentation.
- The dashboard is deployed at https://tikytoky-analyzer.vercel.app using the Vercel remote Linux build. Actual production password login, unauthenticated API denial, knowledge upload and seven-window Utah planning passed. A Chromium page on that exact production origin successfully paired to the loopback worker with local-network access granted only to that origin. Provider secrets, the local worker directory and its private data are excluded from deployment uploads. No automatic TikTok publishing or unattended daily scheduler is included.

## Reproduce

```powershell
npm test
npm run typecheck
npm run build
npm run smoke:http
cd worker
./.venv/Scripts/python.exe -m pytest -q
```

The smoke_* worker scripts and npm run smoke:ai are opt-in live checks. Some consume model credits, download models or access public services. They print sanitized summaries; credentials and raw private runtime logs are excluded from Git. A successful configured indicator alone does not establish provider access.


## Additional live reliability check

A later real script request exposed hidden DeepSeek reasoning consuming the completion budget before JSON finished. OpenRouter’s current model catalog confirms this model accepts reasoning effort `none`; the dashboard now uses it for DeepSeek V4.1 calls, retaining strict response validation and the separate claim-verification pass. Real requests subsequently completed knowledge-cited scripts, Markdown export, local upload ASR/vision, draft coaching, and Utah planning. The claim verifier also correctly rejected an unsupported generated variant without saving it. See the final complete-workflow record for the final production pass status.
