from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class AIUsageMeta:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cached_input_tokens: int | None = None


@dataclass(frozen=True)
class AIResponseMeta:
    provider: str
    model: str
    usage: AIUsageMeta | None = None


@dataclass(frozen=True)
class StructuredAIResponse:
    data: dict[str, Any]
    meta: AIResponseMeta


class AIAttemptError(RuntimeError):
    def __init__(self, message: str, *, meta: AIResponseMeta | None = None) -> None:
        self.meta = meta
        super().__init__(message)


def merge_ai_response_metas(metas: list[AIResponseMeta]) -> AIResponseMeta | None:
    if not metas:
        return None

    latest = metas[-1]

    def _sum_usage(field: str) -> int | None:
        total = 0
        found = False
        for item in metas:
            usage = item.usage
            value = getattr(usage, field, None) if usage is not None else None
            if isinstance(value, int):
                total += value
                found = True
        return total if found else None

    usage = AIUsageMeta(
        input_tokens=_sum_usage("input_tokens"),
        output_tokens=_sum_usage("output_tokens"),
        total_tokens=_sum_usage("total_tokens"),
        cached_input_tokens=_sum_usage("cached_input_tokens"),
    )
    if all(value is None for value in (
        usage.input_tokens,
        usage.output_tokens,
        usage.total_tokens,
        usage.cached_input_tokens,
    )):
        usage = None

    return AIResponseMeta(
        provider=latest.provider,
        model=latest.model,
        usage=usage,
    )


class StructuredAIProvider(Protocol):
    """LLM provider contract that returns structured JSON outputs."""

    def generate_json_with_meta(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> StructuredAIResponse:
        ...

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        ...
