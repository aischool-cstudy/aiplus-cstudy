import re
from typing import Any

from fastapi import HTTPException


KNOWN_ERROR_CODES = {
    "schema_mismatch",
    "rate_limited",
    "timeout",
    "quality_failed",
    "config_error",
    "empty_output",
    "provider_error",
    "db_error",
    "unknown",
}

RETRYABLE_ERROR_CODES = {
    "schema_mismatch",
    "rate_limited",
    "timeout",
    "quality_failed",
}

_PIPELINE_FAILURE_PATTERN = re.compile(r"^[a-z0-9_]+_failed:([a-z_]+):(.*)$")


def normalize_error_code(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in KNOWN_ERROR_CODES:
        return raw
    return "unknown"


def build_structured_error_detail(
    *,
    error_code: str,
    message: str | None = None,
    retryable: bool | None = None,
    detail: Any = None,
) -> dict[str, Any]:
    code = normalize_error_code(error_code)
    message_text = " ".join(str(message or "").split()).strip()
    if not message_text:
        message_text = _build_message(code, str(detail or ""))
    if retryable is None:
        retryable = code in RETRYABLE_ERROR_CODES

    legacy_detail = " ".join(str(detail or "").split()).strip()
    if not legacy_detail:
        legacy_detail = message_text

    return {
        "error_code": code,
        "message": message_text[:260],
        "retryable": bool(retryable),
        "detail": legacy_detail,
    }


def _build_message(code: str, reason: str) -> str:
    message = " ".join(str(reason or "").split()).strip()
    if message:
        return message[:260]
    defaults = {
        "schema_mismatch": "AI response schema mismatch",
        "rate_limited": "AI provider rate limited the request",
        "timeout": "AI request timed out",
        "quality_failed": "Generated output did not pass quality checks",
        "config_error": "AI service configuration error",
        "empty_output": "AI returned empty content",
        "provider_error": "AI provider request failed",
        "db_error": "Failed to persist generated result",
        "unknown": "Request failed",
    }
    return defaults.get(code, "Request failed")


def parse_legacy_detail(detail: Any) -> tuple[str, str, str]:
    text = " ".join(str(detail or "").split()).strip()
    if not text:
        return "unknown", _build_message("unknown", ""), ""

    if text.startswith("ai_service_init_failed:"):
        reason = text.split(":", 1)[1]
        return "config_error", _build_message("config_error", reason), text

    if text == "chat_empty_assistant":
        return "empty_output", _build_message("empty_output", ""), text

    match = _PIPELINE_FAILURE_PATTERN.match(text)
    if match:
        code = normalize_error_code(match.group(1))
        reason = match.group(2)
        if code == "unknown":
            code = "provider_error"
        return code, _build_message(code, reason), text

    token = text.split(":", 1)[0].strip().lower()
    token_code = normalize_error_code(token)
    if token_code != "unknown":
        reason = text.split(":", 1)[1] if ":" in text else ""
        return token_code, _build_message(token_code, reason), text

    # 과거 포맷의 짧은 *_failed 문자열을 위한 하위호환 분기.
    if token.endswith("_failed"):
        return "provider_error", _build_message("provider_error", text), text

    return "unknown", _build_message("unknown", text), text


def _payload_from_detail_dict(detail: dict[str, Any]) -> tuple[str, str, bool, str]:
    code = normalize_error_code(detail.get("error_code"))
    inferred_legacy = ""
    if code == "unknown":
        parsed_code, _, inferred_legacy = parse_legacy_detail(detail.get("detail"))
        code = parsed_code
    message = " ".join(str(detail.get("message") or "").split()).strip()
    if not message:
        message = _build_message(code, detail.get("detail") or "")
    retryable = bool(detail.get("retryable")) if "retryable" in detail else code in RETRYABLE_ERROR_CODES
    legacy_detail = str(detail.get("detail") or "").strip()
    if not legacy_detail:
        legacy_detail = inferred_legacy or message
    return code, message[:260], retryable, legacy_detail


def build_http_error_payload(exc: HTTPException, trace_id: str) -> dict[str, Any]:
    detail = exc.detail

    if isinstance(detail, dict):
        code, message, retryable, legacy_detail = _payload_from_detail_dict(detail)
    else:
        code, message, legacy_detail = parse_legacy_detail(detail)
        retryable = code in RETRYABLE_ERROR_CODES

    return {
        "error_code": code,
        "message": message,
        "retryable": retryable,
        "trace_id": trace_id,
        # 클라이언트 전환 기간 동안 하위호환을 위해 기존 detail 필드를 유지한다.
        "detail": legacy_detail,
    }


def build_unexpected_error_payload(trace_id: str) -> dict[str, Any]:
    return {
        "error_code": "unknown",
        "message": "Unexpected server error",
        "retryable": False,
        "trace_id": trace_id,
        "detail": "unexpected_server_error",
    }
