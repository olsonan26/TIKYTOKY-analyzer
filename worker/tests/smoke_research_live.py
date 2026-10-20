"""Opt-in billable integration smoke over a real public repository, not viral data."""
import asyncio
import contextlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tikytoky import config
from tikytoky.web_research import crawl_pages, synthesize

async def main():
    import httpx
    url = "https://github.com/browser-use/browser-use"
    with (config.DATA_ROOT / "research-live.log").open("w", encoding="utf-8") as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        rows, sources, warnings = await crawl_pages([{"url": url, "title": "Browser Use official repository"}], lambda _: None)
        crawl_ok = bool(rows)
        if not rows:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                response = await client.get("https://raw.githubusercontent.com/browser-use/browser-use/main/README.md")
                response.raise_for_status()
            rows = [{"url": url, "title": "Browser Use official README", "raw_content": response.text[:8000]}]
        report = await synthesize("Describe only Browser Use capabilities actually stated in the supplied official README; no market or TikTok performance claims.", rows, lambda _: None)
    result = {"scope": "Real official public software documentation, not viral-market evidence", "crawl4ai": crawl_ok, "crawlWarnings": warnings, "gptResearcher": bool(report), "reportCharacters": len(report), "knownSourceCited": url in report}
    (config.DATA_ROOT / "research-report.md").write_text(report, encoding="utf-8")
    print(json.dumps(result))

if __name__ == "__main__":
    config.DATA_ROOT.mkdir(parents=True, exist_ok=True)
    asyncio.run(main())
