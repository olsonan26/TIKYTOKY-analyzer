from __future__ import annotations

import asyncio
import importlib.metadata
import os
import secrets
import shutil
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import DATA_ROOT, allowed_origins, worker_token
from .pipeline import run_research, run_local_media
from .store import JobStore
from .manual_login import ManualLogin
from .web_research import research_python
from .knowledge import run_knowledge

class ResearchRequest(BaseModel):
    projectId: str = Field(default="", max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=15, ge=1, le=30)
    periodDays: int = Field(default=7, ge=1, le=365)
    studyLimit: int = Field(default=3, ge=0, le=5)
    creators: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=10)
    hashtags: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=10)
    urls: list[Annotated[str, Field(max_length=2048)]] | None = Field(default=None, max_length=30)
    webResearch: bool = True
    creativeCenter: bool = True

TOKEN = worker_token()
store = JobStore(DATA_ROOT / "jobs.sqlite")
manual_login = ManualLogin()

def check_queue():
    if manual_login.active:
        raise HTTPException(409, "Finish the manual browser session before starting research or media jobs.")
    if sum(job["status"] in {"queued", "running", "cancel_requested"} for job in store.recent()) >= 3:
        raise HTTPException(429, "At most three jobs can be queued/running. One browser owner runs at a time.")

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
            runner = run_knowledge if job["request"].get("kind") == "knowledge" else run_local_media if job["request"].get("kind") == "local-media" else run_research
            result = await runner(job["request"], store, job["id"])
            if store.get(job["id"])["status"] == "cancel_requested":
                raise asyncio.CancelledError()
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
    await manual_login.close()

app = FastAPI(title="TIKY TOKY Local Research Worker", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(), allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type"], allow_credentials=False)

@app.middleware("http")
async def private_network_and_limits(request: Request, call_next):
    cap = 100_000_000 if request.url.path == "/v1/knowledge" else 50_000_000 if request.url.path == "/v1/media" else 16000
    try:
        length = int(request.headers.get("content-length", "0") or "0")
    except ValueError:
        return JSONResponse({"detail": "Invalid content length."}, status_code=400)
    if length > cap or length < 0:
        return JSONResponse({"detail": f"Request exceeds the {cap}-byte limit."}, status_code=413)
    if request.method == "POST" and request.url.path not in {"/v1/media","/v1/knowledge"}:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > cap:
                return JSONResponse({"detail": "Worker JSON requests are limited to 16 KB."}, status_code=413)
        request._body = bytes(body)
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
    return {"ready": all(versions.values()), "versions": versions, "aiConfigured": bool(os.getenv("OPENROUTER_API_KEY")), "model": os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4.1-flash"), "headless": os.getenv("WORKER_HEADLESS", "true") != "false", "primary": "browser-use", "cloudKeysRequired": False, "pendingJobs": sum(job["status"] in {"queued", "running", "cancel_requested"} for job in store.recent()), "researchRuntime": research_python().is_file(), "ffmpeg": bool(shutil.which("ffmpeg")), "ffprobe": bool(shutil.which("ffprobe")), "manualLogin": manual_login.status()}

@app.get("/v1/jobs", dependencies=[Depends(authenticate)])
def jobs():
    return {"jobs": store.recent(exclude_kind="knowledge")}

@app.post("/v1/knowledge", dependencies=[Depends(authenticate)])
async def upload_knowledge(request:Request, name:str="Knowledge book.pdf"):
    check_queue()
    name=name.replace("\\","/").split("/")[-1][:160]
    if not name.lower().endswith(".pdf"):
        raise HTTPException(415,"Large local book extraction accepts searchable PDF files.")
    directory=DATA_ROOT/"uploads"
    directory.mkdir(parents=True,exist_ok=True)
    path=directory/f"{uuid.uuid4().hex}.pdf"
    total=0
    try:
        with path.open("xb") as file:
            async for chunk in request.stream():
                total+=len(chunk)
                if total>100_000_000:raise HTTPException(413,"Choose a PDF smaller than 100 MB.")
                file.write(chunk)
        if not total:raise HTTPException(400,"Choose a nonempty PDF.")
        return store.create({"kind":"knowledge","subject":name,"name":name,"uploadPath":str(path)})
    except BaseException:
        path.unlink(missing_ok=True);raise

@app.post("/v1/jobs", dependencies=[Depends(authenticate)])
def create_job(request: ResearchRequest):
    check_queue()
    return store.create(request.model_dump())

@app.post("/v1/media", dependencies=[Depends(authenticate)])
async def upload_media(request: Request, projectId: str = ""):
    check_queue()
    if len(projectId) > 200:
        raise HTTPException(400, "Project identifier is too long.")
    directory = DATA_ROOT / "uploads"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{uuid.uuid4().hex}.upload"
    size = 0
    try:
        with path.open("xb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > 50_000_000:
                    raise HTTPException(413, "Choose a video smaller than 50 MB.")
                output.write(chunk)
        if not size:
            raise HTTPException(400, "Choose a nonempty video file.")
        return store.create({"kind": "local-media", "projectId": projectId, "subject": "Your uploaded draft", "uploadPath": str(path)})
    except BaseException:
        path.unlink(missing_ok=True)
        raise

@app.post("/v1/browser/login", dependencies=[Depends(authenticate)])
async def begin_login():
    if any(job["status"] in {"queued", "running", "cancel_requested"} for job in store.recent()):
        raise HTTPException(409, "Wait for current jobs to finish before opening manual login.")
    manual_login.start()
    return manual_login.status()

@app.post("/v1/browser/close", dependencies=[Depends(authenticate)])
async def finish_login():
    await manual_login.close()
    return manual_login.status()

@app.get("/v1/browser/login", dependencies=[Depends(authenticate)])
def login_status():
    return manual_login.status()

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
    if job["status"] == "queued" and job["request"].get("kind") in {"local-media","knowledge"}:
        from pathlib import Path
        path = Path(job["request"]["uploadPath"]).resolve()
        if path.parent == (DATA_ROOT / "uploads").resolve():
            path.unlink(missing_ok=True)
    return store.get(identifier)
