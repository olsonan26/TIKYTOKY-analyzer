"""Observed TikTok metadata with a bounded, optional TikTok-Api secondary adapter.

No LLM generates counters. The optional API path uses the upstream library with a
plain page factory (no added stealth scripts, proxy rotation or challenge solver).
"""
from __future__ import annotations

import asyncio
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_tiktok(url: str) -> str | None:
    import re
    try:
        parsed = urlparse(url)
        match = re.fullmatch(r"/@([A-Za-z0-9._]{1,64})/video/(\d{5,30})/?", parsed.path)
        if parsed.scheme != "https" or parsed.hostname not in {"tiktok.com", "www.tiktok.com", "m.tiktok.com"} or parsed.port or parsed.username or not match:
            return None
        return f"https://www.tiktok.com/@{match[1]}/video/{match[2]}"
    except (ValueError, TypeError):
        return None


def counter(value: Any) -> int | float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        if isinstance(value, str) and (not value or any(character not in "0123456789." for character in value)):
            return None
        number = float(value)
        return int(number) if math.isfinite(number) and number >= 0 and number.is_integer() else number if math.isfinite(number) and number >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def normalize_tiktok(raw: dict[str, Any], *, observed_at: str | None = None, source: str = "TikTok public page hydration", fallback_url: str | None = None) -> dict[str, Any] | None:
    identifier = str(raw.get("id") or "")
    author = raw.get("author") if isinstance(raw.get("author"), dict) else {}
    creator = str(author.get("uniqueId") or author.get("unique_id") or "")
    url = canonical_tiktok(f"https://www.tiktok.com/@{creator}/video/{identifier}") or canonical_tiktok(fallback_url or "")
    if not url:
        return None
    identifier = url.rsplit("/", 1)[-1]
    creator = url.split("/@", 1)[-1].split("/", 1)[0]
    stats = raw.get("statsV2") or raw.get("stats") or {}
    stats = stats if isinstance(stats, dict) else {}
    media = raw.get("video") if isinstance(raw.get("video"), dict) else {}
    author_stats = raw.get("authorStats") if isinstance(raw.get("authorStats"), dict) else {}
    published = None
    timestamp = counter(raw.get("createTime"))
    if timestamp is not None:
        try:
            created = datetime.fromtimestamp(timestamp, timezone.utc)
            if 2000 <= created.year <= datetime.now(timezone.utc).year + 1:
                published = created.isoformat().replace("+00:00", "Z")
        except (ValueError, OverflowError, OSError):
            pass
    observed_at = observed_at or now_iso()
    result: dict[str, Any] = {
        "id": identifier, "url": url, "platform": "tiktok",
        "title": str(raw.get("desc") or "Untitled TikTok video")[:10_000], "creator": creator,
        "publishedAt": published, "duration": counter(media.get("duration")),
        "followers": counter(author_stats.get("followerCount")),
        "snapshots": [{"observedAt": observed_at, "views": counter(stats.get("playCount")), "likes": counter(stats.get("diggCount")), "comments": counter(stats.get("commentCount")), "shares": counter(stats.get("shareCount")), "source": source}],
        "source": source, "fetchedAt": observed_at,
    }
    for field, value in [("thumbnail", media.get("cover") or media.get("originCover")), ("mediaUrl", media.get("downloadAddr") or media.get("playAddr"))]:
        if isinstance(value, str) and urlparse(value).scheme == "https":
            result[field] = value
    return result


def hydration_videos(payload: dict[str, Any], fallback_url: str | None = None) -> list[dict[str, Any]]:
    """Read the same public hydration structures audited in TikTok-Api.video.info.

    This helper does not call TikTok-Api and is labeled accordingly in provenance.
    """
    candidates: list[Any] = []
    scope = payload.get("__DEFAULT_SCOPE__", {})
    if isinstance(scope, dict):
        detail = scope.get("webapp.video-detail", {})
        if isinstance(detail, dict):
            info = detail.get("itemInfo", {})
            if isinstance(info, dict):
                candidates.append(info.get("itemStruct"))
    module = payload.get("ItemModule", {})
    if isinstance(module, dict):
        candidates.extend(module.values())
    result = []
    for raw in candidates:
        if isinstance(raw, dict):
            normalized = normalize_tiktok(raw, fallback_url=fallback_url)
            if normalized:
                result.append(normalized)
    return result


class TikTokMetadataAdapter:
    def normalize(self, raw: dict[str, Any], observed_at: str | None = None, source: str = "TikTok-Api supplied metadata") -> dict[str, Any] | None:
        return normalize_tiktok(raw, observed_at=observed_at, source=source)

    async def collect_public(self, urls: list[str], emit: Callable[[str], None] = lambda _: None) -> dict[str, Any]:
        return await enrich_videos([{"url": url} for url in urls], emit)


async def enrich_videos(videos: list[dict[str, Any]], emit: Callable[[str], None] = lambda _: None) -> dict[str, Any]:
    """Actually invoke TikTok-Api in a separate owned context when opted in.

    A CAPTCHA, login gate, denied/empty response or missing installed dependency
    is reported; it does not trigger another identity, stealth patch or retry.
    """
    if os.getenv("TIKTOK_API_ENABLED", "false").lower() != "true":
        return {"videos": videos, "warnings": ["TikTok-Api secondary enrichment is disabled. Set TIKTOK_API_ENABLED=true to opt in; public browser metadata remains separately labeled."], "blocked": False}
    try:
        from TikTokApi import TikTokApi
        from .browser_agent import ProfileLease, blocked_page, data_root
    except ImportError:
        return {"videos": videos, "warnings": ["TikTok-Api is not installed; run the worker's optional browser setup."], "blocked": False}
    warnings: list[str] = []
    updated = list(videos)
    profile = data_root() / "tiktok-api"
    profile.mkdir(parents=True, exist_ok=True)
    lease = ProfileLease(data_root() / "tiktok-api-owner.lock")
    try:
        with lease:
            async with TikTokApi() as api:
                async def context_factory(playwright: Any) -> Any:
                    return await playwright.chromium.launch_persistent_context(str(profile), headless=os.getenv("WORKER_HEADLESS", "true").lower() != "false", accept_downloads=False)

                async def page_factory(context: Any) -> Any:
                    page = await context.new_page()
                    await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=20_000)
                    if await blocked_page(page):
                        raise RuntimeError("TikTok requires manual login or presents an access challenge.")
                    return page

                emit("Starting optional TikTok-Api metadata enrichment in its separate browser profile.")
                async with asyncio.timeout(90):
                    await api.create_sessions(num_sessions=1, headless=os.getenv("WORKER_HEADLESS", "true").lower() != "false", page_factory=page_factory, browser_context_factory=context_factory, enable_session_recovery=False, timeout=20_000)
                    for index, video in enumerate(updated[:20]):
                        url = canonical_tiktok(str(video.get("url", "")))
                        if not url:
                            continue
                        if await blocked_page(api.sessions[0].page):
                            raise RuntimeError("TikTok presents a login or access challenge.")
                        emit(f"Reading TikTok-Api metadata {index + 1}/{min(20, len(updated))}.")
                        response = await api.make_request(url="https://www.tiktok.com/api/item/detail/", params={"itemId": url.rsplit("/", 1)[-1]}, retries=1, exponential_backoff=False)
                        if not isinstance(response, dict) or response.get("status_code", response.get("statusCode", 0)) not in {0, "0"}:
                            raise RuntimeError("TikTok denied or could not return this public metadata request.")
                        raw = response.get("itemInfo", {}).get("itemStruct") if isinstance(response.get("itemInfo"), dict) else None
                        if not isinstance(raw, dict):
                            warnings.append("TikTok-Api returned no usable item metadata; existing observations were preserved.")
                            break
                        observed = normalize_tiktok(raw, source="TikTok-Api public item detail (separate owned session)", fallback_url=url)
                        if observed:
                            existing = video.get("snapshots") if isinstance(video.get("snapshots"), list) else []
                            updated[index] = {**video, **observed, "id": video.get("id") or observed["id"], "snapshots": existing + observed["snapshots"]}
    except TimeoutError:
        warnings.append("TikTok-Api enrichment reached its 90-second deadline. Partial observed results were kept; no retry was attempted.")
        return {"videos": updated, "warnings": warnings, "blocked": True}
    except Exception:
        # Upstream errors may contain cookies or response bodies; do not persist them.
        warnings.append("TikTok-Api could not complete enrichment (dependency, profile lock, login, challenge or denied response). Existing evidence was kept. Resolve access manually; no bypass or retry was attempted.")
        return {"videos": updated, "warnings": warnings, "blocked": True}
    return {"videos": updated, "warnings": warnings, "blocked": False}
