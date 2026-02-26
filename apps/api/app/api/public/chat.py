from functools import lru_cache
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.domain.ai import build_ai_service
from app.services.compat.error_policy import build_structured_error_detail
from app.services.compat.pipeline_runtime import (
    ai_error_detail,
    classify_ai_failure,
    format_pipeline_error_detail,
)


router = APIRouter(prefix="/api", tags=["public"])
settings = get_settings()


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    chatType: str = "manager"
    contextId: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


@lru_cache(maxsize=1)
def _get_ai_service():
    return build_ai_service(settings)


def _require_ai_service():
    try:
        return _get_ai_service()
    except Exception as exc:
        reason = ai_error_detail(exc)
        raise HTTPException(
            status_code=503,
            detail=build_structured_error_detail(
                error_code="config_error",
                message=reason,
                retryable=False,
                detail=f"ai_service_init_failed:config_error:{reason}",
            ),
        ) from exc


def _as_non_empty_str(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return fallback


def _extract_last_user_text(messages: list[dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue

        parts = msg.get("parts")
        if isinstance(parts, list):
            for part in parts:
                if isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        return text.strip()

        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()

    return ""


def _normalize_chat_type(value: str) -> str:
    return "tutor" if value == "tutor" else "manager"


def _normalize_assistant_persona(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"coach", "mate"}:
        return text
    return "coach"


def _compact_text(value: Any, max_chars: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _compact_context(raw_context: dict[str, Any]) -> dict[str, Any]:
    compact: dict[str, Any] = {}
    key_limits = {
        "contentBody": 1800,
        "codeExamples": 900,
        "curriculumGoal": 280,
        "contentTitle": 220,
    }
    for key, value in raw_context.items():
        if isinstance(value, str):
            compact[key] = _compact_text(value, key_limits.get(key, 220))
            continue
        if isinstance(value, list):
            compact[key] = [str(item)[:120] for item in value[:8]]
            continue
        if isinstance(value, dict):
            compact[key] = {
                str(k): _compact_text(v, 180) if isinstance(v, str) else v
                for k, v in list(value.items())[:10]
            }
            continue
        compact[key] = value
    return compact


def _serialize_recent_messages(messages: list[dict[str, Any]], limit: int = 6) -> str:
    rows: list[str] = []
    for msg in messages[-limit:]:
        role = msg.get("role")
        if role not in {"user", "assistant"}:
            continue
        text = ""
        parts = msg.get("parts")
        if isinstance(parts, list):
            for part in parts:
                if isinstance(part, dict) and part.get("type") == "text":
                    candidate = part.get("text")
                    if isinstance(candidate, str) and candidate.strip():
                        text = candidate.strip()
                        break
        if not text:
            content = msg.get("content")
            if isinstance(content, str):
                text = content.strip()
        if text:
            rows.append(f"{role}: {_compact_text(text, 280)}")
    return "\n".join(rows)


def _build_chat_prompts(payload: ChatRequest, last_user: str) -> tuple[str, str]:
    chat_type = _normalize_chat_type(payload.chatType)
    compact_context = _compact_context(payload.context)
    assistant_persona = _normalize_assistant_persona(compact_context.get("assistantPersona"))
    persona_rules = {
        "coach": "말투는 명확하고 목표지향적입니다. 칭찬은 구체적으로, 행동 제안은 분명하게 제시합니다.",
        "mate": "말투는 친근하고 부드럽습니다. 부담을 낮추고 작은 성공 경험을 강조합니다.",
    }
    mode_rules = (
        "당신은 학습 매니저입니다.\n"
        "- 오늘 할 일, 진도 점검, 학습 루틴 유지에 집중하세요.\n"
        "- 깊은 기술 설명/코드 디버깅 요청은 튜터에게 연결하세요.\n"
        "- 답변은 1~3문장으로 짧고 실행 가능해야 합니다.\n"
    ) if chat_type == "manager" else (
        "당신은 과정 튜터입니다.\n"
        "- 개념 설명, 코드 예시, 오개념 교정에 집중하세요.\n"
        "- 학습 계획/동기부여 중심 요청은 매니저에게 연결하세요.\n"
        "- 수준에 맞춘 단계형 설명(요약 -> 근거 -> 다음 액션)을 제공하세요.\n"
    )
    system_prompt = (
        "당신은 AI+ 학습 어시스턴트입니다.\n"
        f"현재 모드: {chat_type}\n"
        f"현재 페르소나: {assistant_persona}\n"
        f"{mode_rules}\n"
        f"페르소나 규칙: {persona_rules[assistant_persona]}\n"
        "페르소나는 표현/톤만 바꿉니다. 학습 난이도/평가 기준/진행 단계는 임의 변경하지 않습니다.\n"
        "한국어 존댓말을 사용하세요.\n"
        '형식: {"assistant":"답변 문자열"}\n'
        "반드시 JSON 객체 하나만 반환하세요."
    )
    context_json = json.dumps(compact_context, ensure_ascii=False)
    history_text = _serialize_recent_messages(payload.messages)
    user_prompt = (
        f"chatType={chat_type}\n"
        f"contextId={payload.contextId or 'none'}\n"
        f"context={context_json}\n"
        f"recent_messages={history_text or '없음'}\n"
        f"user_message={last_user or '사용자 메시지 없음'}"
    )
    return system_prompt, user_prompt


@router.post("/chat")
def compat_chat(payload: ChatRequest) -> dict[str, Any]:
    last_user = _extract_last_user_text(payload.messages)

    system_prompt, user_prompt = _build_chat_prompts(payload, last_user)
    ai_service = _require_ai_service()

    try:
        raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
    except Exception as exc:
        reason = ai_error_detail(exc)
        code, status_code, retryable = classify_ai_failure(reason)
        raise HTTPException(
            status_code=status_code,
            detail=build_structured_error_detail(
                error_code=code,
                message=reason,
                retryable=retryable,
                detail=format_pipeline_error_detail("chat_generate", code, reason),
            ),
        ) from exc

    answer = _as_non_empty_str(raw.get("assistant"), "")
    if not answer:
        raise HTTPException(
            status_code=502,
            detail=build_structured_error_detail(
                error_code="empty_output",
                message="chat_empty_assistant",
                retryable=False,
                detail="chat_empty_assistant",
            ),
        )

    return {
        "chatType": payload.chatType,
        "contextId": payload.contextId,
        "assistant": answer,
        "streaming": False,
    }
