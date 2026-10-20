import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from tikytoky.browser_agent import ProfileLease, canonical_video, datetime_cutoff
from tikytoky.tiktok_metadata import canonical_tiktok, counter, hydration_videos, normalize_tiktok


class BrowserAdapterTests(unittest.TestCase):
    def test_single_owner_profile_does_not_steal_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "browser-owner.lock"
            with ProfileLease(path):
                self.assertTrue(path.exists())
                with self.assertRaisesRegex(RuntimeError, "already owned"):
                    with ProfileLease(path):
                        pass
            self.assertFalse(path.exists())

    def test_only_canonical_public_video_urls(self):
        self.assertEqual(canonical_tiktok("https://www.tiktok.com/@example/video/123456789?tracking=x"), "https://www.tiktok.com/@example/video/123456789")
        self.assertIsNone(canonical_tiktok("https://www.tiktok.com.attacker.example/@x/video/123456789"))
        self.assertIsNone(canonical_video("http://127.0.0.1/private"))
        self.assertEqual(canonical_video("https://youtu.be/abcdefghijk?t=1"), "https://www.youtube.com/watch?v=abcdefghijk")

    def test_abbreviations_missing_and_negative_metrics_are_not_invented(self):
        self.assertIsNone(counter("1.2M"))
        self.assertIsNone(counter(None))
        self.assertIsNone(counter(True))
        self.assertIsNone(counter(-10))
        self.assertEqual(counter("0"), 0)

    def test_hydration_preserves_observed_counts_and_signed_media(self):
        raw = {"id": "123456789", "desc": "A real public description", "author": {"uniqueId": "example"}, "createTime": 1700000000,
               "statsV2": {"playCount": "1200", "diggCount": 0}, "video": {"duration": 21, "cover": "https://cdn.example/cover.jpg?signature=keep"}}
        result = normalize_tiktok(raw, observed_at="2026-10-20T00:00:00Z")
        self.assertIsNotNone(result)
        self.assertEqual(result["snapshots"][0]["views"], 1200)
        self.assertEqual(result["snapshots"][0]["likes"], 0)
        self.assertIsNone(result["snapshots"][0]["shares"])
        self.assertEqual(result["thumbnail"], "https://cdn.example/cover.jpg?signature=keep")
        payload = {"__DEFAULT_SCOPE__": {"webapp.video-detail": {"itemInfo": {"itemStruct": raw}}}}
        self.assertEqual(hydration_videos(payload)[0]["id"], "123456789")

    def test_date_window_is_validated_without_a_network_call(self):
        self.assertIsNone(datetime_cutoff(0))
        self.assertIsNotNone(datetime_cutoff(7))
        with self.assertRaises(ValueError):
            datetime_cutoff(-1)


class TikTokSecondaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_secondary_is_explicit_not_fake_api_success(self):
        from tikytoky.tiktok_metadata import enrich_videos
        with patch.dict(os.environ, {"TIKTOK_API_ENABLED": "false"}):
            videos = [{"url": "https://www.tiktok.com/@example/video/123456789"}]
            result = await enrich_videos(videos)
            self.assertEqual(result["videos"], videos)
            self.assertIn("disabled", result["warnings"][0])
            self.assertFalse(result["blocked"])

    async def test_secondary_calls_real_library_contract_with_plain_factories_once(self):
        from tikytoky.tiktok_metadata import enrich_videos
        calls = []

        class FakePage:
            url = "https://www.tiktok.com/"
            async def goto(self, url, **kwargs):
                self.url = url
                calls.append(("goto", url))
            def locator(self, selector):
                return self
            async def inner_text(self, **kwargs):
                return "Public video page"

        class FakeContext:
            async def new_page(self):
                return FakePage()

        class FakeChromium:
            async def launch_persistent_context(self, profile, **kwargs):
                calls.append(("profile", profile, kwargs))
                return FakeContext()

        class FakeApi:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                calls.append(("closed",))
            async def create_sessions(self, **kwargs):
                calls.append(("sessions", kwargs))
                context = await kwargs["browser_context_factory"](SimpleNamespace(chromium=FakeChromium()))
                page = await kwargs["page_factory"](context)
                self.sessions = [SimpleNamespace(page=page)]
            async def make_request(self, **kwargs):
                calls.append(("request", kwargs))
                return {"status_code": 0, "itemInfo": {"itemStruct": {"id": "123456789", "author": {"uniqueId": "example"}, "stats": {"playCount": 4321}, "video": {"duration": 20}}}}

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"TIKTOK_API_ENABLED": "true", "WORKER_DATA_DIR": directory}), patch.dict("sys.modules", {"TikTokApi": SimpleNamespace(TikTokApi=FakeApi)}):
            result = await enrich_videos([{"id": "existing-id", "url": "https://www.tiktok.com/@example/video/123456789", "snapshots": []}])
        self.assertFalse(result["blocked"])
        self.assertEqual(result["videos"][0]["id"], "existing-id")
        self.assertEqual(result["videos"][0]["snapshots"][0]["views"], 4321)
        session = next(value[1] for value in calls if value[0] == "sessions")
        self.assertEqual(session["num_sessions"], 1)
        self.assertFalse(session["enable_session_recovery"])
        self.assertNotIn("ms_tokens", session)
        self.assertNotIn("proxies", session)
        request = next(value[1] for value in calls if value[0] == "request")
        self.assertEqual(request["retries"], 1)
        self.assertEqual(request["params"], {"itemId": "123456789"})
        self.assertEqual(len([value for value in calls if value[0] == "request"]), 1)
        self.assertEqual(calls[-1], ("closed",))


class BrowserUseContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_requested_research_lenses_and_only_independently_observed_links(self):
        from tikytoky.browser_agent import BrowserAgent
        captured = {}
        observed = "https://www.tiktok.com/@example/video/123456789"
        invented = "https://www.tiktok.com/@invented/video/987654321"

        class Page:
            async def evaluate(self, code):
                self.assertion = code
                return json.dumps({"url": "https://www.tiktok.com/search/video?q=cooking", "text": "Public results", "links": [observed]})

        class Browser:
            def __init__(self, **kwargs):
                captured["browser"] = kwargs
            async def get_current_page(self):
                return Page()
            async def kill(self):
                captured["closed"] = True

        class Agent:
            def __init__(self, **kwargs):
                captured["agent"] = kwargs
                self.browser = kwargs["browser"]
            async def run(self, **kwargs):
                await kwargs["on_step_end"](self)
                return SimpleNamespace(final_result=lambda: json.dumps({"urls": [observed, invented], "blocked": False, "reason": ""}))

        class Output:
            @classmethod
            def model_validate_json(cls, raw):
                data = json.loads(raw)
                return SimpleNamespace(model_dump=lambda: data)

        fake_modules = {
            "browser_use": SimpleNamespace(Agent=Agent, Browser=Browser, Tools=lambda **kwargs: captured.update(tools=kwargs)),
            "browser_use.llm.openrouter.chat": SimpleNamespace(ChatOpenRouter=lambda **kwargs: captured.update(llm=kwargs)),
            "pydantic": SimpleNamespace(Field=lambda **kwargs: None, create_model=lambda *args, **kwargs: Output),
        }
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"WORKER_DATA_DIR": directory, "OPENROUTER_API_KEY": "fake-unit-test-key"}), patch.dict("sys.modules", fake_modules):
            adapter = BrowserAgent()
            result = await adapter._agent_urls("cooking", 10, "tiktok", ["example"], ["homecooking"], True)
        self.assertEqual(result["urls"], [observed])
        self.assertIn("https://www.tiktok.com/@example", captured["agent"]["task"])
        self.assertIn("https://www.tiktok.com/tag/homecooking", captured["agent"]["task"])
        self.assertIn("https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en", captured["agent"]["task"])
        self.assertFalse(captured["browser"]["captcha_solver"])
        self.assertFalse(captured["browser"]["use_cloud"])
        self.assertIn("click", captured["tools"]["exclude_actions"])
        self.assertEqual(captured["llm"]["max_retries"], 0)
        self.assertTrue(captured["closed"])


if __name__ == "__main__":
    unittest.main()
