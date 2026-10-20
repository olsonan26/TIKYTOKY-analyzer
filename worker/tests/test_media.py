"""Adapter verification; generated-media tests are not live platform tests."""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from tikytoky import media

PUBLIC_URL = "https://www.tiktok.com/@hankgreen1/video/7047596209028074758"


@pytest.mark.parametrize("url", ["http://www.tiktok.com/@user/video/123456", "https://127.0.0.1/video", "https://www.tiktok.com.evil.invalid/@u/video/123456", "https://user:pass@www.tiktok.com/@u/video/123456", "https://www.tiktok.com:444/@u/video/123456", "https://www.youtube.com/playlist?list=secret", "file:///private"])
def test_invalid_or_nonvideo_urls_are_rejected(url):
    with pytest.raises(media.MediaError) as error:
        media.validate_public_url(url)
    assert error.value.code == "invalid_url"


def test_valid_urls_strip_tracking_but_keep_specific_public_video():
    assert media.validate_public_url(PUBLIC_URL + "?token=tracking") == PUBLIC_URL
    assert media.validate_public_url("https://youtu.be/abcdefghijk?feature=shared") == "https://www.youtube.com/watch?v=abcdefghijk"
    assert media.validate_public_url("https://www.youtube.com/shorts/abcdefghijk") == "https://www.youtube.com/watch?v=abcdefghijk"


def test_downloader_is_bounded_no_credentials_and_retains_missing_metrics(tmp_path):
    calls = []

    def run(command, root, timeout, **kwargs):
        calls.append(command)
        (root / "media.mp4").write_bytes(b"test downloaded bytes")
        return json.dumps({"id": "7047596209028074758", "webpage_url": PUBLIC_URL, "title": "Science clip", "uploader": "hankgreen1", "timestamp": 1640000000, "duration": 15, "view_count": 12345}), "", 0

    with patch.object(media, "_run", side_effect=run), patch.object(media.importlib.util, "find_spec", return_value=object()):
        result = media.download_public_video(PUBLIC_URL, tmp_path)
    command = calls[0]
    assert "--ignore-config" in command and "--no-cookies" in command and "--no-cookies-from-browser" in command
    assert "--proxy" not in command and "--cookies" not in command
    assert command[command.index("--max-filesize") + 1] == "50000000"
    assert "duration <= 180" in command[command.index("--match-filter") + 1]
    video = result["metadata"]
    assert video["publishedAt"].startswith("2021-")
    assert video["snapshots"][0]["views"] == 12345
    assert video["snapshots"][0]["likes"] is None
    assert video["snapshots"][0]["shares"] is None
    assert "transcript" not in video, "metadata extraction must not fabricate speech from a caption"
    assert "formats" not in video and "cookies" not in video


@pytest.mark.parametrize(("stderr", "code"), [("Login required; secret cookie=abc", "access_restricted"), ("Your IP is blocked HTTP 403", "platform_blocked"), ("Unexpected response from webpage request", "download_failed")])
def test_downloader_errors_are_sanitized_and_do_not_claim_success(tmp_path, stderr, code):
    with patch.object(media, "_run", return_value=("null", stderr, 1)), patch.object(media.importlib.util, "find_spec", return_value=object()):
        with pytest.raises(media.MediaError) as error:
            media.download_public_video(PUBLIC_URL, tmp_path)
    assert error.value.code == code
    assert "secret" not in str(error.value) and "cookie=abc" not in str(error.value)


def test_job_temporary_video_is_cleaned_even_when_processing_fails(tmp_path):
    directories = []

    def download(url, root):
        directories.append(root)
        path = root / "media.mp4"
        path.write_bytes(b"temporary")
        return {"path": path, "metadata": {}}

    with patch.object(media, "download_public_video", side_effect=download), patch.object(media, "probe_media", side_effect=media.MediaError("invalid_media", "failed")):
        with pytest.raises(media.MediaError):
            media.inspect_public_video(PUBLIC_URL, work_root=tmp_path)
    assert directories and not directories[0].exists()
    assert list(tmp_path.iterdir()) == []


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="requires local FFmpeg and FFprobe")
def test_frame_labels_are_actual_decoded_pts_not_requested_sample_targets(tmp_path):
    # Deliberately 3 fps: the request target t=3.95 has no frame at exactly 3.95.
    path = tmp_path / "variable.mp4"
    subprocess.run([shutil.which("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=96x128:rate=3:duration=4.2", "-an", "-c:v", "libx264", str(path)], check=True, stdin=subprocess.DEVNULL)
    frames = media.extract_frames(path, tmp_path, max_frames=6)
    probe = subprocess.run([shutil.which("ffprobe"), "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(path)], check=True, capture_output=True, text=True)
    times = [float(frame["best_effort_timestamp_time"]) for frame in json.loads(probe.stdout)["frames"]]
    assert frames and len(frames) <= 6
    assert all(any(abs(frame["seconds"] - actual) < 0.0001 for actual in times) for frame in frames)
    assert frames[0]["seconds"] == 0
    assert any(abs(frame["seconds"] - round(frame["seconds"])) > 0.01 for frame in frames), "a fractional actual source PTS must survive"
    for frame in frames:
        image = base64.b64decode(frame["image"].split(",", 1)[1])
        assert image.startswith(b"\xff\xd8")
    assert not list(tmp_path.glob("frames-*"))


def test_asr_consumes_lazy_segments_and_preserves_timestamps_model_and_language(tmp_path):
    consumed = []

    class Model:
        def __init__(self, name, **kwargs):
            assert name == "tiny" and kwargs["device"] == "cpu" and kwargs["compute_type"] == "int8"
            assert kwargs["download_root"] == str(tmp_path)
            assert kwargs["local_files_only"] is True

        def transcribe(self, path, **kwargs):
            def segments():
                consumed.append(True)
                yield SimpleNamespace(start=0.37, end=1.92, text=" Actual speech.")
                yield SimpleNamespace(start=2.18, end=3.55, text=" Another segment.")
            return segments(), SimpleNamespace(language="en")

    with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=Model)}):
        result = media._asr_direct(tmp_path / "audio.wav", "tiny", "cpu", "int8", tmp_path, True)
    assert consumed
    assert result["transcript"] == "Actual speech. Another segment."
    assert result["transcriptSegments"][0] == {"start": 0.37, "end": 1.92, "text": "Actual speech."}
    assert result["language"] == "en"
    assert result["transcriptSource"] == "faster-whisper/tiny (cpu/int8)"


def test_no_audio_is_unknown_speech_not_invented_transcript(tmp_path):
    path = tmp_path / "silent.mp4"
    path.write_bytes(b"local fixture")
    with patch.object(media, "probe_media", return_value={"duration": 10, "hasAudio": False}), patch.object(media.importlib.util, "find_spec", return_value=object()):
        result = media.transcribe_media(path)
    assert result["transcript"] == "" and result["transcriptSegments"] == []
    assert result["language"] is None
    assert "no audio" in result["warnings"][0]


def test_transcription_failure_can_keep_genuine_visual_evidence_with_explicit_warning(tmp_path):
    video = {"duration": 12, "url": PUBLIC_URL}
    with patch.object(media, "download_public_video", return_value={"path": tmp_path / "media.mp4", "metadata": video}), patch.object(media, "probe_media", return_value={"duration": 12}), patch.object(media, "extract_frames", return_value=[{"seconds": 0, "image": "data:image/jpeg;base64,actual"}]), patch.object(media, "transcribe_media", side_effect=media.MediaError("dependency_missing", "Whisper is not installed.")):
        result = media.inspect_public_video(PUBLIC_URL, work_root=tmp_path)
    assert result["frames"] and result["warnings"] == ["Whisper is not installed."]
    assert result["transcript"] == "" and result["transcriptSegments"] == []
    assert result["transcriptSource"].startswith("Unavailable")


def test_local_upload_preserves_original_file_and_segment_evidence_without_public_metrics(tmp_path):
    original = tmp_path / "my-own-draft.mp4"
    original.write_bytes(b"authorized user upload")
    work = tmp_path / "jobs"
    segments = [{"start": 0.27, "end": 2.83, "text": "My recorded draft."}]
    asr = {"transcript": "My recorded draft.", "transcriptSegments": segments, "language": "en", "transcriptSource": "faster-whisper/tiny (cpu/int8)"}
    with patch.object(media, "probe_media", return_value={"duration": 4, "hasAudio": True}), patch.object(media, "extract_frames", return_value=[{"seconds": 0, "image": "data:image/jpeg;base64,frame"}]), patch.object(media, "transcribe_media", return_value=asr):
        result = media.inspect_local_video(original, work_root=work, model_size="tiny")
    assert original.read_bytes() == b"authorized user upload"
    assert not list(work.glob("local-media-*")), "only newly created processing artifacts are removed"
    assert result["video"]["url"] == "" and result["video"]["platform"] == "other"
    assert result["video"]["publishedAt"] is None and result["video"]["snapshots"] == []
    assert result["video"]["creator"] == "You" and result["video"]["source"] == "Local user upload"
    assert result["video"]["transcriptSegments"] == segments
    assert result["video"]["transcript"] == "My recorded draft."


def test_public_result_keeps_segment_timing_in_video(tmp_path):
    segments = [{"start": 0.3, "end": 1.6, "text": "Spoken evidence."}]
    with patch.object(media, "download_public_video", return_value={"path": tmp_path / "video.mp4", "metadata": {"url": PUBLIC_URL}}), patch.object(media, "probe_media", return_value={"duration": 2}), patch.object(media, "extract_frames", return_value=[]), patch.object(media, "transcribe_media", return_value={"transcript": "Spoken evidence.", "transcriptSegments": segments, "transcriptSource": "Local ASR"}):
        result = media.inspect_public_video(PUBLIC_URL, work_root=tmp_path)
    assert result["video"]["transcriptSegments"] == segments


def test_asr_subprocess_uses_local_caches_instead_of_inherited_external_drive(tmp_path):
    path = tmp_path / "video.mp4"
    path.write_bytes(b"fixture")
    cache = tmp_path / "models"

    def run(command, root, timeout, **kwargs):
        if "--asr" in command:
            environment = kwargs["environment"]
            assert environment["HF_HOME"] == str(cache / ".hf")
            assert environment["HF_XET_CACHE"] == str(cache / ".xet")
            assert environment["HF_HUB_CACHE"] == str(cache)
            assert environment["HF_HUB_DISABLE_IMPLICIT_TOKEN"] == "1"
            Path(command[4]).write_text(json.dumps({"transcript": "Real speech", "transcriptSegments": [{"start": 0, "end": 1, "text": "Real speech"}]}))
        else:
            Path(command[-1]).write_bytes(b"decoded audio")
        return "", "", 0

    with patch.dict(os.environ, {"HF_HOME": "Z:/unavailable-cache"}), patch.object(media, "probe_media", return_value={"duration": 2, "hasAudio": True}), patch.object(media.importlib.util, "find_spec", return_value=object()), patch.object(media, "_run", side_effect=run):
        result = media.transcribe_media(path, model_cache=cache)
        assert os.environ["HF_HOME"] == "Z:/unavailable-cache", "parent process environment is not mutated"
    assert result["transcript"] == "Real speech"
