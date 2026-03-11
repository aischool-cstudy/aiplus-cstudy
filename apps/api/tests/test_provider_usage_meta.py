import json
import unittest
from unittest.mock import patch

from app.domain.ai.providers.base import AIAttemptError
from app.domain.ai.providers.gemini import GeminiProvider
from app.domain.ai.providers.openai import OpenAIProvider


class _FakeHTTPResponse:
    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_FakeHTTPResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class ProviderUsageMetaTests(unittest.TestCase):
    @patch("app.domain.ai.providers.openai.parse_json_text", side_effect=ValueError("expecting value"))
    @patch("app.domain.ai.providers.openai.request.urlopen")
    def test_openai_preserves_usage_meta_when_json_parse_fails(self, mock_urlopen, _mock_parse_json) -> None:
        mock_urlopen.return_value = _FakeHTTPResponse(json.dumps({
            "model": "gpt-4o-mini",
            "choices": [
                {
                    "message": {
                        "content": "{\"broken\": ",
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 30,
                "total_tokens": 150,
                "prompt_tokens_details": {
                    "cached_tokens": 20,
                },
            },
        }))
        provider = OpenAIProvider(
            api_key="test-key",
            model="gpt-4o-mini",
            base_url="https://example.com/v1",
        )

        with self.assertRaises(AIAttemptError) as context:
            provider.generate_json_with_meta(
                system_prompt="system",
                user_prompt="user",
            )

        self.assertEqual(str(context.exception), "expecting value")
        self.assertIsNotNone(context.exception.meta)
        self.assertEqual(context.exception.meta.provider, "openai")
        self.assertEqual(context.exception.meta.usage.input_tokens, 120)
        self.assertEqual(context.exception.meta.usage.output_tokens, 30)
        self.assertEqual(context.exception.meta.usage.total_tokens, 150)
        self.assertEqual(context.exception.meta.usage.cached_input_tokens, 20)

    @patch("app.domain.ai.providers.gemini.parse_json_text", side_effect=ValueError("expecting value"))
    @patch("app.domain.ai.providers.gemini.request.urlopen")
    def test_gemini_preserves_usage_meta_when_json_parse_fails(self, mock_urlopen, _mock_parse_json) -> None:
        mock_urlopen.return_value = _FakeHTTPResponse(json.dumps({
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "{\"broken\": "},
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 200,
                "candidatesTokenCount": 50,
                "totalTokenCount": 250,
                "cachedContentTokenCount": 40,
            },
        }))
        provider = GeminiProvider(
            api_key="test-key",
            model="gemini-2.0-flash",
        )

        with self.assertRaises(AIAttemptError) as context:
            provider.generate_json_with_meta(
                system_prompt="system",
                user_prompt="user",
            )

        self.assertEqual(str(context.exception), "expecting value")
        self.assertIsNotNone(context.exception.meta)
        self.assertEqual(context.exception.meta.provider, "gemini")
        self.assertEqual(context.exception.meta.usage.input_tokens, 200)
        self.assertEqual(context.exception.meta.usage.output_tokens, 50)
        self.assertEqual(context.exception.meta.usage.total_tokens, 250)
        self.assertEqual(context.exception.meta.usage.cached_input_tokens, 40)


if __name__ == "__main__":
    unittest.main()
