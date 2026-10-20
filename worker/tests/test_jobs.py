from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient
from tikytoky.store import JobStore
from tikytoky.pipeline import filter_dates
from tikytoky import server

def test_history_and_restart_preserve_real_observations(tmp_path):
    path = tmp_path / "jobs.sqlite"
    store = JobStore(path)
    job = store.create({"subject":"Explicit test fixture"})
    store.update(job["id"], "cancel_requested")
    rows=[{"url":"https://www.tiktok.com/@fixture/video/123456", "snapshots":[{"observedAt":"2026-10-20T01:00:00Z", "views":0, "likes":None}]}]
    store.append_history(rows)
    restored = JobStore(path)
    assert restored.get(job["id"])["status"] == "interrupted"
    assert restored.append_history([{"url":rows[0]["url"], "snapshots":[]}])[0]["snapshots"] == rows[0]["snapshots"]

def test_exact_window_rejects_unknown_old_and_future_dates():
    rows=[{"publishedAt":value} for value in ["2026-10-19T03:00:00Z",None,"2026-10-10T03:00:00Z","2026-10-21T03:00:00Z"]]
    kept,warnings=filter_dates(rows,1,datetime(2026,10,20,tzinfo=timezone.utc))
    assert kept == rows[:1]
    assert any("unavailable" in warning for warning in warnings)

def test_worker_auth_origins_queue_and_upload_limits(tmp_path, monkeypatch):
    monkeypatch.setattr(server,"store",JobStore(tmp_path / "jobs.sqlite"))
    monkeypatch.setattr(server,"DATA_ROOT",tmp_path)
    client=TestClient(server.app)
    headers={"Authorization":f"Bearer {server.TOKEN}"}
    assert client.get("/v1/status").status_code == 401
    assert client.get("/health").json()["service"] == "tikytoky-worker"
    status=client.get("/v1/status",headers=headers)
    assert status.status_code == 200 and "OPENROUTER_API_KEY" not in status.text
    allowed=client.options("/v1/jobs",headers={"Origin":"http://localhost:3000","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"Authorization,Content-Type"})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-private-network"] == "true"
    denied=client.options("/v1/jobs",headers={"Origin":"https://untrusted.invalid","Access-Control-Request-Method":"POST"})
    assert "access-control-allow-origin" not in denied.headers
    invalid=client.post("/v1/jobs",headers=headers,json={"subject":"niche","creators":["x"*201]})
    assert invalid.status_code == 422
    too_big=client.post("/v1/media",headers={**headers,"Content-Length":"50000001"},content=b"x")
    assert too_big.status_code == 413
    empty=client.post("/v1/media",headers=headers,content=b"")
    assert empty.status_code == 400
    assert not list((tmp_path / "uploads").glob("*"))
    job=client.post("/v1/jobs",headers=headers,json={"subject":"Explicit unit fixture","studyLimit":0}).json()
    assert job["status"] == "queued"
    cancelled=client.post(f"/v1/jobs/{job['id']}/cancel",headers=headers).json()
    assert cancelled["status"] == "cancelled"

def test_local_upload_is_queued_and_cancelled_file_removed(tmp_path,monkeypatch):
    monkeypatch.setattr(server,"store",JobStore(tmp_path / "jobs.sqlite"))
    monkeypatch.setattr(server,"DATA_ROOT",tmp_path)
    client=TestClient(server.app)
    headers={"Authorization":f"Bearer {server.TOKEN}"}
    response=client.post("/v1/media?projectId=fixture",headers=headers,content=b"explicit upload validation fixture, not real video")
    assert response.status_code == 200
    job=response.json()
    path=Path(job["request"]["uploadPath"])
    assert path.is_file()
    client.post(f"/v1/jobs/{job['id']}/cancel",headers=headers)
    assert not path.exists()
