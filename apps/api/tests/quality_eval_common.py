from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Any

from app.services.compat import generation_service as gs


@dataclass(frozen=True)
class QualityEvalCase:
    name: str
    tier: str
    payload: gs.GenerateRequest
    generated: dict[str, Any]
    required_issues: tuple[str, ...] = ()


@dataclass(frozen=True)
class QualityEvalResult:
    case_name: str
    tier: str
    score: float
    issues: tuple[str, ...]
    missing_required_issues: tuple[str, ...]


def _make_payload(*, topic: str, content_mode: str, question_count: int) -> gs.GenerateRequest:
    return gs.GenerateRequest(
        language="Python",
        topic=topic,
        difficulty="beginner",
        targetAudience="초급 학습자",
        teachingMethod="direct_instruction",
        contentMode=content_mode,
        questionCount=question_count,
    )


def _build_cases() -> list[QualityEvalCase]:
    lesson_content = (
        "파이썬 리스트는 순서를 가진 가변 컬렉션으로, 데이터 전처리와 반복 처리에서 가장 자주 사용됩니다. "
        "파이썬 리스트를 다룰 때는 인덱싱, 슬라이싱, append와 같은 변경 연산의 시간 복잡도를 함께 이해해야 합니다. "
        "예를 들어 파이썬 리스트의 중간 삽입은 요소 이동 비용이 커지므로, 반복적인 삽입이 필요하면 구조를 바꾸는 것이 더 안전합니다. "
        "또한 파이썬 리스트 복사에서 얕은 복사와 깊은 복사의 차이를 구분하지 않으면 실무에서 의도치 않은 상태 공유 문제가 발생합니다."
    )

    return [
        QualityEvalCase(
            name="pass_quiz_only_minimum",
            tier="pass",
            payload=_make_payload(topic="파이썬 리스트", content_mode="quiz_only", question_count=3),
            generated={
                "title": "파이썬 리스트 핵심 점검 문제",
                "content": "파이썬 리스트 핵심 개념을 점검하는 3문항 세트입니다.",
                "code_examples": [],
                "quiz": [
                    {
                        "question": "파이썬 리스트에 원소를 끝에 추가할 때 가장 직접적인 메서드는 무엇인가요?",
                        "options": ["append()", "pop()", "clear()", "sort()"],
                        "correct_answer": 0,
                        "explanation": "append()는 리스트 끝에 새 값을 추가하는 표준 메서드라 문제 의도와 정확히 일치합니다.",
                    },
                    {
                        "question": "파이썬 리스트 슬라이싱의 주된 목적을 가장 잘 설명한 선택지는 무엇인가요?",
                        "options": ["부분 구간 추출", "정수형 강제 변환", "랜덤 값 생성", "원본 즉시 삭제"],
                        "correct_answer": 0,
                        "explanation": "슬라이싱은 시작/끝/간격을 지정해 필요한 범위를 쉽게 추출할 수 있어 복습과 가공에 유리합니다.",
                    },
                    {
                        "question": "파이썬 리스트를 순회하며 인덱스와 값을 함께 얻는 가장 보편적인 방법은 무엇인가요?",
                        "options": ["enumerate()", "replace()", "split()", "input()"],
                        "correct_answer": 0,
                        "explanation": "enumerate()를 쓰면 인덱스와 값을 동시에 받아 코드 가독성과 유지보수성이 좋아집니다.",
                    },
                ],
            },
        ),
        QualityEvalCase(
            name="pass_lesson_minimum",
            tier="pass",
            payload=_make_payload(topic="파이썬 리스트", content_mode="lesson", question_count=8),
            generated={
                "title": "파이썬 리스트 실전 이해",
                "content": lesson_content,
                "code_examples": [
                    {
                        "title": "리스트 순회와 누적 계산",
                        "code": (
                            "numbers = [1, 2, 3, 4]\n"
                            "total = 0\n"
                            "for index, value in enumerate(numbers):\n"
                            "    total += value\n"
                            "    print(index, value, total)\n"
                            "print('sum=', total)\n"
                        ),
                        "explanation": "enumerate와 누적 변수를 함께 사용해 순회 상태를 관찰하면 디버깅과 로직 검증이 쉬워집니다.",
                        "language": "Python",
                    }
                ],
                "quiz": [
                    {
                        "question": "파이썬 리스트 중간 위치에 반복 삽입이 많은 경우 성능 관점에서 먼저 점검할 사항은 무엇인가요?",
                        "options": ["요소 이동 비용", "변수명 길이", "주석 개수", "파일 확장자"],
                        "correct_answer": 0,
                        "explanation": "중간 삽입은 뒤 요소 이동이 반복되어 비용이 커지므로 자료구조 선택을 먼저 검토해야 합니다.",
                    },
                    {
                        "question": "파이썬 리스트 복사에서 얕은 복사와 깊은 복사를 구분해야 하는 이유로 가장 적절한 것은 무엇인가요?",
                        "options": ["중첩 객체 상태 공유 방지", "출력 포맷 통일", "정렬 속도 증가", "메모리 사용량 0화"],
                        "correct_answer": 0,
                        "explanation": "중첩 객체가 있는 경우 얕은 복사는 내부 참조를 공유해 의도치 않은 동시 변경 버그를 만들 수 있습니다.",
                    },
                ],
            },
        ),
        QualityEvalCase(
            name="fail_missing_code_examples",
            tier="fail",
            payload=_make_payload(topic="파이썬 리스트", content_mode="lesson", question_count=8),
            generated={
                "title": "파이썬 리스트 개념 요약",
                "content": lesson_content,
                "code_examples": [],
                "quiz": [
                    {
                        "question": "파이썬 리스트 append의 목적은 무엇인가요?",
                        "options": ["끝에 값 추가", "리스트 삭제", "정렬", "복사"],
                        "correct_answer": 0,
                        "explanation": "append는 리스트 끝에 새 값을 붙이는 기본 메서드입니다.",
                    },
                    {
                        "question": "파이썬 리스트 슬라이싱이 유용한 이유는 무엇인가요?",
                        "options": ["부분 추출 용이", "랜덤 생성", "형 변환 강제", "무조건 삭제"],
                        "correct_answer": 0,
                        "explanation": "원하는 범위를 간결한 문법으로 추출할 수 있어 데이터 전처리에 유리합니다.",
                    },
                ],
            },
            required_issues=("code_examples_missing",),
        ),
        QualityEvalCase(
            name="fail_placeholder_options",
            tier="fail",
            payload=_make_payload(topic="파이썬 리스트", content_mode="quiz_only", question_count=3),
            generated={
                "title": "파이썬 리스트 점검 문제",
                "content": "파이썬 리스트 기초 개념을 짧게 점검합니다.",
                "code_examples": [],
                "quiz": [
                    {
                        "question": "파이썬 리스트 append의 역할은 무엇인가요?",
                        "options": ["1", "2", "3", "4"],
                        "correct_answer": 0,
                        "explanation": "append는 리스트 마지막에 값을 추가합니다.",
                    },
                    {
                        "question": "파이썬 리스트에서 슬라이싱의 목적은 무엇인가요?",
                        "options": ["부분 추출", "즉시 삭제", "랜덤 생성", "형 변환"],
                        "correct_answer": 0,
                        "explanation": "슬라이싱은 필요한 범위의 요소를 선택하는 데 사용됩니다.",
                    },
                    {
                        "question": "파이썬 리스트 순회에서 인덱스와 값을 함께 얻는 방법은 무엇인가요?",
                        "options": ["enumerate()", "split()", "replace()", "input()"],
                        "correct_answer": 0,
                        "explanation": "enumerate는 인덱스와 값을 함께 제공해 반복문 작성이 쉬워집니다.",
                    },
                ],
            },
            required_issues=("quiz1_options_invalid",),
        ),
        QualityEvalCase(
            name="fail_topic_keyword_missing",
            tier="fail",
            payload=_make_payload(topic="파이썬 딕셔너리", content_mode="quiz_only", question_count=3),
            generated={
                "title": "자료구조 점검 문제",
                "content": "배열과 반복문 중심의 개념을 점검하는 문제 세트입니다.",
                "code_examples": [],
                "quiz": [
                    {
                        "question": "배열 끝에 값을 넣는 메서드는 무엇인가요?",
                        "options": ["append()", "pop()", "clear()", "sort()"],
                        "correct_answer": 0,
                        "explanation": "append()는 배열 끝에 값을 추가할 때 사용합니다.",
                    },
                    {
                        "question": "배열 일부를 가져오는 기본 문법은 무엇인가요?",
                        "options": ["슬라이싱", "형 변환", "입력 대기", "랜덤 생성"],
                        "correct_answer": 0,
                        "explanation": "슬라이싱은 범위를 지정해 데이터를 추출하는 기본 도구입니다.",
                    },
                    {
                        "question": "반복문에서 인덱스와 값을 함께 얻는 도구는 무엇인가요?",
                        "options": ["enumerate()", "replace()", "split()", "input()"],
                        "correct_answer": 0,
                        "explanation": "enumerate는 순회 시 인덱스와 값을 함께 제공합니다.",
                    },
                ],
            },
            required_issues=("topic_keyword_missing",),
        ),
    ]


CASES: list[QualityEvalCase] = _build_cases()


def _issue_weight(issue: str) -> float:
    weighted = {
        "content_placeholder": 2.5,
        "content_too_short": 2.0,
        "code_examples_missing": 2.0,
        "code_example_quality_low": 1.8,
        "quiz_count_insufficient": 2.0,
        "topic_keyword_missing": 1.0,
        "title_non_korean": 0.8,
        "title_too_short": 0.6,
    }
    if issue in weighted:
        return weighted[issue]
    if issue.endswith("_options_invalid"):
        return 1.5
    if issue.endswith("_explanation_too_short"):
        return 1.0
    if issue.endswith("_question_too_short"):
        return 1.0
    if issue.endswith("_invalid"):
        return 1.2
    return 0.8


def evaluate_case(case: QualityEvalCase) -> QualityEvalResult:
    issues = tuple(gs._generated_content_quality_issues(case.generated, case.payload))
    unique_issues = sorted(set(issues))
    penalty = sum(_issue_weight(issue) for issue in unique_issues)
    score = round(max(0.0, 10.0 - penalty), 2)
    missing_required = tuple(issue for issue in case.required_issues if issue not in unique_issues)
    return QualityEvalResult(
        case_name=case.name,
        tier=case.tier,
        score=score,
        issues=tuple(unique_issues),
        missing_required_issues=missing_required,
    )


def evaluate_all_cases() -> list[QualityEvalResult]:
    return [evaluate_case(case) for case in CASES]


def build_summary(results: list[QualityEvalResult]) -> dict[str, Any]:
    pass_results = [row for row in results if row.tier == "pass"]
    fail_results = [row for row in results if row.tier == "fail"]

    issue_frequency: dict[str, int] = {}
    for row in results:
        for issue in row.issues:
            issue_frequency[issue] = issue_frequency.get(issue, 0) + 1

    pass_case_success = all(
        len(row.issues) == 0 and row.score >= 9.0 and len(row.missing_required_issues) == 0
        for row in pass_results
    )
    fail_case_success = all(len(row.missing_required_issues) == 0 for row in fail_results)

    avg_total = round(mean([row.score for row in results]), 2) if results else 0.0
    avg_pass = round(mean([row.score for row in pass_results]), 2) if pass_results else 0.0

    return {
        "total_cases": len(results),
        "pass_cases": len(pass_results),
        "fail_cases": len(fail_results),
        "average_score_total": avg_total,
        "average_score_pass_cases": avg_pass,
        "pass_case_success": pass_case_success,
        "fail_case_success": fail_case_success,
        "quality_gate_passed": pass_case_success and fail_case_success and avg_pass >= 9.0,
        "issue_frequency": dict(sorted(issue_frequency.items(), key=lambda item: (-item[1], item[0]))),
    }
