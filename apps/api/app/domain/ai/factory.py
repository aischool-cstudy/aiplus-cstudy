from app.core.config import Settings
from app.domain.ai.providers.gemini import GeminiProvider
from app.domain.ai.providers.openai import OpenAIProvider
from app.domain.ai.service import AIService


def build_ai_service(settings: Settings) -> AIService:
    primary = _build_primary_provider(settings)
    return AIService(
        primary=primary,
        max_concurrency=settings.ai_max_concurrency,
        acquire_timeout_ms=settings.ai_backpressure_acquire_timeout_ms,
    )


def _build_primary_provider(settings: Settings) -> GeminiProvider | OpenAIProvider:
    if settings.ai_provider == "gemini":
        return GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_sec=settings.ai_request_timeout_sec,
        )

    if settings.ai_provider == "openai":
        return OpenAIProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url,
            timeout_sec=settings.ai_request_timeout_sec,
        )

    raise ValueError(f"unsupported_ai_provider:{settings.ai_provider}")
