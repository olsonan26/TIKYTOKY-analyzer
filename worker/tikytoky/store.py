from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

class JobStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.db:
            self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, request TEXT NOT NULL, result TEXT, error TEXT, events TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
            self.db.execute("CREATE TABLE IF NOT EXISTS observations (url TEXT NOT NULL, observed_at TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(url, observed_at))")
            # A crash cannot leave a job falsely shown as still running forever.
            self.db.execute("UPDATE jobs SET status='interrupted', error='Worker restarted during this job; review partial events and start a fresh run.' WHERE status='running'")

    def create(self, request: dict[str, Any]) -> dict[str, Any]:
        identifier = str(uuid.uuid4())
        now = utc_now()
        with self.lock, self.db:
            self.db.execute("INSERT INTO jobs VALUES (?, 'queued', ?, NULL, NULL, '[]', ?, ?)", (identifier, json.dumps(request), now, now))
        return self.get(identifier)

    def get(self, identifier: str) -> dict[str, Any] | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM jobs WHERE id=?", (identifier,)).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "status": row["status"], "request": json.loads(row["request"]), "result": json.loads(row["result"]) if row["result"] else None, "error": row["error"], "events": json.loads(row["events"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def recent(self) -> list[dict[str, Any]]:
        with self.lock:
            ids = [row[0] for row in self.db.execute("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 30")]
        return [self.get(identifier) for identifier in ids]

    def next_queued(self) -> dict[str, Any] | None:
        with self.lock:
            row = self.db.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
        return self.get(row[0]) if row else None

    def update(self, identifier: str, status: str, *, result: dict | None = None, error: str | None = None):
        with self.lock, self.db:
            self.db.execute("UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?", (status, json.dumps(result) if result is not None else None, error, utc_now(), identifier))

    def event(self, identifier: str, message: str):
        with self.lock, self.db:
            row = self.db.execute("SELECT events FROM jobs WHERE id=?", (identifier,)).fetchone()
            if row:
                events = json.loads(row[0])
                events.append({"at": utc_now(), "message": message[:2000]})
                self.db.execute("UPDATE jobs SET events=?, updated_at=? WHERE id=?", (json.dumps(events[-200:]), utc_now(), identifier))

    def append_history(self, videos: list[dict]) -> list[dict]:
        with self.lock, self.db:
            for video in videos:
                for snapshot in video.get("snapshots", []):
                    if snapshot.get("observedAt"):
                        self.db.execute("INSERT OR IGNORE INTO observations VALUES (?, ?, ?)", (video["url"], snapshot["observedAt"], json.dumps(snapshot)))
                rows = self.db.execute("SELECT snapshot FROM observations WHERE url=? ORDER BY observed_at DESC LIMIT 100", (video["url"],)).fetchall()
                video["snapshots"] = [json.loads(row[0]) for row in reversed(rows)]
        return videos
