# Open-source media stack audit

Audited October 19, 2026 before implementing the local media adapter. Public upstream source was cloned unchanged for inspection. This adapter is the primary local media path; Apify and Supadata remain optional provider integrations.

| Requested upstream | Pinned source | License | Verified interface / requirements |
| --- | --- | --- | --- |
| `yt-dlp/yt-dlp` | [`897341241f2bfb2439fe0367f4c7c9ccd29a3828`](https://github.com/yt-dlp/yt-dlp/tree/897341241f2bfb2439fe0367f4c7c9ccd29a3828), version `2026.08.19` | [Unlicense source](https://github.com/yt-dlp/yt-dlp/blob/897341241f2bfb2439fe0367f4c7c9ccd29a3828/LICENSE). Its bundled release executables have additional licensing obligations; prefer the Python package rather than redistributing an executable. | [Python >=3.10](https://github.com/yt-dlp/yt-dlp/blob/897341241f2bfb2439fe0367f4c7c9ccd29a3828/pyproject.toml#L20-L65); Python API and `python -m yt_dlp` expose download limits, timeout/retries, metadata, format filtering and no-playlist operation. FFmpeg/FFprobe are external programs used by this worker. |
| `SYSTRAN/faster-whisper` | [`9e472ae9de8bb374552f531f752654554b76b2d6`](https://github.com/SYSTRAN/faster-whisper/tree/9e472ae9de8bb374552f531f752654554b76b2d6), version `1.2.1` | [MIT, SYSTRAN 2023](https://github.com/SYSTRAN/faster-whisper/blob/9e472ae9de8bb374552f531f752654554b76b2d6/LICENSE) | [Requirements](https://github.com/SYSTRAN/faster-whisper/blob/9e472ae9de8bb374552f531f752654554b76b2d6/requirements.txt): CTranslate2, Hugging Face Hub, tokenizers, ONNX Runtime, PyAV, tqdm; Python >=3.9. [WhisperModel constructor](https://github.com/SYSTRAN/faster-whisper/blob/9e472ae9de8bb374552f531f752654554b76b2d6/faster_whisper/transcribe.py#L623-L701) supports CPU/int8, bounded CPU threads, explicit model cache, offline-only mode and pinned model revisions. |

## Scope and data quality

Only supported public TikTok/YouTube/Instagram video URLs are accepted. The adapter does not load browser cookies, account credentials, private posts, proxy evasion, DRM overrides, or login bypasses. A platform access block, unavailable post, or login requirement is returned explicitly. yt-dlp's TikTok extractor itself distinguishes [private/login-required and IP-blocked statuses](https://github.com/yt-dlp/yt-dlp/blob/897341241f2bfb2439fe0367f4c7c9ccd29a3828/yt_dlp/extractor/tiktok.py#L994-L1015). Support for an extractor does not prove that a particular post is downloadable today.

The worker uses actual decoded video PTS for timestamped JPEG samples. FFmpeg selects frames on the source timeline and `showinfo` reports their real timestamps; target sample times are not substituted as frame labels. Metadata counters are recorded at their actual observation time, with missing values unknown. Downloaded video is temporary and bounded to 50 MB / 180 seconds by default. This provides media evidence, not actual audience retention or proof of what caused virality.

faster-whisper's [transcribe API](https://github.com/SYSTRAN/faster-whisper/blob/9e472ae9de8bb374552f531f752654554b76b2d6/README.md#usage) returns a lazy segment iterator with actual `start`, `end`, and text. The worker consumes that iterator, preserves segment timestamps and detected language, labels the actual configured model/device, and never substitutes a caption for speech. CPU/int8 is the portable default. `base` is the default model; `tiny` can be selected for faster checks and larger models trade time/memory for recognition quality. No speech result is a transcription result with empty segments, not invented words.

Model weights are downloaded lazily on the first actual transcription, into the explicit worker model cache; this uses network and disk but no paid API. Configure offline-only mode after provisioning if desired. Weights and their model cards have their own terms and provenance, separate from the inference library. GPU execution additionally depends on matching NVIDIA/CTranslate2/CUDA/cuDNN versions; CPU remains available without that setup.

## Windows and WSL2

Use an isolated worker virtual environment with Python 3.11 or 3.12 and install the pinned worker requirements there. Do not change the user's unrelated Hermes environment. Ensure local `ffmpeg` and `ffprobe` are on PATH; native Windows and WSL2 need their own compatible binaries/dependencies. Native CPU inference does not require WSL2. Running the Linux worker under WSL2 is an alternative, not proof of native-Windows or GPU behavior. A Vercel frontend calls this separately running worker; model inference and FFmpeg are not assumed to run inside a Vercel request.

## Verification record

At audit time, this host had Python 3.11.9, yt-dlp, and FFmpeg/FFprobe 8.0.1 available; faster-whisper was not installed in the checked interpreter. The isolated worker environment subsequently selected Python 3.12.10 because other requested worker integrations require it. Upstream fixture URLs are historical test cases, not guaranteed live posts.

Local adapter verification: 20 tests passed in the isolated worker environment, including FFmpeg/FFprobe on a generated 3-fps video. Every returned image timestamp matched an actual decoded source PTS, including fractional timestamps; temporary images were cleaned. Additional tests cover public-link validation, bounded downloader options, missing counters, sanitized restriction failures, lazy transcription-segment consumption, absent audio, partial evidence, job cleanup, original upload preservation, segment persistence, and isolated ASR cache paths. Generated media tests establish local processing behavior only.

Two bounded public TikTok metadata checks were attempted against historical upstream fixture URLs, [patroxofficial](https://www.tiktok.com/@patroxofficial/video/6742501081818877190) and [hankgreen1](https://www.tiktok.com/@hankgreen1/video/7047596209028074758). Both returned yt-dlp's `Unexpected response from webpage request`; no downloadable TikTok media or real TikTok transcript was obtained. No login or platform-block bypass was attempted. These failures do not establish that all public TikTok posts are inaccessible. A current accessible public-video download remains a separate live acceptance check; do not describe the mocked/generated-media tests as satisfying it.

### Actual local speech inference: October 20, 2026

The isolated Windows Python 3.12 worker successfully transcribed the real recorded JFK speech fixture from the pinned faster-whisper repository. Fixture SHA-256: `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715`. For the full video interface, that recorded audio was placed in an 11-second generated black-frame container. This is a local upload/ASR test, not real TikTok extraction or visual-content analysis.

- Installed inference versions: faster-whisper `1.2.1`, CTranslate2 `4.8.3`, PyAV `16.1.0`; `tiny`, CPU, `int8`; language detected as English.
- Recognition returned the expected recognizable speech and one model-generated timestamped segment from 0 to 11 seconds. Segment times are ASR estimates, not independently measured word alignment.
- `inspect_local_video` returned 11 actual decoded frame samples, preserved the segment list inside the canonical draft video, kept publication time unknown and metric snapshots empty, and left the caller-owned original upload intact.
- Direct probe/frame/transcription plus a second complete local-inspection pass took 11.03 seconds with cached weights. This is a one-fixture observation, not a performance guarantee. Private JSON evidence and model weights remain under ignored worker data/cache directories.

The real test exposed two issues that import-only checks missed. The original environment's inherited Hugging Face/Xet cache targeted an unavailable location; the worker now gives the ASR subprocess explicit local Hub, Xet, asset, token-file, and home paths without changing the parent environment. Also, faster-whisper `1.2.1` passes `metadata_errors` to PyAV, which PyAV `19.0.1` rejects. The isolated worker pins the tested PyAV `16.1.0` release, whose [public API supports that argument](https://github.com/PyAV-Org/PyAV/blob/v16.1.0/av/container/core.pyx), instead of modifying creator-authored faster-whisper code.

Worker media executables resolve from the worker's `PATH`; the verified host used FFmpeg/FFprobe `8.0.1`. The Next.js fallback media adapter separately imports its npm `ffmpeg-static` binary. Installing that npm package does not supply the worker's required FFprobe executable or establish Linux/WSL2 availability.
