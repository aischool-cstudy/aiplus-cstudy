from functools import lru_cache
import json
import re
from typing import Any
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.domain.ai import build_ai_service
from app.services.compat.error_policy import build_structured_error_detail
from app.services.compat.normalizer_validator import (
    extract_enumerated_options,
    is_placeholder_option,
    normalize_option_text,
)
from app.services.compat.pipeline_runtime import (
    DEFAULT_RETRYABLE_FAILURE_KINDS,
    PipelineFailure,
    ai_error_detail,
    classify_ai_failure,
    format_pipeline_error_detail,
    run_ai_with_retry,
)


settings = get_settings()


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


def _raise_pipeline_http_exception(failure: PipelineFailure) -> None:
    raise HTTPException(
        status_code=failure.status_code,
        detail=build_structured_error_detail(
            error_code=failure.kind,
            message=failure.reason,
            retryable=failure.retryable,
            detail=format_pipeline_error_detail(failure.pipeline, failure.kind, failure.reason),
        ),
    )


# 테스트 및 점진적 마이그레이션 안전성을 위해 유지하는 하위호환 별칭.
def _classify_ai_failure(detail: str) -> tuple[str, int, bool]:
    return classify_ai_failure(detail)


def _raise_direct_provider_http_exception(pipeline: str, exc: Exception) -> None:
    reason = ai_error_detail(exc)
    code, status_code, retryable = classify_ai_failure(reason)
    raise HTTPException(
        status_code=status_code,
        detail=build_structured_error_detail(
            error_code=code,
            message=reason,
            retryable=retryable,
            detail=format_pipeline_error_detail(pipeline, code, reason),
        ),
    ) from exc


class GenerateRequest(BaseModel):
    language: str
    topic: str
    difficulty: str = "beginner"
    targetAudience: str = "learner"
    teachingMethod: str = "direct_instruction"
    contentMode: str = "lesson"
    questionCount: int = Field(default=8, ge=3, le=20)


class SearchRequest(BaseModel):
    query: str
    language: str | None = None
    topK: int | None = 5


class ValidateRequest(BaseModel):
    content: str
    type: str = "generated"


class RecommendRequest(BaseModel):
    userId: str
    limit: int | None = 5


class AssessmentQuestion(BaseModel):
    id: int
    question: str
    options: list[str]
    correct_answer: int
    difficulty: str = "easy"
    topic_area: str = "핵심 개념"


class AssessmentQuestionsRequest(BaseModel):
    goal: str
    background: str | None = None
    interests: list[str] = Field(default_factory=list)


class AssessmentAnswer(BaseModel):
    question_id: int
    selected: int


class AssessmentAnalyzeRequest(BaseModel):
    goal: str
    questions: list[AssessmentQuestion]
    answers: list[AssessmentAnswer]


class CurriculumTopic(BaseModel):
    title: str
    description: str
    estimated_minutes: int


class CurriculumOutput(BaseModel):
    title: str
    topics: list[CurriculumTopic]
    total_estimated_hours: float
    summary: str


class CurriculumGenerateRequest(BaseModel):
    goal: str
    level: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    background: str | None = None
    interests: list[str] = Field(default_factory=list)
    teachingMethod: str = "direct_instruction"
    goalType: str = "hobby"
    weeklyStudyHours: int = 5
    learningStyle: str = "concept_first"


class CurriculumChatMessage(BaseModel):
    role: str
    content: str


class CurriculumRefineRequest(BaseModel):
    currentCurriculum: CurriculumOutput
    chatHistory: list[CurriculumChatMessage] = Field(default_factory=list)
    userMessage: str


class ReasoningRequest(BaseModel):
    topic: str
    topicDescription: str = ""
    curriculumGoal: str
    learnerLevel: str
    language: str
    teachingMethod: str = "direct_instruction"
    prevTopics: list[str] = Field(default_factory=list)
    nextTopics: list[str] = Field(default_factory=list)
    learnerFeedback: list[dict[str, Any]] = Field(default_factory=list)
    learnerConceptFocus: list[dict[str, Any]] = Field(default_factory=list)
    learningStyle: str = "concept_first"


class SectionsRequest(BaseModel):
    input: ReasoningRequest
    reasoning: dict[str, Any]


def _truncate_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 3)].rstrip() + "..."


def _normalize_teaching_method(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "direct_instruction":
        return "direct_instruction"
    if normalized in {"problem_based", "socratic", "project_based"}:
        return "problem_based"
    return "direct_instruction"


def _teaching_method_label(value: str | None) -> str:
    canonical = _normalize_teaching_method(value)
    if canonical == "problem_based":
        return "문제 해결형"
    return "개념 설명형"


def _compact_reasoning_for_sections_prompt(reasoning: dict[str, Any]) -> dict[str, Any]:
    objectives = reasoning.get("learning_objectives")
    prerequisites = reasoning.get("prerequisite_concepts")

    compact_objectives = []
    if isinstance(objectives, list):
        compact_objectives = [
            _truncate_text(str(item).strip(), 120)
            for item in objectives[:4]
            if str(item).strip()
        ]

    compact_prerequisites = []
    if isinstance(prerequisites, list):
        compact_prerequisites = [
            _truncate_text(str(item).strip(), 80)
            for item in prerequisites[:6]
            if str(item).strip()
        ]

    return {
        "learning_objectives": compact_objectives,
        "prerequisite_concepts": compact_prerequisites,
        "why_this_topic": _truncate_text(str(reasoning.get("why_this_topic") or "").strip(), 220),
        "teaching_strategy": _truncate_text(str(reasoning.get("teaching_strategy") or "").strip(), 220),
        "difficulty_calibration": _truncate_text(str(reasoning.get("difficulty_calibration") or "").strip(), 180),
        "connection_to_goal": _truncate_text(str(reasoning.get("connection_to_goal") or "").strip(), 220),
    }


def _compact_personalization_for_prompt(payload: ReasoningRequest) -> dict[str, Any]:
    feedback_rows = payload.learnerFeedback if isinstance(payload.learnerFeedback, list) else []
    concept_rows = payload.learnerConceptFocus if isinstance(payload.learnerConceptFocus, list) else []

    recent_feedback: list[dict[str, Any]] = []
    difficult_concepts: list[str] = []

    for row in feedback_rows[-4:]:
        if not isinstance(row, dict):
            continue
        rating_raw = row.get("understanding_rating")
        rating = rating_raw if isinstance(rating_raw, int) else _safe_int(rating_raw, 0)
        concepts_raw = row.get("difficult_concepts")
        concepts = [
            _truncate_text(str(item).strip(), 40)
            for item in (concepts_raw if isinstance(concepts_raw, list) else [])
            if str(item).strip()
        ][:4]
        if 1 <= rating <= 5:
            recent_feedback.append(
                {
                    "understanding_rating": rating,
                    "difficult_concepts": concepts,
                }
            )
        difficult_concepts.extend(concepts)

    risk_focus: list[dict[str, Any]] = []
    for row in concept_rows[:6]:
        if not isinstance(row, dict):
            continue
        concept_tag = str(row.get("concept_tag") or "").strip()
        if not concept_tag:
            continue
        risk_focus.append(
            {
                "concept_tag": _truncate_text(concept_tag, 40),
                "mastery_score": max(0, min(100, _safe_int(row.get("mastery_score"), 0))),
                "forgetting_risk": max(0, min(100, _safe_int(row.get("forgetting_risk"), 0))),
                "confidence_score": max(0, min(100, _safe_int(row.get("confidence_score"), 0))),
            }
        )

    deduped_difficult = list(dict.fromkeys([item for item in difficult_concepts if item]))
    low_rated = sum(1 for row in recent_feedback if row["understanding_rating"] <= 3)

    return {
        "recent_feedback": recent_feedback[-3:],
        "difficult_concepts": deduped_difficult[:6],
        "concept_focus": risk_focus[:4],
        "low_understanding_count": low_rated,
    }


def _extract_topic_keywords(topic: str) -> list[str]:
    raw_tokens = re.findall(r"[A-Za-z가-힣0-9_#+.-]+", topic.lower())
    skip = {"핵심", "토픽", "주제", "학습", "실전", "과제", "보강", "섹션"}
    tokens: list[str] = []
    for token in raw_tokens:
        normalized = token.strip("._- ")
        if len(normalized) < 2:
            continue
        if normalized.isdigit():
            continue
        if normalized in skip:
            continue
        if normalized not in tokens:
            tokens.append(normalized)
    return tokens[:5]


def _count_non_empty_lines(code: str) -> int:
    return len([line for line in code.splitlines() if line.strip()])


def _is_placeholder_like(text: str) -> bool:
    lowered = text.strip().lower()
    if not lowered:
        return True
    placeholders = [
        "핵심 내용을 정리합니다",
        "핵심 포인트를 확인하세요",
        "간단한 예제를 실행해 동작을 확인합니다",
        "다음 단계로 넘어갑니다",
        "hello world",
    ]
    return any(item in lowered for item in placeholders)


def _normalize_option_text(value: Any) -> str:
    return normalize_option_text(value)


def _is_placeholder_option(text: str) -> bool:
    return is_placeholder_option(text)


def _extract_enumerated_options(*sources: Any) -> list[str]:
    return extract_enumerated_options(*sources, max_options=4)


def _normalize_section_options(
    options_value: Any,
    *,
    question: str,
    body: str,
    explanation: str,
) -> list[str]:
    options = options_value if isinstance(options_value, list) else []
    normalized: list[str] = []

    for option in options:
        candidate = _normalize_option_text(option)
        if not candidate or _is_placeholder_option(candidate):
            continue
        if candidate not in normalized:
            normalized.append(candidate)
        if len(normalized) >= 4:
            return normalized

    extracted = _extract_enumerated_options(question, body, explanation)
    for candidate in extracted:
        if candidate not in normalized:
            normalized.append(candidate)
        if len(normalized) >= 4:
            break

    return normalized[:4]


def _sections_quality_issues(result: dict[str, Any], payload: ReasoningRequest) -> list[str]:
    sections = result.get("sections")
    if not isinstance(sections, list) or not sections:
        return ["sections_missing"]

    type_map = {
        "concept": [],
        "example": [],
        "check": [],
        "summary": [],
    }

    for section in sections:
        if not isinstance(section, dict):
            continue
        section_type = str(section.get("type") or "").strip()
        if section_type in type_map:
            type_map[section_type].append(section)

    issues: list[str] = []
    if len(type_map["concept"]) < 1:
        issues.append("concept_missing")
    if len(type_map["example"]) < 1:
        issues.append("example_missing")
    if len(type_map["summary"]) < 1:
        issues.append("summary_missing")
    if len(type_map["check"]) < 2:
        issues.append("check_count_lt_2")

    if type_map["concept"]:
        concept_body = str(type_map["concept"][0].get("body") or "").strip()
        if len(concept_body) < 160:
            issues.append("concept_body_too_short")
        if _is_placeholder_like(concept_body):
            issues.append("concept_body_placeholder")

    if type_map["example"]:
        example = type_map["example"][0]
        example_code = str(example.get("code") or "").strip()
        example_explanation = str(example.get("explanation") or "").strip()
        if _count_non_empty_lines(example_code) < 6:
            issues.append("example_code_too_short")
        if "hello world" in example_code.lower():
            issues.append("example_code_generic")
        if len(example_explanation) < 70:
            issues.append("example_explanation_too_short")

    for index, check in enumerate(type_map["check"][:2], start=1):
        question = str(check.get("question") or "").strip()
        explanation = str(check.get("explanation") or "").strip()
        options = check.get("options")
        valid_options = [
            _normalize_option_text(item)
            for item in (options if isinstance(options, list) else [])
            if str(item).strip()
        ]
        meaningful_options = [item for item in valid_options if item and not _is_placeholder_option(item)]
        if len(question) < 24:
            issues.append(f"check{index}_question_too_short")
        if len(explanation) < 50:
            issues.append(f"check{index}_explanation_too_short")
        if len(meaningful_options) < 4:
            issues.append(f"check{index}_options_invalid")

    keywords = _extract_topic_keywords(payload.topic)
    if keywords:
        combined = " ".join(
            f"{str(section.get('title') or '')} {str(section.get('body') or '')} "
            f"{str(section.get('question') or '')} {str(section.get('explanation') or '')}"
            for section in sections
            if isinstance(section, dict)
        ).lower()
        if not any(keyword in combined for keyword in keywords):
            issues.append("topic_keyword_missing")

    return issues


def _assert_sections_quality(result: dict[str, Any], payload: ReasoningRequest) -> None:
    issues = _sections_quality_issues(result, payload)
    if issues:
        raise ValueError(f"quality_validation_failed:{'|'.join(issues[:6])}")


def _safe_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
        return parsed
    except Exception:
        return fallback


def _safe_float(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
        return parsed
    except Exception:
        return fallback


def _normalize_assessment_difficulty(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if "hard" in raw or "상" in raw:
        return "hard"
    if "medium" in raw or "mid" in raw or "중" in raw:
        return "medium"
    return "easy"


def _normalize_assessment_options(value: Any) -> list[str]:
    items = value if isinstance(value, list) else []
    options = [str(item).strip() for item in items if str(item).strip()]
    while len(options) < 4:
        options.append(f"선택지 {len(options) + 1}")
    return options[:4]


def _fallback_assessment_questions(goal: str) -> dict[str, Any]:
    return {
        "questions": [
            {
                "id": 1,
                "question": f'"{goal}" 학습을 시작할 때 가장 중요한 첫 단계는?',
                "options": ["핵심 개념 정의 이해", "코드 복붙", "정답 암기", "무작정 구현"],
                "correct_answer": 0,
                "difficulty": "easy",
                "topic_area": "기초 개념",
            },
            {
                "id": 2,
                "question": "문제 해결 과정에서 디버깅 로그를 남기는 주된 이유는?",
                "options": ["원인 추적", "속도 향상", "코드 길이 증가", "테마 변경"],
                "correct_answer": 0,
                "difficulty": "easy",
                "topic_area": "디버깅",
            },
            {
                "id": 3,
                "question": "시간 복잡도를 고려해 구현을 개선할 때 먼저 확인할 것은?",
                "options": ["병목 구간", "변수명 길이", "주석 개수", "파일 확장자"],
                "correct_answer": 0,
                "difficulty": "medium",
                "topic_area": "성능 분석",
            },
            {
                "id": 4,
                "question": "API 설계에서 입력 검증이 중요한 가장 큰 이유는?",
                "options": ["안정성과 보안", "응답 길이 증가", "개발자 수 증가", "배포 횟수 감소"],
                "correct_answer": 0,
                "difficulty": "medium",
                "topic_area": "API 설계",
            },
            {
                "id": 5,
                "question": "실전 서비스에서 장애 대응 우선순위로 가장 적절한 것은?",
                "options": ["영향도 큰 이슈부터 격리/완화", "전체 리팩터링", "UI 색상 수정", "문서만 업데이트"],
                "correct_answer": 0,
                "difficulty": "hard",
                "topic_area": "운영 대응",
            },
        ]
    }


def _normalize_assessment_questions(raw: dict[str, Any], goal: str) -> dict[str, Any]:
    fallback = _fallback_assessment_questions(goal)
    raw_items = raw.get("questions")
    if not isinstance(raw_items, list) or not raw_items:
        return fallback

    questions: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_items[:8]):
        if not isinstance(item, dict):
            item = {}
        qid = _safe_int(item.get("id"), idx + 1)
        question = _as_non_empty_str(item.get("question"), f"문항 {idx + 1}")
        options = _normalize_assessment_options(item.get("options"))
        correct = _safe_int(item.get("correct_answer"), 0)
        correct = max(0, min(3, correct))
        difficulty = _normalize_assessment_difficulty(item.get("difficulty"))
        topic_area = _as_non_empty_str(item.get("topic_area"), "핵심 개념")

        questions.append(
            {
                "id": qid,
                "question": question,
                "options": options,
                "correct_answer": correct,
                "difficulty": difficulty,
                "topic_area": topic_area,
            }
        )

    used: set[int] = set()
    for i, question in enumerate(questions):
        qid = question["id"]
        while qid in used:
            qid += 1
        question["id"] = qid
        used.add(qid)

    while len(questions) < 5:
        idx = len(questions) + 1
        questions.append(
            {
                "id": idx,
                "question": f'"{goal}" 학습 핵심을 고르세요. ({idx})',
                "options": ["개념 이해", "정답 암기", "무작정 구현", "관련 없는 선택"],
                "correct_answer": 0,
                "difficulty": "medium",
                "topic_area": "학습 전략",
            }
        )

    return {"questions": questions[:10]}


def _build_assessment_questions_prompts(payload: AssessmentQuestionsRequest) -> tuple[str, str]:
    system_prompt = """당신은 프로그래밍 교육 진단 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "questions": [
    {
      "id": 1,
      "question": "질문",
      "options": ["선택지1","선택지2","선택지3","선택지4"],
      "correct_answer": 0,
      "difficulty": "easy",
      "topic_area": "기초 문법"
    }
  ]
}
규칙:
- 5~8문항
- difficulty는 easy|medium|hard 중 하나
- id는 숫자, 중복 금지"""
    interests = ", ".join(payload.interests) if payload.interests else "없음"
    user_prompt = (
        f"학습 목표: {payload.goal}\n"
        f"배경: {payload.background or '정보 없음'}\n"
        f"관심사: {interests}\n"
        "목표 달성에 필요한 진단 문제를 생성하세요."
    )
    return system_prompt, user_prompt


def _build_rule_assessment_result(payload: AssessmentAnalyzeRequest) -> dict[str, Any]:
    answer_map = {answer.question_id: answer.selected for answer in payload.answers}
    difficulty_weight = {"easy": 1, "medium": 2, "hard": 3}

    weighted_total = 0
    weighted_correct = 0
    answered_count = 0
    correct_count = 0
    topic_stats: dict[str, dict[str, float]] = {}

    for question in payload.questions:
        weight = difficulty_weight.get(_normalize_assessment_difficulty(question.difficulty), 1)
        selected = answer_map.get(question.id, -1)
        is_answered = isinstance(selected, int) and selected >= 0
        is_correct = is_answered and selected == question.correct_answer

        weighted_total += weight
        if is_correct:
            weighted_correct += weight
            correct_count += 1
        if is_answered:
            answered_count += 1

        topic = question.topic_area.strip() or "핵심 개념"
        current = topic_stats.get(topic, {"weighted_total": 0.0, "weighted_correct": 0.0})
        current["weighted_total"] += float(weight)
        if is_correct:
            current["weighted_correct"] += float(weight)
        topic_stats[topic] = current

    weighted_accuracy = (weighted_correct / weighted_total) if weighted_total > 0 else 0.0
    answer_rate = (answered_count / len(payload.questions)) if payload.questions else 0.0
    effective_score = weighted_accuracy * 0.85 + answer_rate * 0.15

    level = "beginner"
    if effective_score >= 0.75:
        level = "advanced"
    elif effective_score >= 0.45:
        level = "intermediate"

    entries: list[tuple[str, float, float]] = []
    for topic, stat in topic_stats.items():
        total = stat["weighted_total"]
        accuracy = (stat["weighted_correct"] / total) if total > 0 else 0.0
        entries.append((topic, accuracy, total))

    entries.sort(key=lambda item: (-item[1], -item[2]))
    strengths = [topic for topic, accuracy, _ in entries if accuracy >= 0.75][:3]

    weak_entries = sorted(entries, key=lambda item: (item[1], -item[2]))
    weaknesses = [topic for topic, accuracy, _ in weak_entries if accuracy < 0.65][:4]
    if not weaknesses:
        weaknesses = ["실전 문제 적용력"]

    accuracy_pct = round(weighted_accuracy * 100)
    level_label = {"beginner": "초급", "intermediate": "중급", "advanced": "고급"}[level]
    summary = (
        f"총 {len(payload.questions)}문항 중 {correct_count}문항 정답"
        f"(가중 정확도 {accuracy_pct}%)으로 {level_label} 수준으로 판단됩니다."
    )

    return {
        "level": level,
        "summary": summary,
        "strengths": strengths,
        "weaknesses": weaknesses,
    }


def _normalize_curriculum_level(level: str) -> str:
    raw = level.strip().lower()
    if raw in {"advanced", "고급"}:
        return "advanced"
    if raw in {"intermediate", "중급"}:
        return "intermediate"
    return "beginner"


def _topic_count_policy(payload: CurriculumGenerateRequest) -> tuple[int, int]:
    normalized = _normalize_curriculum_level(payload.level)
    if normalized == "advanced":
        base_target = 16
    elif normalized == "intermediate":
        base_target = 14
    else:
        base_target = 12

    weekly_hours = max(1, min(int(payload.weeklyStudyHours or 5), 30))
    hour_bonus = max(0, (weekly_hours - 5 + 1) // 2)

    goal_type = str(payload.goalType or "").strip().lower()
    goal_bonus = 0
    if goal_type in {"career", "job", "취업", "이직"}:
        goal_bonus = 2
    elif goal_type in {"certification", "exam", "자격증", "시험"}:
        goal_bonus = 3
    elif goal_type in {"project", "portfolio", "프로젝트"}:
        goal_bonus = 1

    # 학습 시간/목표 유형을 반영해 목표 토픽 수와 최소 토픽 수를 동적으로 계산한다.
    target = min(24, base_target + hour_bonus + goal_bonus)
    minimum = max(10, target - 3)
    return target, minimum


def _contains_hangul(text: str) -> bool:
    return any("가" <= ch <= "힣" for ch in text)


def _looks_non_korean(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    has_latin = any(("a" <= ch.lower() <= "z") for ch in stripped)
    return has_latin and not _contains_hangul(stripped)


def _fallback_curriculum(payload: CurriculumGenerateRequest) -> dict[str, Any]:
    topic_count, _ = _topic_count_policy(payload)
    topics: list[dict[str, Any]] = []
    for idx in range(topic_count):
        is_practice = idx in {max(2, topic_count // 3), max(3, (topic_count * 2) // 3), topic_count - 1}
        title = f"{idx + 1}. {'실전 과제' if is_practice else '핵심 토픽'} {idx + 1}"
        description = (
            f"{payload.goal} 달성을 위해 필요한 개념을 학습하고, "
            f"{'작은 결과물을 구현해 검증합니다.' if is_practice else '예제로 이해를 점검합니다.'}"
        )
        topics.append(
            {
                "title": title,
                "description": description,
                "estimated_minutes": 90 if is_practice else 60,
            }
        )

    total_hours = round(sum(topic["estimated_minutes"] for topic in topics) / 60, 1)
    return {
        "title": f"{payload.goal} 맞춤 커리큘럼",
        "topics": topics,
        "total_estimated_hours": max(1.0, total_hours),
        "summary": "목표 달성을 위해 개념 학습과 실전 적용을 균형 있게 배치한 경로입니다.",
    }


def _normalize_curriculum(
    raw: dict[str, Any],
    payload: CurriculumGenerateRequest,
    *,
    strict: bool = False,
) -> dict[str, Any]:
    raw_topics = raw.get("topics")
    if not isinstance(raw_topics, list) or not raw_topics:
        raise ValueError("curriculum_topics_missing")

    topics: list[dict[str, Any]] = []
    seen: set[str] = set()
    for idx, item in enumerate(raw_topics[:30]):
        if not isinstance(item, dict):
            item = {}

        title = _as_non_empty_str(item.get("title"), f"토픽 {idx + 1}" if strict else f"핵심 토픽 {idx + 1}")
        if _looks_non_korean(title) and not strict:
            title = f"핵심 토픽 {idx + 1}"
        key = "".join(title.lower().split())
        # 동일 제목(공백/대소문자 차이 포함)은 한 번만 반영한다.
        if key in seen:
            continue
        seen.add(key)

        description = _as_non_empty_str(
            item.get("description"),
            f"{title} 학습 내용을 구체적으로 설명합니다." if strict else f"{title}의 핵심 개념을 학습하고 실습으로 이해를 검증합니다.",
        )
        if _looks_non_korean(description) and not strict:
            description = f"{title}의 핵심을 학습하고 {payload.goal} 목표에 맞는 실습으로 이해를 확인합니다."

        estimated = _safe_int(item.get("estimated_minutes"), 50)
        estimated = max(35, min(90, estimated))
        topics.append(
            {
                "title": title,
                "description": description,
                "estimated_minutes": estimated,
            }
        )

    target, minimum = _topic_count_policy(payload)
    if not strict:
        if len(topics) < minimum:
            start = len(topics)
            for idx in range(start, minimum):
                is_practice = idx in {max(2, minimum // 3), max(3, (minimum * 2) // 3), minimum - 1}
                topics.append(
                    {
                        "title": f"{idx + 1}. {'실전 과제' if is_practice else '핵심 토픽'}",
                        "description": (
                            f"{payload.goal} 목표에 필요한 내용을 학습하고 "
                            f"{'작은 결과물을 만들어 검증합니다.' if is_practice else '예제 실습으로 이해를 점검합니다.'}"
                        ),
                        "estimated_minutes": 70 if is_practice else 50,
                    }
                )

        if len(topics) < target:
            for idx in range(len(topics), target):
                topics.append(
                    {
                        "title": f"{idx + 1}. 보강 토픽",
                        "description": f"{payload.goal} 목표 달성을 위해 필요한 보강 학습을 진행합니다.",
                        "estimated_minutes": 45,
                    }
                )

    title = _as_non_empty_str(raw.get("title"), f"{payload.goal} 맞춤 커리큘럼")
    if _looks_non_korean(title) and not strict:
        title = "맞춤 학습 커리큘럼"

    summary = _as_non_empty_str(raw.get("summary"), "학습 목표 달성을 위한 단계별 학습 경로입니다.")
    if _looks_non_korean(summary) and not strict:
        summary = "학습 목표 달성을 위해 기초부터 실전까지 단계적으로 학습하도록 구성했습니다."

    total_hours = round(sum(topic["estimated_minutes"] for topic in topics) / 60, 1)

    return {
        "title": title,
        "topics": topics,
        "total_estimated_hours": max(1.0, total_hours),
        "summary": summary,
    }


def _is_generic_curriculum_topic_title(title: str) -> bool:
    normalized = re.sub(r"\s+", " ", title.strip().lower())
    if not normalized:
        return True
    if re.fullmatch(r"\d+\s*\.?\s*(핵심 토픽|보강 토픽|실전 과제)\s*\d*", normalized):
        return True
    return normalized in {"핵심 토픽", "보강 토픽", "실전 과제", "topic"}


def _is_practice_curriculum_topic(topic: dict[str, Any]) -> bool:
    text = f"{str(topic.get('title') or '')} {str(topic.get('description') or '')}".lower()
    keywords = ["실습", "프로젝트", "구현", "과제", "포트폴리오", "미니 프로젝트", "mini project", "응용"]
    return any(keyword in text for keyword in keywords)


def _curriculum_quality_issues(result: dict[str, Any], payload: CurriculumGenerateRequest) -> list[str]:
    topics = result.get("topics")
    if not isinstance(topics, list) or not topics:
        return ["curriculum_topics_missing"]

    issues: list[str] = []
    _, minimum = _topic_count_policy(payload)
    if len(topics) < minimum:
        issues.append(f"topic_count_lt_minimum:{len(topics)}<{minimum}")

    title = str(result.get("title") or "").strip()
    summary = str(result.get("summary") or "").strip()
    if _looks_non_korean(title):
        issues.append("title_non_korean")
    if _looks_non_korean(summary):
        issues.append("summary_non_korean")
    if len(summary) < 50:
        issues.append("summary_too_short")

    practice_count = 0
    generic_title_count = 0
    for idx, topic in enumerate(topics[:24], start=1):
        if not isinstance(topic, dict):
            issues.append(f"topic{idx}_invalid")
            continue
        topic_title = str(topic.get("title") or "").strip()
        topic_description = str(topic.get("description") or "").strip()
        if len(topic_title) < 6:
            issues.append(f"topic{idx}_title_too_short")
        if _looks_non_korean(topic_title):
            issues.append(f"topic{idx}_title_non_korean")
        if _is_generic_curriculum_topic_title(topic_title):
            generic_title_count += 1
        if len(topic_description) < 45:
            issues.append(f"topic{idx}_description_too_short")
        if _looks_non_korean(topic_description):
            issues.append(f"topic{idx}_description_non_korean")
        if _is_practice_curriculum_topic(topic):
            practice_count += 1

    if generic_title_count > 0:
        issues.append(f"generic_topic_titles:{generic_title_count}")
    if practice_count < 3:
        issues.append("practice_topic_count_lt_3")

    goal_keywords = _extract_topic_keywords(payload.goal)
    if goal_keywords:
        combined = " ".join(
            f"{str(topic.get('title') or '')} {str(topic.get('description') or '')}"
            for topic in topics
            if isinstance(topic, dict)
        ).lower()
        if not any(keyword in combined for keyword in goal_keywords):
            issues.append("goal_relevance_low")

    return issues


def _assert_curriculum_quality(result: dict[str, Any], payload: CurriculumGenerateRequest) -> None:
    issues = _curriculum_quality_issues(result, payload)
    if issues:
        raise ValueError(f"quality_validation_failed:{'|'.join(issues[:8])}")


def _build_curriculum_prompts(
    payload: CurriculumGenerateRequest,
    *,
    retry_mode: bool = False,
) -> tuple[str, str]:
    topic_target, topic_minimum = _topic_count_policy(payload)
    system_prompt = """당신은 프로그래밍 커리큘럼 설계 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "title": "string",
  "topics": [{"title":"string","description":"string","estimated_minutes":60}],
  "total_estimated_hours": 12.5,
  "summary": "string"
}
규칙:
- topics는 목표 중심으로 순차 구성
- 모든 title/description/summary는 반드시 한국어로 작성
- 최소 3개 실습/프로젝트 토픽 포함
- estimated_minutes는 35~90 정수
- 너무 넓은 토픽보다 작고 구체적인 학습 단위로 나눌 것
- title은 '핵심 토픽', '보강 토픽' 같은 일반명 금지
- 각 description은 최소 45자 이상, 실행/산출물 기준 포함"""
    if retry_mode:
        system_prompt += "\n- 이전 시도는 품질 기준 미달이었으므로 추상 표현 없이 구체적인 스택/개념/산출물 중심으로 작성"
    user_prompt = (
        f"학습 목표: {payload.goal}\n"
        f"현재 수준: {payload.level}\n"
        f"강점: {', '.join(payload.strengths) if payload.strengths else '없음'}\n"
        f"약점: {', '.join(payload.weaknesses) if payload.weaknesses else '없음'}\n"
        f"배경: {payload.background or '정보 없음'}\n"
        f"관심사: {', '.join(payload.interests) if payload.interests else '없음'}\n"
        f"목표 유형: {payload.goalType}\n"
        f"주당 학습 시간: {payload.weeklyStudyHours}\n"
        f"학습 스타일: {payload.learningStyle}\n"
        f"토픽 수는 최소 {topic_minimum}개, 목표 {topic_target}개로 구성하세요.\n"
        "응답 전체는 한국어로 작성하세요."
    )
    return system_prompt, user_prompt


def _generate_curriculum_with_quality(
    *,
    ai_service: Any,
    payload: CurriculumGenerateRequest,
    retry_mode: bool,
) -> dict[str, Any]:
    system_prompt, user_prompt = _build_curriculum_prompts(payload, retry_mode=retry_mode)
    raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
    normalized = _normalize_curriculum(raw, payload, strict=True)
    _assert_curriculum_quality(normalized, payload)
    return normalized


def _build_refine_prompts(payload: CurriculumRefineRequest) -> tuple[str, str]:
    system_prompt = """당신은 커리큘럼 리라이팅 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "title": "string",
  "topics": [{"title":"string","description":"string","estimated_minutes":60}],
  "total_estimated_hours": 12.5,
  "summary": "string"
}"""
    current_topics = "\n".join(
        f"{idx + 1}. {topic.title} ({topic.estimated_minutes}분) - {topic.description}"
        for idx, topic in enumerate(payload.currentCurriculum.topics)
    )
    chat_log = "\n".join(f"{msg.role}: {msg.content}" for msg in payload.chatHistory[-6:])
    user_prompt = (
        f"현재 커리큘럼 제목: {payload.currentCurriculum.title}\n"
        f"현재 토픽:\n{current_topics}\n"
        f"대화 이력:\n{chat_log or '없음'}\n"
        f"사용자 요청: {payload.userMessage}\n"
        "요청을 반영해 같은 스키마로 수정된 커리큘럼을 반환하세요."
    )
    return system_prompt, user_prompt


def _fallback_reasoning(payload: ReasoningRequest) -> dict[str, Any]:
    return {
        "learning_objectives": [f"{payload.topic}의 핵심 개념을 설명할 수 있다", f"{payload.topic}를 코드로 적용할 수 있다"],
        "prerequisite_concepts": ["기본 문법", "함수/데이터 구조 기초"],
        "why_this_topic": f"{payload.curriculumGoal} 목표 달성을 위해 {payload.topic}가 핵심 기반이 됩니다.",
        "teaching_strategy": "짧은 개념 설명 후 즉시 예제와 확인 문제를 통해 이해를 고정합니다.",
        "difficulty_calibration": f"{payload.learnerLevel} 수준에 맞춰 난이도를 단계적으로 높입니다.",
        "connection_to_goal": f"이 토픽을 마치면 {payload.curriculumGoal}으로 가는 다음 실습 단계에 바로 연결됩니다.",
    }


def _normalize_reasoning(raw: dict[str, Any], payload: ReasoningRequest) -> dict[str, Any]:
    fallback = _fallback_reasoning(payload)
    return {
        "learning_objectives": raw.get("learning_objectives") if isinstance(raw.get("learning_objectives"), list) and raw.get("learning_objectives") else fallback["learning_objectives"],
        "prerequisite_concepts": raw.get("prerequisite_concepts") if isinstance(raw.get("prerequisite_concepts"), list) and raw.get("prerequisite_concepts") else fallback["prerequisite_concepts"],
        "why_this_topic": _as_non_empty_str(raw.get("why_this_topic"), fallback["why_this_topic"]),
        "teaching_strategy": _as_non_empty_str(raw.get("teaching_strategy"), fallback["teaching_strategy"]),
        "difficulty_calibration": _as_non_empty_str(raw.get("difficulty_calibration"), fallback["difficulty_calibration"]),
        "connection_to_goal": _as_non_empty_str(raw.get("connection_to_goal"), fallback["connection_to_goal"]),
    }


def _build_reasoning_prompts(payload: ReasoningRequest) -> tuple[str, str]:
    personalization = _compact_personalization_for_prompt(payload)
    teaching_method = _teaching_method_label(payload.teachingMethod)
    system_prompt = """당신은 프로그래밍 학습 설계 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "learning_objectives": ["string"],
  "prerequisite_concepts": ["string"],
  "why_this_topic": "string",
  "teaching_strategy": "string",
  "difficulty_calibration": "string",
  "connection_to_goal": "string"
}
규칙:
- 학습자의 약점/어려웠던 개념을 직접 반영
- 너무 일반적인 설명 금지, 토픽 관련 실수 포인트를 반드시 포함
- 응답은 한국어로 작성"""
    user_prompt = (
        f"커리큘럼 목표: {payload.curriculumGoal}\n"
        f"현재 토픽: {payload.topic}\n"
        f"토픽 설명: {payload.topicDescription}\n"
        f"수준: {payload.learnerLevel}, 언어: {payload.language}\n"
        f"설명 방식: {teaching_method}\n"
        f"학습 스타일(활동 리듬): {payload.learningStyle}\n"
        "해석 규칙: 설명 방식은 해설 톤/피드백 방식, 학습 스타일은 순차/반복/누적 학습 흐름을 의미합니다.\n"
        f"이전 토픽: {', '.join(payload.prevTopics) if payload.prevTopics else '없음'}\n"
        f"다음 토픽: {', '.join(payload.nextTopics) if payload.nextTopics else '없음'}\n"
        f"개인화 신호: {json.dumps(personalization, ensure_ascii=False)}\n"
        "학습 설계 관점에서 분석 결과를 생성하세요.\n"
        "특히 difficult_concepts, concept_focus의 위험 개념을 우선 반영하세요."
    )
    return system_prompt, user_prompt


def _normalize_section(item: Any, idx: int, topic: str) -> dict[str, Any]:
    if not isinstance(item, dict):
        item = {}

    section_type = _as_non_empty_str(item.get("type"), "concept")
    title = _as_non_empty_str(item.get("title"), f"{topic} 섹션 {idx + 1}")
    body = _as_non_empty_str(item.get("body"), f"{topic} 핵심 내용을 정리합니다.")
    code = _as_non_empty_str(item.get("code"), "" if section_type != "example" else "print('hello world')")
    explanation = _as_non_empty_str(item.get("explanation"), "핵심 포인트를 확인하세요.")
    question = _as_non_empty_str(item.get("question"), f"{topic} 이해 확인 문제")
    normalized_options = (
        _normalize_section_options(
            item.get("options"),
            question=question,
            body=body,
            explanation=explanation,
        )
        if section_type == "check"
        else []
    )
    correct_answer = max(0, min(3, _safe_int(item.get("correct_answer"), 0)))
    if correct_answer >= len(normalized_options):
        correct_answer = 0

    next_preview = ""
    if section_type == "summary":
        next_preview = _as_non_empty_str(item.get("next_preview"), "다음 토픽으로 이어집니다.")

    return {
        "type": section_type,
        "title": title,
        "body": body,
        "code": code,
        "explanation": explanation,
        "question": question,
        "options": normalized_options[:4],
        "correct_answer": correct_answer,
        "next_preview": next_preview,
    }


def _fallback_sections(payload: ReasoningRequest, reasoning: dict[str, Any]) -> dict[str, Any]:
    title = f"{payload.topic} 학습 세션"
    strategy = _as_non_empty_str(reasoning.get("teaching_strategy"), "핵심 개념 후 즉시 적용")
    return {
        "title": title,
        "sections": [
            {
                "type": "concept",
                "title": f"{payload.topic} 핵심 개념",
                "body": (
                    f"{_as_non_empty_str(reasoning.get('why_this_topic'), f'{payload.topic}가 중요한 이유를 설명합니다.')}\n\n"
                    f"이번 섹션에서는 {payload.topic}의 핵심 정의와 자주 발생하는 실수를 먼저 정리합니다. "
                    "그 다음 예제를 통해 입력-처리-출력 흐름을 단계적으로 확인합니다."
                ),
                "code": "",
                "explanation": strategy,
                "question": "",
                "options": ["", "", "", ""],
                "correct_answer": 0,
                "next_preview": "",
            },
            {
                "type": "example",
                "title": f"{payload.topic} 기본 예제",
                "body": f"{payload.topic} 개념을 작은 함수 단위로 구현하고 결과를 확인합니다.",
                "code": (
                    "def process_items(items):\n"
                    "    cleaned = []\n"
                    "    for raw in items:\n"
                    "        value = raw.strip()\n"
                    "        if not value:\n"
                    "            continue\n"
                    "        cleaned.append(value)\n"
                    "    return cleaned\n\n"
                    "sample = [' alpha ', '', 'beta', '  gamma']\n"
                    "print(process_items(sample))"
                ),
                "explanation": (
                    "입력값 정제, 예외 입력 처리, 결과 반환 순서를 분리해서 보면 "
                    f"{payload.topic}의 핵심 처리 흐름을 더 안정적으로 이해할 수 있습니다."
                ),
                "question": "",
                "options": ["", "", "", ""],
                "correct_answer": 0,
                "next_preview": "",
            },
            {
                "type": "check",
                "title": "개념 확인 문제 1",
                "body": "",
                "code": "",
                "explanation": (
                    "핵심 개념의 정의와 사용 목적을 연결해야 실전에서 구현 순서를 안정적으로 잡을 수 있습니다. "
                    "정답을 고른 뒤 왜 나머지 선택지가 아닌지도 함께 확인하세요."
                ),
                "question": f"{payload.topic} 학습에서 가장 먼저 확인할 것은?",
                "options": ["핵심 개념 이해", "결과 암기", "무작정 구현", "관련 없는 설정"],
                "correct_answer": 0,
                "next_preview": "",
            },
            {
                "type": "check",
                "title": "응용 확인 문제 2",
                "body": "",
                "code": "",
                "explanation": (
                    "실무 문제에서는 요구사항을 먼저 분해하고 검증 포인트를 정한 뒤 구현해야 오류 전파를 줄일 수 있습니다. "
                    "정답 선택의 근거를 처리 순서 관점에서 설명해 보세요."
                ),
                "question": f"{payload.topic}를 실전에 적용할 때 우선순위로 맞는 것은?",
                "options": ["요구사항 분석 후 단계 구현", "정답 암기", "예외 무시", "로그 제거"],
                "correct_answer": 0,
                "next_preview": "",
            },
            {
                "type": "summary",
                "title": "학습 요약",
                "body": _as_non_empty_str(reasoning.get("connection_to_goal"), "다음 토픽으로 연결할 준비가 되었습니다."),
                "code": "",
                "explanation": "핵심 개념을 다시 한 번 복습하세요.",
                "question": "",
                "options": ["", "", "", ""],
                "correct_answer": 0,
                "next_preview": "다음 토픽으로 이어집니다.",
            },
        ],
    }


def _normalize_sections(raw: dict[str, Any], payload: ReasoningRequest, reasoning: dict[str, Any]) -> dict[str, Any]:
    fallback = _fallback_sections(payload, reasoning)
    raw_sections = raw.get("sections")
    if not isinstance(raw_sections, list) or not raw_sections:
        return fallback

    sections = [_normalize_section(item, idx, payload.topic) for idx, item in enumerate(raw_sections[:20])]
    check_count = sum(1 for section in sections if section["type"] == "check")
    if check_count < 2:
        fallback_checks = [section for section in fallback["sections"] if section["type"] == "check"]
        sections.extend(fallback_checks[: 2 - check_count])

    return {
        "title": _as_non_empty_str(raw.get("title"), fallback["title"]),
        "sections": sections,
    }


def _build_sections_prompts(
    payload: ReasoningRequest,
    reasoning: dict[str, Any],
    *,
    retry_mode: bool = False,
) -> tuple[str, str]:
    compact_reasoning = _compact_reasoning_for_sections_prompt(reasoning)
    personalization = _compact_personalization_for_prompt(payload)
    topic_description = _truncate_text(payload.topicDescription or "", 160 if retry_mode else 240)
    teaching_method = _teaching_method_label(payload.teachingMethod)
    system_prompt = """당신은 프로그래밍 학습 콘텐츠 작성자입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "title":"string",
  "sections":[
    {
      "type":"concept|example|check|summary",
      "title":"string",
      "body":"string",
      "code":"string",
      "explanation":"string",
      "question":"string",
      "options":["string","string","string","string"],
      "correct_answer":0,
      "next_preview":"string"
    }
  ]
}
규칙:
- sections는 concept 1개, example 1개, check 2개 이상, summary 1개 이상 포함
- concept.body는 최소 160자 이상
- example.code는 최소 6줄 이상, hello world 같은 일반 예제 금지
- 각 check 섹션은 4지선다 + explanation 50자 이상
- next_preview는 summary 섹션에만 작성하고, 나머지는 빈 문자열
- 토픽/개인화 신호와 직접 연결된 설명 작성"""
    if retry_mode:
        system_prompt += "\n- 이전 시도는 실패했으므로 불필요한 수식 없이 핵심만 간결하게 작성"
    user_prompt = (
        f"목표: {payload.curriculumGoal}\n"
        f"토픽: {payload.topic}\n"
        f"토픽 설명: {topic_description}\n"
        f"수준: {payload.learnerLevel}, 언어: {payload.language}\n"
        f"설명 방식: {teaching_method}\n"
        f"학습 스타일(활동 리듬): {payload.learningStyle}\n"
        "해석 규칙: 설명 방식은 해설 톤/질문 방식, 학습 스타일은 섹션 전개 리듬(순차/반복/누적)을 뜻합니다.\n"
        f"추론 결과(요약): {json.dumps(compact_reasoning, ensure_ascii=False)}\n"
        f"개인화 신호(요약): {json.dumps(personalization, ensure_ascii=False)}\n"
        "개념-예제-확인-요약 흐름으로 섹션을 구성하세요.\n"
        "개인화 신호의 difficult_concepts 또는 concept_focus를 최소 1개 이상 각 섹션에 반영하세요."
    )
    return system_prompt, user_prompt


def _generate_sections_with_quality(
    *,
    ai_service: Any,
    payload: ReasoningRequest,
    reasoning: dict[str, Any],
    retry_mode: bool,
) -> dict[str, Any]:
    system_prompt, user_prompt = _build_sections_prompts(payload, reasoning, retry_mode=retry_mode)
    raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
    normalized = _normalize_sections(raw, payload, reasoning)
    _assert_sections_quality(normalized, payload)
    return normalized


def _as_non_empty_str(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return fallback


def _normalize_code_example(item: Any, *, language: str, idx: int) -> dict[str, str]:
    if not isinstance(item, dict):
        item = {}
    return {
        "title": _as_non_empty_str(item.get("title"), f"예제 {idx}"),
        "code": _as_non_empty_str(item.get("code"), "print('hello world')"),
        "explanation": _as_non_empty_str(item.get("explanation"), "핵심 흐름을 확인하는 예제입니다."),
        "language": _as_non_empty_str(item.get("language"), language),
    }


def _is_quiz_only_mode(payload: GenerateRequest) -> bool:
    return str(payload.contentMode or "").strip().lower() == "quiz_only"


def _target_quiz_count(payload: GenerateRequest) -> int:
    raw = payload.questionCount if isinstance(payload.questionCount, int) else 8
    return max(3, min(20, raw))


def _normalize_quiz(item: Any, *, topic: str) -> dict[str, Any]:
    if not isinstance(item, dict):
        item = {}

    raw_options = item.get("options")
    options: list[str] = []
    if isinstance(raw_options, list):
        for opt in raw_options:
            candidate = _normalize_option_text(opt)
            if not candidate or _is_placeholder_option(candidate):
                continue
            if candidate not in options:
                options.append(candidate)
            if len(options) >= 4:
                break
    if len(options) < 4:
        fallback_options = ["개념 이해", "무작정 구현", "정답 암기", "설정 생략"]
        for opt in fallback_options:
            if opt not in options:
                options.append(opt)
            if len(options) >= 4:
                break

    raw_correct = item.get("correct_answer")
    correct_answer = raw_correct if isinstance(raw_correct, int) else 0
    if correct_answer < 0 or correct_answer >= 4:
        correct_answer = 0

    return {
        "question": _as_non_empty_str(item.get("question"), f"{topic} 학습에서 먼저 확인할 것은 무엇인가요?"),
        "options": options[:4],
        "correct_answer": correct_answer,
        "explanation": _as_non_empty_str(item.get("explanation"), "기초 개념을 먼저 확인하면 학습 효율이 높아집니다."),
    }


def _fallback_quiz_list(topic: str, count: int) -> list[dict[str, Any]]:
    templates = [
        {
            "question": f"{topic}를 학습할 때 가장 먼저 점검할 것은 무엇인가요?",
            "options": ["핵심 개념 정의", "결과만 외우기", "도구 설정 생략", "정답 패턴 암기"],
            "correct_answer": 0,
            "explanation": "핵심 개념을 먼저 이해해야 이후 응용 문제에서 오개념을 줄일 수 있습니다.",
        },
        {
            "question": f"{topic} 관련 문제를 풀 때 오답 분석에서 가장 효과적인 방법은?",
            "options": ["선택지별 오개념 구분", "정답 번호만 기록", "틀린 문제 건너뛰기", "해설 생략"],
            "correct_answer": 0,
            "explanation": "선택지별 오개념을 구분하면 같은 유형의 실수를 반복하지 않게 됩니다.",
        },
        {
            "question": f"{topic}의 개념 이해를 확인하는 문항 구성으로 가장 적절한 것은?",
            "options": ["원리 + 간단한 적용 상황", "정의 암기만 확인", "정답만 고르게 구성", "모든 선택지를 동일하게 작성"],
            "correct_answer": 0,
            "explanation": "개념 문항은 원리와 적용 상황을 함께 확인해야 실전 이해도를 파악할 수 있습니다.",
        },
        {
            "question": f"{topic} 문제를 복습할 때 우선순위로 맞는 것은?",
            "options": ["오답 원인 유형별 재분류", "맞은 문제만 재풀이", "점수만 확인 후 종료", "어려운 문제만 제외"],
            "correct_answer": 0,
            "explanation": "오답 원인을 유형별로 분류하면 취약 개념을 중심으로 복습 계획을 세우기 쉽습니다.",
        },
    ]

    result: list[dict[str, Any]] = []
    for idx in range(max(1, count)):
        base = templates[idx % len(templates)]
        suffix = f" (문항 {idx + 1})" if idx >= len(templates) else ""
        result.append(
            {
                **base,
                "question": f"{base['question']}{suffix}",
            }
        )
    return result


def _fallback_generated_content(payload: GenerateRequest) -> dict[str, Any]:
    quiz_only = _is_quiz_only_mode(payload)
    target_quiz_count = _target_quiz_count(payload) if quiz_only else 2
    fallback_quiz = _fallback_quiz_list(payload.topic, target_quiz_count)
    teaching_method = _teaching_method_label(payload.teachingMethod)

    return {
        "title": (
            f"{payload.topic} 문제 훈련 세트"
            if quiz_only
            else f"{payload.topic} ({payload.language})"
        ),
        "content": (
            f"{payload.topic} 핵심 개념 점검 문제 {target_quiz_count}문항입니다.\n"
            f"난이도: {payload.difficulty}, 대상: {payload.targetAudience}, 해설 스타일: {teaching_method}"
            if quiz_only
            else (
                f"이 응답은 기본 폴백 콘텐츠입니다.\n"
                f"난이도: {payload.difficulty}, 대상: {payload.targetAudience}, 설명 방식: {teaching_method}"
            )
        ),
        "code_examples": [] if quiz_only else [
            {
                "title": f"{payload.topic} 기본 예제",
                "code": "print('hello world')",
                "explanation": "기본 실행 흐름을 확인하는 예제입니다.",
                "language": payload.language,
            }
        ],
        "quiz": fallback_quiz,
    }


def _normalize_generated_content(raw: dict[str, Any], payload: GenerateRequest) -> dict[str, Any]:
    fallback = _fallback_generated_content(payload)
    quiz_only = _is_quiz_only_mode(payload)
    target_quiz_count = _target_quiz_count(payload) if quiz_only else 5

    code_examples: list[dict[str, str]] = []
    if not quiz_only:
        raw_code_examples = raw.get("code_examples")
        code_examples = (
            [
                _normalize_code_example(item, language=payload.language, idx=idx + 1)
                for idx, item in enumerate(raw_code_examples[:3])
            ]
            if isinstance(raw_code_examples, list)
            else []
        )
        if not code_examples:
            code_examples = fallback["code_examples"]

    raw_quiz = raw.get("quiz")
    quiz = (
        [
            _normalize_quiz(item, topic=payload.topic)
            for item in raw_quiz[:target_quiz_count]
        ]
        if isinstance(raw_quiz, list)
        else []
    )
    if not quiz:
        quiz = fallback["quiz"][:target_quiz_count]
    elif quiz_only and len(quiz) < target_quiz_count:
        fallback_quiz = fallback["quiz"]
        for idx in range(len(quiz), target_quiz_count):
            quiz.append(_normalize_quiz(fallback_quiz[idx], topic=payload.topic))
    elif not quiz_only and len(quiz) < 2:
        for fallback_item in fallback["quiz"]:
            quiz.append(_normalize_quiz(fallback_item, topic=payload.topic))
            if len(quiz) >= 2:
                break

    return {
        "title": _as_non_empty_str(raw.get("title"), fallback["title"]),
        "content": _as_non_empty_str(raw.get("content"), fallback["content"]),
        "code_examples": code_examples,
        "quiz": quiz,
    }


def _generated_content_quality_issues(result: dict[str, Any], payload: GenerateRequest) -> list[str]:
    issues: list[str] = []
    quiz_only = _is_quiz_only_mode(payload)
    target_quiz_count = _target_quiz_count(payload)
    title = str(result.get("title") or "").strip()
    content = str(result.get("content") or "").strip()
    code_examples = result.get("code_examples")
    quiz = result.get("quiz")

    if len(title) < 4:
        issues.append("title_too_short")
    if _looks_non_korean(title):
        issues.append("title_non_korean")
    if len(content) < (24 if quiz_only else 220):
        issues.append("content_too_short")
    if _is_placeholder_like(content):
        issues.append("content_placeholder")

    if quiz_only:
        if isinstance(code_examples, list) and len(code_examples) > 0:
            issues.append("code_examples_not_allowed")
    elif not isinstance(code_examples, list) or len(code_examples) < 1:
        issues.append("code_examples_missing")
    else:
        has_valid_code = False
        for idx, item in enumerate(code_examples[:3], start=1):
            if not isinstance(item, dict):
                issues.append(f"code_example{idx}_invalid")
                continue
            code = str(item.get("code") or "").strip()
            explanation = str(item.get("explanation") or "").strip()
            if _count_non_empty_lines(code) >= 4 and "hello world" not in code.lower():
                has_valid_code = True
            if len(explanation) < 40:
                issues.append(f"code_example{idx}_explanation_too_short")
        if not has_valid_code:
            issues.append("code_example_quality_low")

    required_quiz_count = target_quiz_count if quiz_only else 2
    if not isinstance(quiz, list) or len(quiz) < required_quiz_count:
        issues.append("quiz_count_insufficient")
    else:
        max_check_count = min(len(quiz), target_quiz_count if quiz_only else 3)
        for idx, item in enumerate(quiz[:max_check_count], start=1):
            if not isinstance(item, dict):
                issues.append(f"quiz{idx}_invalid")
                continue
            question = str(item.get("question") or "").strip()
            explanation = str(item.get("explanation") or "").strip()
            options = item.get("options")
            normalized_options = [
                _normalize_option_text(opt)
                for opt in (options if isinstance(options, list) else [])
                if str(opt).strip()
            ]
            meaningful_options = [opt for opt in normalized_options if opt and not _is_placeholder_option(opt)]
            if len(question) < (16 if quiz_only else 18):
                issues.append(f"quiz{idx}_question_too_short")
            if len(explanation) < (24 if quiz_only else 30):
                issues.append(f"quiz{idx}_explanation_too_short")
            if len(meaningful_options) != 4:
                issues.append(f"quiz{idx}_options_invalid")

    keywords = _extract_topic_keywords(payload.topic)
    if keywords:
        combined = " ".join(
            [
                title,
                content,
                *[
                    f"{str(item.get('question') or '')} {str(item.get('explanation') or '')}"
                    for item in (quiz if isinstance(quiz, list) else [])
                    if isinstance(item, dict)
                ],
            ]
        ).lower()
        if not any(keyword in combined for keyword in keywords):
            issues.append("topic_keyword_missing")

    return issues


def _assert_generated_content_quality(result: dict[str, Any], payload: GenerateRequest) -> None:
    issues = _generated_content_quality_issues(result, payload)
    if issues:
        raise ValueError(f"quality_validation_failed:{'|'.join(issues[:8])}")


def _build_generate_prompts(payload: GenerateRequest, *, retry_mode: bool = False) -> tuple[str, str]:
    quiz_only = _is_quiz_only_mode(payload)
    target_quiz_count = _target_quiz_count(payload)
    teaching_method = _teaching_method_label(payload.teachingMethod)

    if quiz_only:
        system_prompt = """당신은 프로그래밍 문제 출제 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록(```) 없이 반환합니다.

반환 스키마:
{
  "title": "string",
  "content": "string",
  "code_examples": [],
  "quiz": [
    {"question": "string", "options": ["string", "string", "string", "string"], "correct_answer": 0, "explanation": "string"}
  ]
}

제약:
- code_examples는 반드시 빈 배열([])
- quiz는 지정된 문항 수와 정확히 같아야 함
- 각 문항은 4지선다(실제 의미 있는 보기 4개)
- correct_answer는 0~3 정수
- explanation은 오답이 왜 오개념인지까지 짚어서 1~2문장으로 작성
- 보기 텍스트는 "1", "2", "3", "4" 같은 번호만 쓰지 말 것"""
        if retry_mode:
            system_prompt += "\n- 이전 시도는 품질 미달이었으므로 모든 문항에서 선택지를 더 구체적으로 작성"
        user_prompt = (
            "다음 조건으로 문제 세트를 생성하세요.\n"
            f"- 주제: {payload.topic}\n"
            f"- 언어: {payload.language}\n"
            f"- 난이도: {payload.difficulty}\n"
            f"- 대상: {payload.targetAudience}\n"
            f"- 해설 스타일: {teaching_method}\n"
            f"- 문항 수: {target_quiz_count}\n"
            "- 최소 1문항은 개념 확인, 최소 1문항은 응용 상황 판단 문제로 구성\n"
        )
        return system_prompt, user_prompt

    system_prompt = """당신은 개인화 학습 콘텐츠 생성기입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록(```) 없이 반환합니다.

반환 스키마:
{
  "title": "string",
  "content": "string",
  "code_examples": [
    {"title": "string", "code": "string", "explanation": "string", "language": "string"}
  ],
  "quiz": [
    {"question": "string", "options": ["string"], "correct_answer": 0, "explanation": "string"}
  ]
}

제약:
- code_examples는 1~3개
- quiz는 2~5개
- correct_answer는 options 인덱스 범위 안 정수
- 학습자 눈높이에 맞고 실습 중심으로 작성"""
    if retry_mode:
        system_prompt += "\n- 이전 시도는 품질 기준 미달이었으므로 추상 설명 대신 실행 가능한 예제/문항 근거 중심으로 작성"
    user_prompt = (
        "다음 조건으로 콘텐츠를 생성하세요.\n"
        f"- 주제: {payload.topic}\n"
        f"- 언어: {payload.language}\n"
        f"- 난이도: {payload.difficulty}\n"
        f"- 대상: {payload.targetAudience}\n"
        f"- 설명 방식: {teaching_method}\n"
    )
    return system_prompt, user_prompt


def _generate_content_with_quality(
    *,
    ai_service: Any,
    payload: GenerateRequest,
    retry_mode: bool,
) -> dict[str, Any]:
    system_prompt, user_prompt = _build_generate_prompts(payload, retry_mode=retry_mode)
    raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
    normalized = _normalize_generated_content(raw, payload)
    _assert_generated_content_quality(normalized, payload)
    return normalized


def compat_generate(payload: GenerateRequest) -> dict[str, Any]:
    retryable_kinds = {"rate_limited", "timeout", "schema_mismatch", "quality_failed"}
    try:
        generated, _attempt_count = run_ai_with_retry(
            lambda attempt: _generate_content_with_quality(
                ai_service=_require_ai_service(),
                payload=payload,
                retry_mode=attempt > 1,
            ),
            pipeline="content_generate",
            max_attempts=2,
            retryable_kinds=retryable_kinds,
        )
        return generated
    except PipelineFailure as failure:
        _raise_pipeline_http_exception(failure)


def compat_search(payload: SearchRequest) -> dict[str, Any]:
    return {
        "chunks": [
            {
                "text": f"'{payload.query}' 관련 기본 검색 결과",
                "source": "api",
            }
        ]
    }


def compat_validate(payload: ValidateRequest) -> dict[str, Any]:
    return {"ok": bool(payload.content.strip())}


def compat_recommendations(payload: RecommendRequest) -> dict[str, Any]:
    limit = max(1, min(payload.limit or 5, 20))
    return {
        "items": [
            {
                "contentId": f"content-{idx + 1}",
                "reason": "최근 학습 이력 기반 추천",
            }
            for idx in range(limit)
        ]
    }


def compat_assessment_questions(payload: AssessmentQuestionsRequest) -> dict[str, Any]:
    system_prompt, user_prompt = _build_assessment_questions_prompts(payload)
    try:
        raw, attempt_count = run_ai_with_retry(
            lambda _attempt: _require_ai_service().generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            ),
            pipeline="assessment_questions",
            max_attempts=2,
            retryable_kinds=set(DEFAULT_RETRYABLE_FAILURE_KINDS),
        )
        normalized = _normalize_assessment_questions(raw, payload.goal)
        return {
            "questions": normalized["questions"],
            "meta": {
                "fallback_used": False,
                "failure_kind": None,
                "attempt_count": attempt_count,
            },
        }
    except PipelineFailure as failure:
        fallback = _fallback_assessment_questions(payload.goal)
        return {
            "questions": fallback["questions"],
            "meta": {
                "fallback_used": True,
                "failure_kind": failure.kind,
                "attempt_count": failure.attempt_count,
            },
        }


def compat_assessment_analyze(payload: AssessmentAnalyzeRequest) -> dict[str, Any]:
    # 기본은 규칙 기반(빠름)이며, 필요 시 LLM 모드로 전환할 수 있다.
    if settings.assessment_analysis_mode != "llm":
        return _build_rule_assessment_result(payload)

    ai_service = _require_ai_service()

    system_prompt = """당신은 프로그래밍 진단 분석 전문가입니다.
반드시 JSON 객체 하나만 반환하세요. 코드블록은 금지합니다.
스키마:
{
  "level":"beginner|intermediate|advanced",
  "summary":"string",
  "strengths":["string"],
  "weaknesses":["string"]
}"""
    question_lines = []
    answer_map = {answer.question_id: answer.selected for answer in payload.answers}
    for question in payload.questions:
        selected = answer_map.get(question.id, -1)
        result = "정답" if selected == question.correct_answer else "오답"
        question_lines.append(
            f"- [{result}] ({question.difficulty}) {question.topic_area}: {question.question}"
        )
    user_prompt = (
        f"학습 목표: {payload.goal}\n"
        f"진단 결과:\n{chr(10).join(question_lines)}\n"
        "결과를 분석해 수준/강점/약점을 산출하세요."
    )

    try:
        raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
        level = _as_non_empty_str(raw.get("level"), "beginner").lower()
        if level not in {"beginner", "intermediate", "advanced"}:
            level = "beginner"
        summary = _as_non_empty_str(raw.get("summary"), _build_rule_assessment_result(payload)["summary"])
        strengths = raw.get("strengths") if isinstance(raw.get("strengths"), list) else []
        weaknesses = raw.get("weaknesses") if isinstance(raw.get("weaknesses"), list) else []
        strengths = [str(item).strip() for item in strengths if str(item).strip()][:4]
        weaknesses = [str(item).strip() for item in weaknesses if str(item).strip()][:4]
        if not weaknesses:
            weaknesses = ["실전 문제 적용력"]
        return {
            "level": level,
            "summary": summary,
            "strengths": strengths,
            "weaknesses": weaknesses,
        }
    except Exception as exc:
        _raise_direct_provider_http_exception("assessment_analyze", exc)


def compat_curriculum_generate(payload: CurriculumGenerateRequest) -> dict[str, Any]:
    retryable_kinds = {"rate_limited", "timeout", "schema_mismatch", "quality_failed"}
    try:
        generated, _attempt_count = run_ai_with_retry(
            lambda attempt: _generate_curriculum_with_quality(
                ai_service=_require_ai_service(),
                payload=payload,
                retry_mode=attempt > 1,
            ),
            pipeline="curriculum_generate",
            max_attempts=2,
            retryable_kinds=retryable_kinds,
        )
        return generated
    except PipelineFailure as failure:
        _raise_pipeline_http_exception(failure)


def compat_curriculum_refine(payload: CurriculumRefineRequest) -> dict[str, Any]:
    ai_service = _require_ai_service()
    request_for_fallback = CurriculumGenerateRequest(
        goal=payload.currentCurriculum.title,
        level="beginner",
        strengths=[],
        weaknesses=[],
        teachingMethod="direct_instruction",
        goalType="hobby",
        weeklyStudyHours=5,
        learningStyle="concept_first",
    )

    system_prompt, user_prompt = _build_refine_prompts(payload)
    try:
        raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
        return _normalize_curriculum(raw, request_for_fallback)
    except Exception as exc:
        _raise_direct_provider_http_exception("curriculum_refine", exc)


def compat_curriculum_reasoning(payload: ReasoningRequest) -> dict[str, Any]:
    ai_service = _require_ai_service()

    system_prompt, user_prompt = _build_reasoning_prompts(payload)
    try:
        raw = ai_service.generate_json(system_prompt=system_prompt, user_prompt=user_prompt)
        return _normalize_reasoning(raw, payload)
    except Exception as exc:
        _raise_direct_provider_http_exception("curriculum_reasoning", exc)


def compat_curriculum_sections(payload: SectionsRequest) -> dict[str, Any]:
    retryable_kinds = {"rate_limited", "timeout", "schema_mismatch", "quality_failed"}
    try:
        generated, attempt_count = run_ai_with_retry(
            lambda attempt: _generate_sections_with_quality(
                ai_service=_require_ai_service(),
                payload=payload.input,
                reasoning=payload.reasoning,
                retry_mode=attempt > 1,
            ),
            pipeline="curriculum_sections",
            max_attempts=2,
            retryable_kinds=retryable_kinds,
        )
        return {
            **generated,
            "meta": {
                "fallback_used": False,
                "failure_kind": None,
                "attempt_count": attempt_count,
            },
        }
    except PipelineFailure as failure:
        if failure.kind in retryable_kinds:
            # 재시도 후에도 품질/지연 문제가 있으면 학습 흐름 보장을 위해 폴백
            fallback = _fallback_sections(payload.input, payload.reasoning)
            return {
                **fallback,
                "meta": {
                    "fallback_used": True,
                    "failure_kind": failure.kind,
                    "attempt_count": failure.attempt_count,
                },
            }
        _raise_pipeline_http_exception(failure)


def compat_auth_callback(request: Request, code: str | None = None, next: str = "/dashboard") -> RedirectResponse:
    origin = f"{request.url.scheme}://{request.url.netloc}"
    if code:
        return RedirectResponse(url=f"{origin}{next}", status_code=307)
    query = urlencode({"error": "auth_callback_error"})
    return RedirectResponse(url=f"{origin}/login?{query}", status_code=307)
