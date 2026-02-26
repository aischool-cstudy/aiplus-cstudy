from typing import Any, Protocol


class StructuredAIProvider(Protocol):
    """LLM provider contract that returns structured JSON outputs."""

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        ...
