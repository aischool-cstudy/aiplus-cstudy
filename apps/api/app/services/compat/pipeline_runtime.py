from __future__ import annotations

from typing import Any, Callable


DEFAULT_RETRYABLE_FAILURE_KINDS = {"rate_limited", "timeout", "schema_mismatch"}


class PipelineFailure(RuntimeError):
    def __init__(
        self,
        *,
        pipeline: str,
        kind: str,
        status_code: int,
        retryable: bool,
        reason: str,
        attempt_count: int,
    ) -> None:
        self.pipeline = pipeline
        self.kind = kind
        self.status_code = status_code
        self.retryable = retryable
        self.reason = reason
        self.attempt_count = attempt_count
        super().__init__(f"{pipeline}:{kind}:{reason}")


def ai_error_detail(exc: Exception) -> str:
    message = str(exc).strip()
    if not message:
        return "ai_provider_failed"
    return message[:300]


def normalize_error_reason(value: str) -> str:
    return " ".join(str(value or "").split())[:260] or "ai_provider_failed"


def format_pipeline_error_detail(pipeline: str, kind: str, reason: str) -> str:
    return f"{pipeline}_failed:{kind}:{normalize_error_reason(reason)}"


def classify_ai_failure(detail: str) -> tuple[str, int, bool]:
    text = str(detail or "").lower()

    rate_limit_tokens = (
        "429",
        "too many requests",
        "rate limit",
        "rate_limit",
        "resource exhausted",
        "quota",
        "ai_backpressure_busy",
    )
    timeout_tokens = (
        "timed out",
        "timeout",
        "read operation timed out",
    )
    schema_tokens = (
        "schema",
        "json",
        "jsondecodeerror",
        "expecting value",
        "no object generated",
        "did not match schema",
        "ai_response_not_object",
    )
    config_tokens = (
        "api_key_missing",
        "openai_base_url_missing",
        "unsupported_ai_provider",
        "ai_service_init_failed",
        "config_error",
    )

    if any(token in text for token in rate_limit_tokens):
        return ("rate_limited", 429, True)
    if any(token in text for token in timeout_tokens):
        return ("timeout", 504, True)
    if "quality_validation_failed" in text:
        return ("quality_failed", 422, True)
    if any(token in text for token in schema_tokens):
        return ("schema_mismatch", 422, True)
    if any(token in text for token in config_tokens):
        return ("config_error", 503, False)
    return ("provider_error", 502, False)


def run_ai_with_retry(
    call: Callable[[int], Any],
    *,
    pipeline: str,
    max_attempts: int = 2,
    retryable_kinds: set[str] | None = None,
) -> tuple[Any, int]:
    attempts = max(1, int(max_attempts))
    retryable_kinds = retryable_kinds or set(DEFAULT_RETRYABLE_FAILURE_KINDS)

    for attempt in range(1, attempts + 1):
        try:
            return call(attempt), attempt
        except Exception as exc:
            reason = ai_error_detail(exc)
            kind, status_code, retryable = classify_ai_failure(reason)
            should_retry = (
                attempt < attempts
                and retryable
                and kind in retryable_kinds
            )
            if should_retry:
                continue
            raise PipelineFailure(
                pipeline=pipeline,
                kind=kind,
                status_code=status_code,
                retryable=retryable,
                reason=reason,
                attempt_count=attempt,
            ) from exc

    raise PipelineFailure(
        pipeline=pipeline,
        kind="provider_error",
        status_code=502,
        retryable=False,
        reason="ai_retry_exhausted",
        attempt_count=attempts,
    )
