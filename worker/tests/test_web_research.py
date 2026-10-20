"""Evidence bounds and failure honesty, with no paid APIs or external network."""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tikytoky import web_research as research


def video(**patches):
    return {"id": "v1", "url": "https://www.tiktok.com/@creator/video/123", "title": "Observed video", "creator": "creator", "platform": "tiktok", "duration": 30, "transcript": "An actual observed opening and explanation.", "snapshots": [{"views": 100, "observedAt": "2026-10-19T18:00:00Z"}], "fetchedAt": "2026-10-19T18:00:00Z", **patches}


class CorpusTests(unittest.TestCase):
    def test_private_and_non_web_sources_are_rejected(self):
        for url in ("file:///etc/passwd", "http://127.0.0.1", "http://169.254.169.254/latest", "http://localhost/", "https://secret.internal/", "https://user:pass@example.com/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                research.public_url(url, resolve=False)

    def test_dns_private_answer_is_rejected(self):
        with patch.object(research.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.1", 443))]), self.assertRaises(ValueError):
            research.public_url("https://public.example.com/")

    def test_missing_evidence_remains_explicitly_missing(self):
        rows, sources = research.video_corpus([video(transcript="", visualNotes="", onScreenText="")])
        self.assertEqual(len(sources), 1)
        data = json.loads(rows[0]["raw_content"])
        self.assertIn("UNAVAILABLE", data["transcript"])
        self.assertIn("UNAVAILABLE", data["visualNotes"])
        self.assertEqual(sources[0]["fetchedAt"], "2026-10-19T18:00:00Z")

    def test_source_count_and_size_are_bounded(self):
        rows, _ = research.video_corpus([video(id=str(index), transcript="x" * 20000) for index in range(100)])
        self.assertLessEqual(len(rows), research.MAX_VIDEO_EVIDENCE)
        self.assertLessEqual(sum(len(row["raw_content"]) for row in rows), research.MAX_CORPUS_CHARS)
        self.assertTrue(all(len(row["raw_content"]) <= research.MAX_SOURCE_CHARS for row in rows))

    def test_corpus_selection_is_deterministic_and_bounded(self):
        rows = [{"url": "https://a.example.com/", "title": "Cooking", "raw_content": "fresh recipe"}, {"url": "https://b.example.com/", "title": "Astrology", "raw_content": "birth chart"}]
        selected = research.select_corpus(rows, "astrology birth", limit=1)
        self.assertEqual(selected[0]["title"], "Astrology")

    def test_environment_is_restored_even_on_failure(self):
        with patch.dict(os.environ, {"FAST_LLM": "before", "RETRIEVER": "existing"}, clear=False):
            with self.assertRaises(RuntimeError):
                with research._research_environment("http://127.0.0.1:9000/test", "test-model"):
                    self.assertEqual(os.environ["FAST_LLM"], "openrouter:test-model")
                    raise RuntimeError("test")
            self.assertEqual(os.environ["FAST_LLM"], "before")
            self.assertEqual(os.environ["RETRIEVER"], "existing")


class LocalInvestigationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_key_returns_blocked_without_ai_call(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}), patch.object(research, "synthesize", new_callable=AsyncMock) as synthesize:
            result = await research._investigate_local({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher:blocked")
        self.assertEqual(result["report"], "")
        synthesize.assert_not_awaited()

    async def test_actual_synthesis_is_returned_with_known_source(self):
        report = "Evidence-grounded report. " * 8 + "[Observed video](https://www.tiktok.com/@creator/video/123)"
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}), patch.object(research, "synthesize", new_callable=AsyncMock, return_value=report):
            result = await research._investigate_local({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher")
        self.assertEqual(result["report"], report)
        self.assertEqual(result["sources"][0]["method"], "collected_video_evidence")

    async def test_unknown_source_is_withheld(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}), patch.object(research, "synthesize", new_callable=AsyncMock, return_value="Invented [source](https://invented.example.com/report)"):
            result = await research._investigate_local({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher:failed")
        self.assertEqual(result["report"], "")

    async def test_unavailable_search_keeps_collected_evidence(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}), patch.object(research, "search_searxng", side_effect=RuntimeError("search unavailable")), patch.object(research, "synthesize", new_callable=AsyncMock, return_value="Report over supplied collected evidence. " * 8 + "[Source](https://www.tiktok.com/@creator/video/123)"):
            result = await research._investigate_local({"subject": "cooking", "webResearch": True}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher")
        self.assertTrue(any("web enrichment was unavailable" in warning for warning in result["warnings"]))
        self.assertEqual(len(result["sources"]), 1)

    async def test_missing_citations_are_withheld(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}), patch.object(research, "synthesize", new_callable=AsyncMock, return_value="An uncited research claim. " * 8):
            result = await research._investigate_local({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher:failed")
        self.assertEqual(result["report"], "")
        self.assertTrue(any("no inspectable source" in warning for warning in result["warnings"]))

    async def test_dependency_failure_does_not_fake_success(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}), patch.object(research, "synthesize", new_callable=AsyncMock, side_effect=ImportError("missing")):
            result = await research._investigate_local({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher:failed")
        self.assertEqual(result["report"], "")
        self.assertTrue(any("not installed" in warning for warning in result["warnings"]))

    async def test_missing_runtime_reports_blocked(self):
        with patch.dict(os.environ, {"WORKER_RESEARCH_PYTHON": str(Path(tempfile.gettempdir()) / "missing-tikytoky-python.exe")}):
            result = await research.investigate({"subject": "cooking"}, [video()], lambda _: None)
        self.assertEqual(result["engine"], "gpt-researcher:blocked")
        self.assertEqual(result["report"], "")


if __name__ == "__main__":
    unittest.main()
