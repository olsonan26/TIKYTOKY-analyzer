from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
from .config import DATA_ROOT, worker_token

def main():
    parser = argparse.ArgumentParser(description="Run the integrated TIKY TOKY local research worker.")
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve")
    serve.add_argument("--port", type=int, default=8765)
    commands.add_parser("token")
    login = commands.add_parser("login")
    login.add_argument("--url", default="https://www.tiktok.com/")
    mcp = commands.add_parser("mcp")
    mcp.add_argument("--port", type=int, default=8931)
    args = parser.parse_args()
    os.environ.setdefault("WORKER_DATA_DIR", str(DATA_ROOT))
    os.environ.setdefault("TIKTOK_API_ENABLED", "true")
    os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")
    os.environ.setdefault("BROWSER_USE_CLOUD_SYNC", "false")
    if args.command == "token":
        print(worker_token())
    elif args.command == "serve":
        import uvicorn
        worker_token()
        print(f"Local worker listening on http://127.0.0.1:{args.port}; pairing token file: {DATA_ROOT / 'worker-token.txt'}")
        uvicorn.run("tikytoky.server:app", host="127.0.0.1", port=args.port, workers=1, log_level="warning")
    elif args.command == "login":
        from urllib.parse import urlsplit
        if urlsplit(args.url).hostname not in {"www.tiktok.com", "tiktok.com", "ads.tiktok.com"}:
            parser.error("Manual login is limited to TikTok or Creative Center.")
        from .browser_agent import ProfileLease, data_root
        async def manual():
            from playwright.async_api import async_playwright
            with ProfileLease(data_root() / "browser-owner.lock"):
                async with async_playwright() as playwright:
                    context = await playwright.chromium.launch_persistent_context(str(data_root() / "browser"), headless=False)
                    page = await context.new_page()
                    await page.goto(args.url, wait_until="domcontentloaded")
                    await asyncio.to_thread(input, "Complete any login yourself. Do not bypass access restrictions. Press Enter here after finishing to close the session: ")
                    await context.close()
        asyncio.run(manual())
    elif args.command == "mcp":
        from .browser_agent import ProfileLease, data_root
        with ProfileLease(data_root() / "browser-owner.lock"):
            executable = "npx.cmd" if os.name == "nt" else "npx"
            subprocess.run([executable, "--yes", "@playwright/mcp@0.0.83", "--port", str(args.port), "--user-data-dir", str(data_root() / "browser")], check=True)

if __name__ == "__main__":
    main()
