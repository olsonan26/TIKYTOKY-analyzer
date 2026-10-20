from __future__ import annotations

import asyncio
import importlib.metadata
import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import DATA_ROOT, allowed_origins, worker_token
from .pipeline import run_research
from .store import JobStore

class ResearchRequest(BaseModel):
    projectId: str = Field(default="", max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=15, ge=1, le=30)
    periodDays: int = Field(default=7, ge=1, le=365)
    studyLimit: int = Field(default=3, ge=0, le=5)
    creators: list[str] = Field(default_factory=list, max_length=10)
    hashtags: list[str] = Field(default_factory=list, max_length=10)
    webResearch: bool = True
    creativeCenter: bool = True

TOKEN = worker_token()
store = JobStore(DATA_ROOT / "jobs.sqlite")

def authenticate(authorization: Annotated[str | None, Header()] = None):
    provided = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(provided, TOKEN):
        raise HTTPException(401, "Pair the dashboard with this worker's local access token.")

async def consume():
    while True:
        job = store.next_queued()
        if not job:
            await asyncio.sleep(1)
            continue
        store.update(job["id"], "running")
        try:
            result = await run_research(job["request"], store, job["id"])
            store.update(job["id"], "blocked" if result.get("blocked") else "completed", result=result)
        except asyncio.CancelledError:
            store.update(job["id"], "cancelled", error="Cancelled between bounded processing stages. Collected source events remain in the local log.")
            if asyncio.current_task().cancelling():
                raise
        except Exception as error:
            # Third-party exceptions can contain cookies or keys. Do not echo their raw bodies.
            store.update(job["id"], "failed", error=f"Research stopped ({type(error).__name__}). Review the stage log and dependency/login setup; no successful result was fabricated.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="TIKY TOKY Local Research Worker", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(), allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"], allow_credentials=False)

@app.middleware("http")
async def private_network_and_limits(request: Request, call_next):
    if int(request.headers.get("content-length", "0") or "0") > 16000:
        return JSONResponse({"detail": "Worker requests are limited to 16 KB."}, status_code=413)
    response = await call_next(request)
    if request.headers.get("origin", "").rstrip("/") in allowed_origins():
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response

@app.get("/health")
def health():
    return {"service": "tikytoky-worker", "version": "0.1.0"}

@app.get("/v1/status", dependencies=[Depends(authenticate)])
def status():
    versions = {}
    for name in ["browser-use", "TikTokApi", "faster-whisper", "yt-dlp"]:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return {"ready": all(versions.values()), "versions": versions, "aiConfigured": bool(os.getenv("OPENROUTER_API_KEY")), "model": os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4.1-flash"), "headless": os.getenv("WORKER_HEADLESS", "true") != "false", "primary": "browser-use", "cloudKeysRequired": False, "pendingJobs": sum(job["status"] in {"queued", "running"} for job in store.recent())}

@app.get("/v1/jobs", dependencies=[Depends(authenticate)])
def jobs():
    return {"jobs": store.recent()}

@app.post("/v1/jobs", dependencies=[Depends(authenticate)])
def create_job(request: ResearchRequest):
    if sum(job["status"] in {"queued", "running"} for job in store.recent()) >= 3:
        raise HTTPException(429, "At most three jobs can be queued/running. One browser owner runs at a time.")
    return store.create(request.model_dump())

@app.get("/v1/jobs/{identifier}", dependencies=[Depends(authenticate)])
def get_job(identifier: str):
    job = store.get(identifier)
    if not job:
        raise HTTPException(404, "Job not found.")
    return job

@app.post("/v1/jobs/{identifier}/cancel", dependencies=[Depends(authenticate)])
def cancel_job(identifier: str):
    job = get_job(identifier)
    if job["status"] not in {"queued", "running"}:
        return job
    store.update(identifier, "cancelled" if job["status"] == "queued" else "cancel_requested", error="Cancellation requested; an active bounded operation may finish before stopping.")
    return store.get(identifier)
