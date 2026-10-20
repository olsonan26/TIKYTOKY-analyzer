"""Bounded local public-video acquisition, real frame PTS, and timestamped ASR.

Uses yt-dlp, FFmpeg/FFprobe, and optionally faster-whisper. No paid service,
browser cookies, private-account access, or synthetic media evidence is used.
"""
from __future__ import annotations

import base64
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse, urlunparse
from uuid import uuid4

MAX_DOWNLOAD_BYTES = 50_000_000
MAX_DURATION_SECONDS = 180
MAX_FRAMES = 12
ALLOWED_MODELS = {"tiny", "tiny.en", "base", "base.en", "small", "small.en"}
LOCAL_FORMATS = "mov,matroska,webm,avi,flv,mpegts"


class MediaError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_public_url(value: str) -> str:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or len(value) > 2048:
            raise ValueError()
        host = (parsed.hostname or "").lower()
        path = parsed.path
        if host in {"www.tiktok.com", "tiktok.com", "m.tiktok.com"}:
            if not re.fullmatch(r"/@[A-Za-z0-9._]+/video/\d{5,30}/?", path):
                raise ValueError()
            return urlunparse(("https", "www.tiktok.com", path.rstrip("/"), "", "", ""))
        if host in {"vm.tiktok.com", "vt.tiktok.com"} and re.fullmatch(r"/[A-Za-z0-9_-]+/?", path):
            return urlunparse(("https", host, path, "", "", ""))
        if host in {"www.youtube.com", "youtube.com", "m.youtube.com"}:
            video_id = parse_qs(parsed.query).get("v", [""])[0] if path == "/watch" else path.removeprefix("/shorts/").removeprefix("/embed/")
            if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
                raise ValueError()
            return f"https://www.youtube.com/watch?v={video_id}"
        if host == "youtu.be" and re.fullmatch(r"/[A-Za-z0-9_-]{11}/?", path):
            return f"https://www.youtube.com/watch?v={path.strip('/')}"
        if host in {"www.instagram.com", "instagram.com"} and re.fullmatch(r"/(?:reel|p)/[A-Za-z0-9_-]+/?", path):
            return urlunparse(("https", "www.instagram.com", path.rstrip("/"), "", "", ""))
    except (ValueError, TypeError):
        pass
    raise MediaError("invalid_url", "Use a public HTTPS TikTok, YouTube, or Instagram video link.")


def _executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise MediaError("dependency_missing", f"Install {name} on the worker and add it to PATH.")
    return path


def _safe_root(root: Path) -> Path:
    result = Path(root).resolve()
    result.mkdir(parents=True, exist_ok=True)
    return result


def _inside(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise MediaError("invalid_path", "The media artifact was outside its worker job directory.")
    return resolved


def _run(command: list[str], root: Path, timeout: int, *, code: str, max_artifact_bytes: int = 75_000_000,
         environment: dict[str, str] | None = None) -> tuple[str, str, int]:
    """Isolate executable output, enforce wall time and total job artifact size."""
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        try:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=errors, cwd=str(root), env=environment,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except OSError:
            raise MediaError("dependency_missing", "A required worker executable could not be started.") from None
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            if time.monotonic() > deadline:
                process.kill()
                process.wait()
                raise MediaError("timeout", "Local media processing reached its time limit. Try a shorter public video.")
            total = sum(path.stat().st_size for path in root.rglob("*") if path.is_file())
            if total > max_artifact_bytes or output.tell() > 8_000_000 or errors.tell() > 8_000_000:
                process.kill()
                process.wait()
                raise MediaError("size_limit", "The media job exceeded its bounded storage or output limit.")
            time.sleep(0.1)
        output.seek(0)
        errors.seek(0)
        stdout = output.read(8_000_001).decode("utf-8", errors="replace")
        stderr = errors.read(8_000_001).decode("utf-8", errors="replace")
        if len(stdout) > 8_000_000 or len(stderr) > 8_000_000:
            raise MediaError(code, "The media tool returned excessive output.")
        return stdout, stderr, process.returncode


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (TypeError, ValueError):
        return None


def _date(value: Any) -> str | None:
    number = _number(value)
    if number is None:
        return None
    try:
        date = datetime.fromtimestamp(number, timezone.utc)
        if date.year < 2000 or number > time.time() + 300:
            return None
        return date.isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


def _metadata(info: dict[str, Any], url: str, observed_at: str) -> dict[str, Any]:
    host = urlparse(url).hostname or ""
    platform = "tiktok" if "tiktok.com" in host else "youtube" if "youtube.com" in host else "instagram"
    source = "yt-dlp public video extraction"
    canonical = url
    try:
        canonical = validate_public_url(info.get("webpage_url", url))
    except MediaError:
        pass
    return {
        "id": str(info.get("id") or "")[:200], "url": canonical, "platform": platform,
        "title": str(info.get("title") or info.get("description") or "Untitled public video")[:10000],
        "creator": str(info.get("uploader") or info.get("channel") or info.get("creator") or "Unknown creator")[:200],
        "publishedAt": _date(info.get("timestamp")), "duration": _number(info.get("duration")),
        "followers": _number(info.get("channel_follower_count")),
        "snapshots": [{"observedAt": observed_at, "views": _number(info.get("view_count")),
                       "likes": _number(info.get("like_count")), "comments": _number(info.get("comment_count")),
                       "shares": _number(info.get("repost_count")), "source": source}],
        "source": source, "fetchedAt": observed_at,
    }


def download_public_video(url: str, work_dir: Path) -> dict[str, Any]:
    url = validate_public_url(url)
    root = _safe_root(work_dir)
    if importlib.util.find_spec("yt_dlp") is None:
        raise MediaError("dependency_missing", "Install the worker's yt-dlp requirement to download public videos.")
    command = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist", "--no-warnings", "--quiet",
               "--no-cookies", "--no-cookies-from-browser", "--no-cache-dir", "--socket-timeout", "15", "--retries", "1",
               "--extractor-retries", "1", "--fragment-retries", "1", "--concurrent-fragments", "1",
               "--max-filesize", str(MAX_DOWNLOAD_BYTES), "--match-filter", f"!is_live & duration <= {MAX_DURATION_SECONDS}",
               "--format", "best[height<=720]/best", "--no-part", "--no-mtime", "--no-progress",
               "--dump-single-json", "--no-simulate", "--restrict-filenames", "--no-write-info-json",
               "--output", str(root / "media.%(ext)s"), "--", url]
    stdout, stderr, status = _run(command, root, 120, code="download_failed", max_artifact_bytes=MAX_DOWNLOAD_BYTES + 1_000_000)
    if status:
        lower = stderr.lower()
        if any(value in lower for value in ["login", "log in", "sign in", "private", "not have permission", "age-restricted"]):
            raise MediaError("access_restricted", "This post requires login or permission. The worker does not bypass access restrictions; use an accessible public video or an authorized local file.")
        if any(value in lower for value in ["blocked", "captcha", "403", "429", "challenge"]):
            raise MediaError("platform_blocked", "The platform blocked this public request. Try a different accessible public post; the worker does not bypass platform blocks.")
        raise MediaError("download_failed", "The public video could not be downloaded. It may be unavailable, unsupported, too long, or inaccessible from this worker.")
    try:
        info = json.loads(stdout)
        if not isinstance(info, dict) or info.get("_type") in {"playlist", "multi_video"}:
            raise ValueError()
    except (ValueError, TypeError):
        raise MediaError("download_failed", "The downloader did not return one usable public video.") from None
    candidates = [path for path in root.glob("media.*") if path.suffix.lower() in {".mp4", ".webm", ".mkv", ".mov", ".m4v"} and path.is_file()]
    if len(candidates) != 1:
        raise MediaError("download_failed", "The downloader did not produce one playable video file.")
    path = _inside(candidates[0], root)
    if path.stat().st_size <= 0 or path.stat().st_size > MAX_DOWNLOAD_BYTES:
        raise MediaError("size_limit", "The downloaded video is empty or exceeds the 50 MB worker limit.")
    if _number(info.get("duration")) is not None and float(info["duration"]) > MAX_DURATION_SECONDS:
        raise MediaError("duration_limit", "Choose a video of 180 seconds or less for local inspection.")
    return {"path": path, "metadata": _metadata(info, url, _now())}


def probe_media(path: Path) -> dict[str, Any]:
    path = Path(path).resolve(strict=True)
    stdout, _, status = _run([_executable("ffprobe"), "-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", LOCAL_FORMATS, "-show_entries",
                             "format=duration,start_time:stream=codec_type,duration,start_time,width,height", "-of", "json", str(path)],
                            path.parent, 20, code="invalid_media")
    try:
        info = json.loads(stdout)
        streams = info.get("streams", [])
        video = next(stream for stream in streams if stream.get("codec_type") == "video")
        duration = _number(info.get("format", {}).get("duration")) or _number(video.get("duration"))
        if status or not duration:
            raise ValueError()
    except (ValueError, TypeError, StopIteration):
        raise MediaError("invalid_media", "The local video has no readable video stream or duration.") from None
    if duration > MAX_DURATION_SECONDS:
        raise MediaError("duration_limit", "Choose a video of 180 seconds or less for local inspection.")
    return {"duration": duration, "width": _number(video.get("width")), "height": _number(video.get("height")),
            "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams)}


def extract_frames(path: Path, work_dir: Path, max_frames: int = MAX_FRAMES) -> list[dict[str, Any]]:
    if not isinstance(max_frames, int) or isinstance(max_frames, bool) or not 1 <= max_frames <= MAX_FRAMES:
        raise MediaError("invalid_limit", "Choose between one and twelve sampled frames.")
    root = _safe_root(work_dir)
    path = Path(path).resolve(strict=True)
    details = probe_media(path)
    duration = details["duration"]
    targets = [0.0, 1.0, 2.0, 3.0][:max_frames]
    if max_frames > 4 and duration > 3:
        targets.extend(3 + (max(3, duration - 0.1) - 3) * index / (max_frames - 4) for index in range(1, max_frames - 3))
    targets = sorted({round(target, 4) for target in targets if target < duration})
    conditions = ["isnan(prev_selected_t)"]
    conditions.extend(f"gte(t,{target})*lt(prev_selected_t,{target})" for target in targets if target > 0)
    frame_dir = Path(tempfile.mkdtemp(prefix="frames-", dir=root))
    output = frame_dir / "%03d.jpg"
    filters = "setpts=PTS-STARTPTS,select='" + "+".join(conditions) + "',scale=512:512:force_original_aspect_ratio=decrease,showinfo"
    try:
        _, stderr, status = _run([_executable("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", LOCAL_FORMATS,
                                  "-i", str(path), "-an", "-vf", filters, "-frames:v", str(max_frames), "-fps_mode", "passthrough", "-q:v", "4", str(output)],
                                 frame_dir, 45, code="frame_extraction_failed", max_artifact_bytes=5_000_000)
        timestamps = [float(value) for value in re.findall(r"\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.eE+-]+)", stderr)]
        images = sorted(frame_dir.glob("*.jpg"))
        if status or not images or len(images) != len(timestamps):
            raise MediaError("frame_extraction_failed", "FFmpeg could not verify timestamps for the sampled video frames.")
        frames = []
        for image, seconds in zip(images, timestamps):
            if not math.isfinite(seconds) or seconds < 0 or seconds > duration + 0.1 or image.stat().st_size > 225_000:
                raise MediaError("frame_extraction_failed", "A sampled frame exceeded its image or timestamp limit.")
            frames.append({"seconds": seconds, "image": "data:image/jpeg;base64," + base64.b64encode(image.read_bytes()).decode("ascii")})
        if sum(len(frame["image"]) for frame in frames) > 2_500_000:
            raise MediaError("frame_extraction_failed", "The sampled images exceed the dashboard's combined frame payload limit.")
        return frames
    finally:
        shutil.rmtree(frame_dir)


def _asr_direct(path: Path, model_size: str, device: str, compute_type: str, cache: Path, offline: bool) -> dict[str, Any]:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device=device, compute_type=compute_type, cpu_threads=min(4, os.cpu_count() or 1),
                         num_workers=1, download_root=str(cache), local_files_only=offline, use_auth_token=False)
    segments, info = model.transcribe(str(path), beam_size=5, vad_filter=True, condition_on_previous_text=False, word_timestamps=False)
    rows = []
    for segment in segments:
        start, end = float(segment.start), float(segment.end)
        text = str(segment.text).strip()
        if not all(math.isfinite(value) for value in [start, end]) or start < 0 or end < start or end > MAX_DURATION_SECONDS + 1:
            raise ValueError("invalid ASR timestamps")
        if text:
            rows.append({"start": start, "end": end, "text": text})
        if len(rows) > 2000 or sum(len(row["text"]) for row in rows) > 40_000:
            raise ValueError("ASR output limit")
    return {"transcript": " ".join(row["text"] for row in rows), "transcriptSegments": rows,
            "language": str(info.language), "transcriptSource": f"faster-whisper/{model_size} ({device}/{compute_type})",
            "model": model_size, "device": device, "computeType": compute_type}


def transcribe_media(path: Path, model_size: str = "base", device: str = "cpu", compute_type: str = "int8", model_cache: Path | None = None,
                     *, local_files_only: bool = False) -> dict[str, Any]:
    if model_size not in ALLOWED_MODELS or device not in {"cpu", "cuda"} or compute_type not in {"int8", "float16", "int8_float16", "float32"}:
        raise MediaError("invalid_model", "Choose a supported local Whisper model and CPU/CUDA compute configuration.")
    path = Path(path).resolve(strict=True)
    details = probe_media(path)
    if not details["hasAudio"]:
        return {"transcript": "", "transcriptSegments": [], "language": None, "transcriptSource": "No audio stream", "warnings": ["This video has no audio stream; speech was not transcribed."]}
    if importlib.util.find_spec("faster_whisper") is None:
        raise MediaError("dependency_missing", "Install the worker's faster-whisper requirement to transcribe locally.")
    cache = _safe_root(model_cache or path.parent / ".models")
    # HF reads these on first import. Isolate the ASR subprocess from stale global
    # cache locations (including Xet/asset caches on disconnected external drives).
    asr_environment = {**os.environ, "HF_HOME": str(cache / ".hf"), "HF_HUB_CACHE": str(cache),
                       "HF_XET_CACHE": str(cache / ".xet"), "HF_ASSETS_CACHE": str(cache / ".assets"),
                       "HF_TOKEN_PATH": str(cache / ".hf" / "token"), "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
                       "HF_HUB_DISABLE_TELEMETRY": "1", "HF_XET_HIGH_PERFORMANCE": "0"}
    with tempfile.TemporaryDirectory(prefix="asr-", dir=path.parent) as temp:
        temp_root = Path(temp)
        audio = temp_root / "audio.wav"
        _, _, status = _run([_executable("ffmpeg"), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", LOCAL_FORMATS,
                             "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-t", str(MAX_DURATION_SECONDS), str(audio)],
                            temp_root, 30, code="audio_extraction_failed", max_artifact_bytes=7_000_000)
        if status or not audio.is_file():
            raise MediaError("audio_extraction_failed", "FFmpeg could not decode the video's audio stream.")
        result_file = temp_root / "transcript.json"
        _, _, status = _run([sys.executable, str(Path(__file__).resolve()), "--asr", str(audio), str(result_file), model_size, device,
                             compute_type, str(cache), "1" if local_files_only else "0"], temp_root, 600, code="transcription_failed", max_artifact_bytes=8_000_000,
                            environment=asr_environment)
        if status or not result_file.is_file():
            raise MediaError("transcription_failed", "Local speech recognition could not complete. Check the installed model, network access for first-use model download, and CPU/GPU dependencies.")
        try:
            result = json.loads(result_file.read_text(encoding="utf-8"))
            if not isinstance(result.get("transcript"), str) or not isinstance(result.get("transcriptSegments"), list):
                raise ValueError()
        except (ValueError, OSError):
            raise MediaError("transcription_failed", "Local speech recognition returned invalid output.") from None
        return result


def _inspect_video(path: Path, video: dict[str, Any], root: Path, model_cache: Path, *, transcribe: bool,
                   max_frames: int, model_size: str, device: str, compute_type: str, local_files_only: bool) -> dict[str, Any]:
    details = probe_media(path)
    frames = extract_frames(path, root, max_frames)
    result = {"url": video["url"], "video": video, "duration": details["duration"], "frames": frames,
              "transcript": "", "transcriptSegments": [], "language": None, "transcriptSource": "Not requested", "warnings": []}
    video["duration"] = details["duration"]
    if transcribe:
        try:
            result.update(transcribe_media(path, model_size, device, compute_type, model_cache, local_files_only=local_files_only))
        except MediaError as error:
            result["warnings"].append(error.message)
            result["transcriptSource"] = "Unavailable: local transcription failed"
        if result.get("transcript"):
            video["transcript"] = result["transcript"]
        video["transcriptSource"] = result["transcriptSource"]
    video["transcriptSegments"] = result["transcriptSegments"]
    video["frames"] = frames
    return result


def inspect_public_video(url: str, *, transcribe: bool = True, max_frames: int = MAX_FRAMES, model_size: str = "base", device: str = "cpu",
                         compute_type: str = "int8", work_root: Path | None = None, local_files_only: bool = False) -> dict[str, Any]:
    url = validate_public_url(url)
    base = _safe_root(work_root or Path(tempfile.gettempdir()) / "tikytoky-worker")
    with tempfile.TemporaryDirectory(prefix="media-", dir=base) as temp:
        root = Path(temp)
        downloaded = download_public_video(url, root)
        return _inspect_video(downloaded["path"], downloaded["metadata"], root, base / ".models", transcribe=transcribe,
                              max_frames=max_frames, model_size=model_size, device=device, compute_type=compute_type,
                              local_files_only=local_files_only)


def inspect_local_video(path: Path, *, transcribe: bool = True, max_frames: int = MAX_FRAMES, model_size: str = "base", device: str = "cpu",
                        compute_type: str = "int8", work_root: Path | None = None, local_files_only: bool = False) -> dict[str, Any]:
    """Inspect an already-authorized upload. Its owner, not this function, deletes it."""
    try:
        original = Path(path).resolve(strict=True)
        size = original.stat().st_size
        if not original.is_file() or size <= 0:
            raise OSError()
    except OSError:
        raise MediaError("invalid_media", "The uploaded video file could not be read.") from None
    if size > MAX_DOWNLOAD_BYTES:
        raise MediaError("size_limit", "The uploaded video exceeds the 50 MB worker limit.")
    base = _safe_root(work_root or Path(tempfile.gettempdir()) / "tikytoky-worker")
    video = {"id": f"draft-{uuid4()}", "url": "", "platform": "other", "title": "Uploaded video draft", "creator": "You",
             "publishedAt": None, "duration": None, "followers": None, "snapshots": [], "source": "Local user upload", "fetchedAt": _now()}
    with tempfile.TemporaryDirectory(prefix="local-media-", dir=base) as temp:
        return _inspect_video(original, video, Path(temp), base / ".models", transcribe=transcribe, max_frames=max_frames,
                              model_size=model_size, device=device, compute_type=compute_type, local_files_only=local_files_only)


if __name__ == "__main__":
    # Internal bounded ASR subprocess. No source text is evaluated as code.
    if len(sys.argv) == 9 and sys.argv[1] == "--asr":
        try:
            payload = _asr_direct(Path(sys.argv[2]), sys.argv[4], sys.argv[5], sys.argv[6], Path(sys.argv[7]), sys.argv[8] == "1")
            Path(sys.argv[3]).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except Exception:
            sys.exit(1)
    else:
        sys.exit(2)
