import unittest

from fastapi import HTTPException

from app.api.public import chat


class _RateLimitedAIService:
    def generate_json(self, *, system_prompt: str, user_prompt: str) -> dict:
        raise RuntimeError("429 too many requests")


class _EmptyAIService:
    def generate_json(self, *, system_prompt: str, user_prompt: str) -> dict:
        return {"assistant": "   "}


class CompatChatTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_require_ai_service = chat._require_ai_service

    def tearDown(self) -> None:
        chat._require_ai_service = self._original_require_ai_service

    def _request(self) -> chat.ChatRequest:
        return chat.ChatRequest(
            messages=[{"role": "user", "content": "안녕"}],
            chatType="manager",
            contextId=None,
            context={},
        )

    def test_chat_error_is_structured_with_error_code(self) -> None:
        chat._require_ai_service = lambda: _RateLimitedAIService()

        with self.assertRaises(HTTPException) as ctx:
            chat.compat_chat(self._request())

        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail["error_code"], "rate_limited")
        self.assertTrue(detail["retryable"])
        self.assertIn("chat_generate_failed:rate_limited", detail["detail"])

    def test_chat_empty_assistant_returns_empty_output_code(self) -> None:
        chat._require_ai_service = lambda: _EmptyAIService()

        with self.assertRaises(HTTPException) as ctx:
            chat.compat_chat(self._request())

        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail["error_code"], "empty_output")
        self.assertFalse(detail["retryable"])
        self.assertEqual(detail["detail"], "chat_empty_assistant")


if __name__ == "__main__":
    unittest.main()
