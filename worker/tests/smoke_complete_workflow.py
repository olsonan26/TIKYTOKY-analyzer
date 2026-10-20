"""Opt-in billable UI smoke with isolated browser storage and labeled test content.

Usage: worker/.venv/Scripts/python.exe worker/tests/smoke_complete_workflow.py CLIP
Requires the local dashboard and paired worker. Never uses a TikTok profile.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit

from dotenv import dotenv_values
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_KEY = "tiky-toky-workspace-v1"
SUBJECT = "Software validation: explain an evidence checklist"
KNOWLEDGE = """SOFTWARE VALIDATION MATERIAL ONLY — NOT A REAL PRODUCT OR MARKET CLAIM.
Evidence Practice is the name of this fictional internal software validation workshop.
Its three-step checklist is: write one concrete observation, name one uncertainty, and choose one small test.
An observation describes something directly visible or audible in the supplied material.
An uncertainty names information the supplied material cannot establish.
A small test changes one specific choice and then checks the result.
The checklist is a thinking exercise; it does not guarantee attention, retention, views, or revenue.
The requested next action is to save the three-step checklist.
No astrology, numerology, medical, financial, audience-performance, or research-study claims are supplied.
"""


def save_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


async def main() -> None:
    clip = Path(sys.argv[1]).resolve(strict=True)
    output = ROOT / "worker/.data" / ("complete-workflow-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    output.mkdir(parents=True, exist_ok=False)
    knowledge_file = output / "SOFTWARE-VALIDATION-KNOWLEDGE.md"
    knowledge_file.write_text(KNOWLEDGE, encoding="utf-8")
    speech = json.loads((ROOT / "worker/.data/live-media-jfk/result.json").read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    source_url = "https://github.com/SYSTRAN/faster-whisper/blob/9e472ae9de8bb374552f531f752654554b76b2d6/tests/data/jfk.flac"
    reference = {
        "id": "validation-real-recorded-jfk",
        "url": source_url,
        "title": "SOFTWARE VALIDATION reference: genuine recorded JFK excerpt, no market metrics",
        "creator": "John F. Kennedy — recorded speech fixture",
        "publishedAt": None, "duration": 11, "followers": None,
        "transcript": speech["transcript"], "transcriptSegments": speech["transcriptSegments"],
        "transcriptSource": "Verified local faster-whisper/tiny CPU/int8 on official recorded fixture",
        "snapshots": [],
        "source": "Official faster-whisper recorded fixture; non-market software test, no virality claim",
        "fetchedAt": now,
    }
    references = [reference]
    if len(sys.argv) > 2:
        discovered = json.loads(Path(sys.argv[2]).resolve(strict=True).read_text(encoding="utf-8"))
        if isinstance(discovered, dict) and isinstance(discovered.get("result"), dict):
            discovered = discovered["result"]
        discovered = discovered.get("videos", []) if isinstance(discovered, dict) else discovered
        assert isinstance(discovered, list), "Expected actual provider video evidence."
        references += discovered[:5]
    allowed_sources = {item["id"] for item in references}
    summary: dict = {
        "startedAt": now,
        "scope": "Isolated local software workflow; genuine recorded speech, fictional labeled knowledge, no viral-performance verification",
        "source": source_url,
        "stages": {},
        "apiResponses": [],
        "consoleErrors": [],
    }
    started = time.monotonic()

    def stage(name: str, details: object = "passed") -> None:
        summary["stages"][name] = details
        save_json(output / "summary.json", summary)
        print(json.dumps({"stage": name, "result": details}), flush=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:4199/")
        if dashboard_url.startswith("https://"):
            # Represents the human granting this dashboard's documented local-
            # network permission; never disables browser security globally.
            await context.grant_permissions(["local-network-access"], origin=dashboard_url.rstrip("/"))
        page = await context.new_page()
        page.on("pageerror", lambda error: summary["consoleErrors"].append(str(error)))
        page.on("response", lambda response: summary["apiResponses"].append({"path": urlsplit(response.url).path, "status": response.status}) if "/api/" in response.url or "/v1/" in response.url else None)

        async def project() -> dict:
            return await page.evaluate("""key => {const w=JSON.parse(localStorage.getItem(key)); return w.projects.find(p=>p.id===w.activeId) || w.projects.at(-1);} """, WORKSPACE_KEY)

        async def api_click(path: str, button, artifact: str, timeout: int = 300000) -> dict:
            async with page.expect_response(lambda response: urlsplit(response.url).path == path and response.request.method == "POST", timeout=timeout) as pending:
                await button.click()
            response = await pending.value
            value = await response.json()
            save_json(output / artifact, value)
            if path == "/api/scripts" and response.status == 502 and "Knowledge verification found unsupported" in value.get("error", ""):
                stage("unsupportedScriptRejected", {"attempt":1,"saved":False})
                async with page.expect_response(lambda r: urlsplit(r.url).path == path and r.request.method == "POST",timeout=timeout) as retry:
                    await button.click()
                response=await retry.value
                value=await response.json()
                save_json(output / artifact,value)
            assert response.ok, f"{path} failed ({response.status}): {value.get('error', 'see private artifact')}"
            return value

        try:
            await page.goto(os.getenv("DASHBOARD_URL", "http://localhost:4199/"), wait_until="networkidle", timeout=90000)
            if await page.get_by_label("Workspace password", exact=True).count():
                password = dotenv_values(ROOT / ".env.local").get("APP_PASSWORD")
                saved_password=ROOT / "worker/.data/dashboard-password.txt"
                if not password and saved_password.is_file():
                    password=saved_password.read_text().strip()
                assert password, "Dashboard password is required but unavailable locally."
                await page.get_by_label("Workspace password", exact=True).fill(password)
                await page.get_by_role("button", name="Open workspace", exact=True).click()
            await page.get_by_role("heading", name="Autonomous research, from real evidence.").wait_for(timeout=30000)
            token = (ROOT / "worker/.data/worker-token.txt").read_text().strip()
            await page.get_by_label("Local access token").fill(token)
            await page.get_by_role("button", name="Connect worker", exact=True).click()
            await page.get_by_text("Worker connected:", exact=False).wait_for(timeout=30000)
            stage("workerPairing")

            await page.get_by_role("button", name="Your knowledge", exact=True).click()
            async with page.expect_response(lambda response: urlsplit(response.url).path == "/api/knowledge" and response.request.method == "POST", timeout=60000) as pending:
                await page.locator('input[type="file"][accept=".txt,.md,.json,.pdf,.docx"]').set_input_files(str(knowledge_file))
            response = await pending.value
            assert response.ok, "Knowledge upload route rejected validation Markdown."
            document = (await response.json())["document"]
            assert document["text"].strip() == KNOWLEDGE.strip()
            await page.get_by_role("heading", name=knowledge_file.name, exact=True).wait_for()
            stage("knowledgeUpload", {"characters": len(document["text"]), "exactTextPreserved": True})

            await page.get_by_role("button", name="Video research", exact=True).click()
            await page.get_by_label("Research subject", exact=True).fill(SUBJECT)
            await page.get_by_role("button", name="Import videos", exact=True).first.click()
            await page.get_by_role("button", name="Import JSON", exact=True).click()
            await page.get_by_label("Video JSON", exact=True).fill(json.dumps(references))
            await page.get_by_role("button", name="Import collection", exact=True).click()
            await page.get_by_label("Select " + reference["title"], exact=True).check()
            research = await api_click("/api/analyze", page.get_by_role("button", name="Analyze selected", exact=True), "research.json")
            assert set(research["sourceIds"]) == allowed_sources
            assert next(item for item in research["videos"] if item["videoId"] == reference["id"])["evidenceLevel"] == "transcript"
            assert research["limitations"]
            stage("actualAiResearch", {"model": research["model"], "patterns": len(research["patterns"]), "sourceIdsVerified": True, "recordedFixtureEvidenceLevel": "transcript", "actualPublicProviderReferences": len(references)-1})

            await page.get_by_role("button", name="Script studio", exact=True).click()
            await page.get_by_label("Subject", exact=True).fill("Explain the Evidence Practice three-step checklist; software validation only")
            await page.get_by_label("Audience", exact=True).fill("Adults practicing evidence-based observation in a fictional internal software test")
            await page.get_by_label("Brand or creator (optional)", exact=True).fill("Evidence Practice — SOFTWARE VALIDATION ONLY")
            await page.get_by_label("What are you offering?", exact=False).fill("A fictional internal thinking exercise, using only the uploaded three-step checklist. Do not imply real market success.")
            await page.get_by_label("Call to action", exact=False).fill("Save the three-step checklist.")
            await page.get_by_label("Duration", exact=True).fill("20")
            await page.get_by_label("Variations", exact=False).select_option("1")
            batch = await api_click("/api/scripts", page.get_by_role("button", name="Generate original scripts", exact=True), "scripts.json")
            assert len(batch["scripts"]) == 1
            script = batch["scripts"][0]
            assert script["sourceIds"] and set(script["sourceIds"]) <= allowed_sources
            assert script["knowledgeCitations"], "Generated script has no knowledge citations."
            for citation in script["knowledgeCitations"]:
                assert citation["documentId"] == document["id"]
                normalize = lambda text: " ".join(text.split()).casefold()
                assert normalize(citation["quote"]) in normalize(document["text"])
            assert script["beats"] and script["caption"] and script["cta"] and script["hashtags"]
            await page.get_by_role("heading", name=script["title"], exact=True).wait_for()
            async with page.expect_download() as downloaded:
                await page.get_by_role("button", name="Download", exact=True).click()
            await (await downloaded.value).save_as(output / "scripts-export.md")
            exported = (output / "scripts-export.md").read_text(encoding="utf-8")
            assert script["title"] in exported and script["knowledgeCitations"][0]["quote"] in exported
            stage("actualAiScriptsAndExport", {"model": batch["model"], "scripts": 1, "citationsVerified": len(script["knowledgeCitations"]), "markdownExport": True})
            await page.screenshot(path=str(output / "scripts.png"), full_page=True)

            await page.get_by_role("button", name="Improve my video", exact=True).click()
            await page.locator('input[type="file"][accept="video/*"]').first.set_input_files(str(clip))
            await page.wait_for_function("""key => {const w=JSON.parse(localStorage.getItem(key)); return w.projects.some(p=>p.draft?.transcriptSegments?.length && p.draft?.visualNotes);} """, arg=WORKSPACE_KEY, timeout=900000)
            draft_project = await project()
            draft = draft_project["draft"]
            assert draft["transcriptSegments"] and draft["visualNotes"] and not draft.get("frames") and not draft["snapshots"]
            assert clip.is_file(), "Worker deleted original source clip."
            stage("actualWorkerUploadAsrVision", {"segments": len(draft["transcriptSegments"]), "visualNotes": True, "storedFrameBytes": False, "snapshots": 0, "originalPreserved": True})
            coaching = await api_click("/api/coach", page.get_by_role("button", name="Compare & improve my video", exact=True), "coaching.json")
            assert coaching["verdict"] and coaching["fixes"] and coaching["limitations"]
            assert all(set(fix["referenceVideoIds"]) <= allowed_sources for fix in coaching["fixes"])
            await page.get_by_role("heading", name="Your creative review", exact=True).wait_for()
            stage("actualAiDraftCoaching", {"model": coaching["model"], "fixes": len(coaching["fixes"]), "referenceIdsVerified": True})

            await page.get_by_role("button", name="Posting plan", exact=True).click()
            plan = await api_click("/api/plan", page.get_by_role("button", name="Build my posting plan", exact=True), "plan.json")
            assert plan["timezone"] == "America/Denver" and plan["timingBasis"] == "experiment"
            assert len(plan["schedule"]) == 7
            assert all("MDT" in slot["localLabel"] or "MST" in slot["localLabel"] for slot in plan["schedule"])
            stage("utahPostingPlan", {"timezone": plan["timezone"], "timingBasis": "experiment", "futureWindows": len(plan["schedule"]), "measuredDurationSample": plan["duration"]["sampleSize"]})

            await page.get_by_role("button", name="Your results", exact=True).click()
            await page.get_by_label("Script title", exact=True).fill("SOFTWARE VALIDATION ONLY — not a published outcome")
            await page.get_by_label("Published video URL", exact=True).fill("https://example.com/tikytoky-validation-not-published")
            # Windows Python lacks system tzdata; use the actual browser's IANA
            # implementation, as the product does, instead of a fixed UTC offset.
            previous_day = await page.evaluate("""() => {const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Date.now()-86400000)).map(p=>[p.type,p.value]));return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;}""")
            await page.get_by_label("Published (Utah time)", exact=True).fill(previous_day)
            await page.get_by_label("Notes", exact=False).fill("Internal form/storage validation only. No real post or performance measurement. Zero views is an explicit input fixture; other metrics intentionally unavailable.")
            await page.get_by_role("button", name="Record observation", exact=True).click()
            await page.get_by_text("Record at least one observed performance metric.",exact=True).wait_for()
            stage("emptyOutcomeRejected")
            await page.get_by_label("views",exact=True).fill("0")
            await page.get_by_role("button", name="Record observation", exact=True).click()
            await page.wait_for_function("""key => JSON.parse(localStorage.getItem(key)).projects.some(p=>p.outcomes.length===1)""", arg=WORKSPACE_KEY)
            final_project = await project()
            observation = final_project["outcomes"][0]
            assert observation["snapshots"][0]["views"] == 0
            assert all(observation["snapshots"][0][key] is None for key in ["likes", "comments", "shares"])
            assert "not a published outcome" in observation["scriptTitle"]
            stage("outcomeFormAndMissingMetrics", {"recordType": "explicit validation-only input fixture in temporary browser; not a real published outcome", "views":0, "otherCounters": None})

            # Saving an outcome intentionally invalidates a prior plan. Rebuild before backup.
            await page.get_by_role("button", name="Posting plan", exact=True).click()
            await api_click("/api/plan", page.get_by_role("button", name="Build my posting plan", exact=True), "plan-after-null-outcome.json")
            async with page.expect_download() as downloaded:
                await page.get_by_role("button", name="Export project", exact=True).click()
            backup_path = output / "project-backup.json"
            await (await downloaded.value).save_as(backup_path)
            backup = json.loads(backup_path.read_text(encoding="utf-8"))
            saved = backup["project"]
            assert saved["research"] and saved["scripts"] and saved["coaching"] and saved["plan"] and saved["knowledge"] and saved["draft"] and saved["outcomes"]
            assert not saved["draft"].get("frames") and not saved["videos"][0]["snapshots"]
            assert token not in backup_path.read_text(encoding="utf-8")
            old_id = saved["id"]
            await page.locator('input[type="file"][accept=".json,application/json"]').first.set_input_files(str(backup_path))
            await page.get_by_text("Backup restored as a separate browser-saved project.", exact=True).wait_for()
            restored = await project()
            assert restored["id"] != old_id
            for key in ["research", "scripts", "coaching", "plan", "knowledge", "draft", "outcomes", "videos"]:
                assert restored[key] == saved[key], f"Backup restoration changed {key}."
            await page.reload(wait_until="networkidle")
            persisted = await project()
            assert persisted["id"] == restored["id"] and persisted["scripts"] == saved["scripts"]
            stage("backupRestoreAndReload", {"allEightCollectionsPreserved": True, "separateProjectId": True, "workerTokenExcluded": True, "frameBytesExcluded": True})
            assert not summary["consoleErrors"], "Browser runtime errors were recorded."
            summary["status"] = "passed"
        except BaseException as error:
            summary["status"] = "failed"
            summary["failure"] = {"type": type(error).__name__, "message": str(error)[:1800]}
            await page.screenshot(path=str(output / "failure.png"), full_page=True)
            raise
        finally:
            summary["elapsedSeconds"] = round(time.monotonic() - started, 2)
            save_json(output / "summary.json", summary)
            print(json.dumps({"status": summary.get("status"), "evidenceDirectory": str(output), "elapsedSeconds": summary["elapsedSeconds"]}), flush=True)
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
