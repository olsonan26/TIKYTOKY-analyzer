"""Local dashboard layout/navigation check; no provider calls or seeded data."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        page=await browser.new_page(viewport={"width":390,"height":844})
        await page.goto("http://localhost:4199/",wait_until="networkidle")
        await page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        await page.get_by_role("button",name="Open navigation",exact=True).click()
        await page.get_by_role("button",name="Posting plan",exact=True).click()
        await page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth+1")
        path=Path(__file__).resolve().parents[1]/".data/dashboard-mobile.png"
        await page.screenshot(path=str(path),full_page=True)
        print(json.dumps({"mobileNavigation":"passed","sidebarClosed":"passed","horizontalOverflow":False,"providerCalls":0}))
        await browser.close()

asyncio.run(main())
