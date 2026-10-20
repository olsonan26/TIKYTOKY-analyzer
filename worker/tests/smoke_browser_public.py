"""Explicit, paid opt-in browser smoke. Run manually, never as a unit test."""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


async def main() -> None:
    from tikytoky.config import DATA_ROOT  # Loads local configuration without displaying credentials.
    from tikytoky.browser_agent import BrowserAgent
    from tikytoky.tiktok_metadata import enrich_videos
    os.environ["BROWSER_AGENT_MAX_STEPS"] = "6"
    os.environ["WORKER_HEADLESS"] = "true"
    os.environ["BROWSER_USE_SETUP_LOGGING"] = "false"
    events: list[str] = []
    agent = BrowserAgent(lambda text: events.append(text))
    evidence: dict = {"checkedAt": datetime.now(timezone.utc).isoformat(), "subject": "astrology", "limit": 3, "maxSteps": 6, "paidModelCallsAuthorized": True}
    try:
        result = await agent.discover("astrology", 3, 30, "tiktok", creative_center=False)
        evidence["browser"] = result
        if result.get("videos"):
            evidence["secondary"] = await enrich_videos(result["videos"][:1], lambda text: events.append(text))
    except Exception as error:
        evidence["errorType"] = type(error).__name__
        evidence["error"] = re.sub(r"sk-[A-Za-z0-9_-]+", "[redacted]", str(error))[:500]
    finally:
        await agent.close()
    evidence["events"] = events
    destination = Path(__file__).resolve().parents[2] / "docs" / "research" / "browser-public-smoke.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"evidenceFile": str(destination), "videoCount": len(evidence.get("browser", {}).get("videos", [])), "blocked": evidence.get("browser", {}).get("blocked"), "errorType": evidence.get("errorType")}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
