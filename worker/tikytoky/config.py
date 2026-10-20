from __future__ import annotations

import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

WORKER_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = WORKER_ROOT.parent
load_dotenv(REPOSITORY_ROOT / ".env.local", override=False)
load_dotenv(WORKER_ROOT / ".env", override=False)
DATA_ROOT = Path(os.getenv("WORKER_DATA_DIR", str(WORKER_ROOT / ".data"))).resolve()

def worker_token() -> str:
    configured = os.getenv("WORKER_TOKEN", "").strip()
    if configured:
        if len(configured) < 32:
            raise RuntimeError("WORKER_TOKEN must contain at least 32 characters.")
        return configured
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    path = DATA_ROOT / "worker-token.txt"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(36), encoding="utf-8")
        try:
            path.chmod(0o600)
        except OSError:
            pass
    return path.read_text(encoding="utf-8").strip()

def allowed_origins() -> list[str]:
    defaults = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:4199,http://127.0.0.1:4199"
    return [value.strip().rstrip("/") for value in os.getenv("WORKER_ALLOWED_ORIGINS", defaults).split(",") if value.strip()]
