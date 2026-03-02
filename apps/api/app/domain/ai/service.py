from typing import Any
from threading import BoundedSemaphore

from app.domain.ai.providers.base import StructuredAIProvider


class AIService:
    def __init__(
        self,
        *,
        primary: StructuredAIProvider,
        max_concurrency: int = 4,
        acquire_timeout_ms: int = 200,
    ) -> None:
        self.primary = primary
        self._semaphore = BoundedSemaphore(value=max(1, int(max_concurrency)))
        self._acquire_timeout_sec = max(0.01, int(acquire_timeout_ms) / 1000)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        acquired = self._semaphore.acquire(timeout=self._acquire_timeout_sec)
        if not acquired:
            raise RuntimeError("ai_backpressure_busy")
        try:
            return self.primary.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        except Exception as primary_exc:
            raise RuntimeError(f"ai_primary_failed:{primary_exc}") from primary_exc
        finally:
            self._semaphore.release()
