"""Human login under the same exclusive browser profile lease as research/MCP."""
from __future__ import annotations
import asyncio
from .browser_agent import ProfileLease, data_root

class ManualLogin:
    def __init__(self):
        self.task: asyncio.Task | None = None
        self.finished = asyncio.Event()
        self.message = ""

    @property
    def active(self) -> bool:
        return bool(self.task and not self.task.done())

    def status(self) -> dict:
        return {"active": self.active, "message": self.message}

    def start(self):
        if self.active:
            return
        self.finished = asyncio.Event()
        self.message = "Opening the isolated TikTok browser. Complete login yourself, then close it using the dashboard button."
        self.task = asyncio.create_task(self._run())

    async def _run(self):
        try:
            from playwright.async_api import async_playwright
            with ProfileLease(data_root() / "browser-owner.lock"):
                async with async_playwright() as playwright:
                    context = await playwright.chromium.launch_persistent_context(str(data_root() / "browser"), headless=False, accept_downloads=False)
                    try:
                        page = context.pages[0] if context.pages else await context.new_page()
                        await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=45_000)
                        self.message = "TikTok is open. Complete any login yourself. Access restrictions are not bypassed. Select Finish login when done."
                        try:
                            await asyncio.wait_for(self.finished.wait(), timeout=900)
                        except asyncio.TimeoutError:
                            pass
                    finally:
                        await context.close()
            self.message = "Manual browser closed. Its saved session will be reused for the next research run."
        except Exception as error:
            self.message = f"Manual browser could not remain open ({type(error).__name__}). Check installed Chromium and close any other browser owner."

    async def close(self):
        self.finished.set()
        if self.active:
            try:
                await asyncio.wait_for(asyncio.shield(self.task), timeout=5)
            except asyncio.TimeoutError:
                self.task.cancel()
