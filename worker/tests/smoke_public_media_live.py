"""Explicitly invoked public-media smoke; no cookie/profile/challenge bypass."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tikytoky.media import MediaError, inspect_public_video

ROOT = Path(__file__).resolve().parents[2]


def main():
    output = ROOT / "worker/.data" / ("public-media-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    output.mkdir(parents=True, exist_ok=False)
    start = time.monotonic()
    try:
        result = inspect_public_video(sys.argv[1], model_size="tiny", device="cpu", compute_type="int8", work_root=ROOT / "worker/.data/media", local_files_only=True)
        (output / "result.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        summary = {"status": "completed", "url": result["url"], "duration": result["duration"], "frames": len(result["frames"]), "transcriptCharacters": len(result["transcript"]), "segments": len(result["transcriptSegments"]), "transcriptSource": result.get("transcriptSource"), "warnings": result["warnings"]}
    except MediaError as error:
        summary = {"status": "unavailable", "code": error.code, "message": str(error), "url": sys.argv[1]}
    summary["elapsedSeconds"] = round(time.monotonic()-start, 2)
    summary["evidenceDirectory"] = str(output)
    (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
