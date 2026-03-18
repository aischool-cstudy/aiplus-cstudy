import json
from typing import Any
from urllib import parse, request

from app.domain.ai.providers.common import parse_json_text
from app.domain.ai.providers.base import (
    AIAttemptError,
    AIResponseMeta,
    AIUsageMeta,
    StructuredAIResponse,
)


class GeminiProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_sec: int = 30,
    ) -> None:
        if not api_key:
            raise ValueError("gemini_api_key_missing")
        self.api_key = api_key
        self.model = model
        self.timeout_sec = timeout_sec

    def generate_json_with_meta(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> StructuredAIResponse:
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{parse.quote(self.model)}:generateContent?key={parse.quote(self.api_key)}"
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": f"{system_prompt}\n\n{user_prompt}",
                        }
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3,
            },
        }

        req = request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_sec) as response:
                body = response.read().decode("utf-8")
        except Exception as exc:  # pragma: no cover - network boundary
            raise RuntimeError(f"gemini_request_failed:{exc}") from exc

        decoded = json.loads(body)
        meta = AIResponseMeta(
            provider="gemini",
            model=self.model,
            usage=self._extract_usage(decoded),
        )
        try:
            text = self._extract_text(decoded)
            data = parse_json_text(text)
        except Exception as exc:
            raise AIAttemptError(str(exc), meta=meta) from exc

        return StructuredAIResponse(data=data, meta=meta)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        return self.generate_json_with_meta(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        ).data

    @staticmethod
    def _extract_text(response_json: dict[str, Any]) -> str:
        candidates = response_json.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise RuntimeError("gemini_candidates_missing")

        first = candidates[0]
        content = first.get("content", {})
        parts = content.get("parts", [])
        if not isinstance(parts, list):
            raise RuntimeError("gemini_parts_missing")

        for part in parts:
            text = part.get("text") if isinstance(part, dict) else None
            if isinstance(text, str) and text.strip():
                return text

        raise RuntimeError("gemini_text_missing")

    @staticmethod
    def _extract_usage(response_json: dict[str, Any]) -> AIUsageMeta | None:
        usage = response_json.get("usageMetadata")
        if not isinstance(usage, dict):
            return None

        extracted = AIUsageMeta(
            input_tokens=GeminiProvider._safe_int(usage.get("promptTokenCount")),
            output_tokens=GeminiProvider._safe_int(usage.get("candidatesTokenCount")),
            total_tokens=GeminiProvider._safe_int(usage.get("totalTokenCount")),
            cached_input_tokens=GeminiProvider._safe_int(usage.get("cachedContentTokenCount")),
        )
        if all(value is None for value in (
            extracted.input_tokens,
            extracted.output_tokens,
            extracted.total_tokens,
            extracted.cached_input_tokens,
        )):
            return None
        return extracted

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        try:
            candidate = int(value)
        except (TypeError, ValueError):
            return None
        return candidate if candidate >= 0 else None
