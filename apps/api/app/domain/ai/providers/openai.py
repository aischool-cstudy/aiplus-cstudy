import json
from typing import Any
from urllib import request

from app.domain.ai.providers.common import parse_json_text
from app.domain.ai.providers.base import (
    AIAttemptError,
    AIResponseMeta,
    AIUsageMeta,
    StructuredAIResponse,
)


class OpenAIProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        timeout_sec: int = 30,
    ) -> None:
        if not api_key:
            raise ValueError("openai_api_key_missing")
        if not base_url:
            raise ValueError("openai_base_url_missing")

        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_sec = timeout_sec

    def generate_json_with_meta(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> StructuredAIResponse:
        endpoint = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }

        req = request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_sec) as response:
                body = response.read().decode("utf-8")
        except Exception as exc:  # pragma: no cover - network boundary
            raise RuntimeError(f"openai_request_failed:{exc}") from exc

        decoded = json.loads(body)
        meta = AIResponseMeta(
            provider="openai",
            model=str(decoded.get("model") or self.model),
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
        choices = response_json.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("openai_choices_missing")

        first = choices[0]
        message = first.get("message", {})
        content = message.get("content")

        if isinstance(content, str) and content.strip():
            return content

        if isinstance(content, list):
            texts: list[str] = []
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        texts.append(text)
            if texts:
                return "\n".join(texts)

        raise RuntimeError("openai_content_missing")

    @staticmethod
    def _extract_usage(response_json: dict[str, Any]) -> AIUsageMeta | None:
        usage = response_json.get("usage")
        if not isinstance(usage, dict):
            return None

        prompt_details = usage.get("prompt_tokens_details")
        extracted = AIUsageMeta(
            input_tokens=OpenAIProvider._safe_int(usage.get("prompt_tokens")),
            output_tokens=OpenAIProvider._safe_int(usage.get("completion_tokens")),
            total_tokens=OpenAIProvider._safe_int(usage.get("total_tokens")),
            cached_input_tokens=OpenAIProvider._safe_int(
                prompt_details.get("cached_tokens") if isinstance(prompt_details, dict) else None
            ),
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
