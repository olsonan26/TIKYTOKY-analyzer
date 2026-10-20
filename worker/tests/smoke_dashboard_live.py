"""Opt-in local UI/worker smoke. Requires an actual supplied recorded-speech clip."""
import asyncio
import json
from pathlib import Path
import sys
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]

async def main():
    clip=Path(sys.argv[1]).resolve(strict=True)
    token=(ROOT/"worker/.data/worker-token.txt").read_text().strip()
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(headless=True)
        context=await browser.new_context(viewport={"width":1440,"height":1000})
        page=await context.new_page()
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        await page.goto("http://localhost:4199/",wait_until="networkidle",timeout=90000)
        await page.get_by_role("heading",name="Autonomous research, from real evidence.").wait_for()
        await page.screenshot(path=str(ROOT/"worker/.data/dashboard-desktop.png"),full_page=True)
        await page.get_by_label("Local access token").fill(token)
        await page.get_by_role("button",name="Connect worker",exact=True).click()
        await page.get_by_text("Worker connected:",exact=False).wait_for(timeout=30000)
        await page.get_by_role("button",name="Improve my video",exact=True).click()
        await page.locator('input[type="file"][accept="video/*"]').first.set_input_files(str(clip))
        await page.wait_for_function("""() => {const raw=localStorage.getItem('tiky-toky-workspace-v1');if(!raw)return false;const w=JSON.parse(raw);return w.projects.some(p=>p.draft?.transcriptSegments?.length && p.draft?.visualNotes);} """,timeout=180000)
        result=await page.evaluate("""() => {const w=JSON.parse(localStorage.getItem('tiky-toky-workspace-v1'));const d=w.projects.find(p=>p.draft?.transcript)?.draft;return {speechCharacters:d.transcript.length,segments:d.transcriptSegments.length,visualNotes:Boolean(d.visualNotes),frameBytesSaved:Boolean(d.frames?.length),marketSnapshots:d.snapshots.length};}""")
        assert result["speechCharacters"] > 20 and result["segments"] > 0
        assert result["visualNotes"] and not result["frameBytesSaved"] and result["marketSnapshots"] == 0
        await page.screenshot(path=str(ROOT/"worker/.data/dashboard-upload-verified.png"),full_page=True)
        await page.set_viewport_size({"width":390,"height":844})
        await page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        await page.get_by_role("button",name="Open navigation",exact=True).click()
        await page.get_by_role("button",name="Posting plan",exact=True).click()
        await page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        await page.screenshot(path=str(ROOT/"worker/.data/dashboard-mobile.png"),full_page=True)
        overflow=await page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
        assert not overflow, "Mobile page has horizontal overflow."
        assert not errors, f"Browser errors: {errors}"
        print(json.dumps({"dashboardPairing":"passed","actualFileUpload":"passed","localASR":"passed","actualFrameVision":"passed","draftSaved":"passed","mobileOverflow":False,"consoleErrors":len(errors),**result}))
        await context.close()
        await browser.close()

if __name__=="__main__":
    asyncio.run(main())
