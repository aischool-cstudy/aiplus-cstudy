"""AI domain services and provider abstractions."""

from typing import Any

from app.domain.ai.service import AIService


def build_ai_service(*args: Any, **kwargs: Any):
    from app.domain.ai.factory import build_ai_service as _build_ai_service

    return _build_ai_service(*args, **kwargs)


__all__ = ["AIService", "build_ai_service"]
