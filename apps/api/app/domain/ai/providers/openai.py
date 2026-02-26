import json
from typing import Any
from urllib import request

from app.domain.ai.providers.common import parse_json_text


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

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
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
        text = self._extract_text(decoded)
        return parse_json_text(text)

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
