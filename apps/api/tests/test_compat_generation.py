import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from app.services.compat import generation_service as gs
from app.services.compat.error_policy import build_http_error_payload


class _FakeAIService:
    def __init__(self, response: dict):
        self.response = response
        self.calls = 0

    def generate_json(self, *, system_prompt: str, user_prompt: str) -> dict:
        self.calls += 1
        return self.response


class CompatGenerateServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_get_ai_service = gs._get_ai_service

    def tearDown(self) -> None:
        gs._get_ai_service = self._original_get_ai_service

    def _payload(self, question_count: int = 3) -> gs.GenerateRequest:
        return gs.GenerateRequest(
            language="Python",
            topic="파이썬 리스트",
            difficulty="beginner",
            targetAudience="초급 학습자",
            contentMode="quiz_only",
            questionCount=question_count,
        )

    def test_generate_request_question_count_bounds(self) -> None:
        valid_payload = self._payload(question_count=3)
        self.assertEqual(valid_payload.questionCount, 3)

        valid_payload = self._payload(question_count=20)
        self.assertEqual(valid_payload.questionCount, 20)

        with self.assertRaises(ValidationError):
            self._payload(question_count=2)
        with self.assertRaises(ValidationError):
            self._payload(question_count=21)

    def test_generate_returns_quality_failed_error_payload(self) -> None:
        gs._get_ai_service = lambda: _FakeAIService(
            {
                "title": "짧음",
                "content": "너무 짧다",
                "code_examples": [],
                "quiz": [],
            }
        )

        with self.assertRaises(HTTPException) as ctx:
            gs.compat_generate(self._payload(question_count=3))

        payload = build_http_error_payload(ctx.exception, trace_id="trace-test")
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(payload["error_code"], "quality_failed")
        self.assertTrue(payload["retryable"])
        self.assertTrue(str(payload["detail"]).startswith("content_generate_failed:quality_failed:"))

    def test_generate_quiz_only_normalizes_options(self) -> None:
        fake = _FakeAIService(
            {
                "title": "파이썬 리스트 문제 훈련",
                "content": "파이썬 리스트 핵심을 점검하는 문제 세트입니다. 개념 확인과 응용 판단을 함께 연습합니다.",
                "code_examples": [],
                "quiz": [
                    {
                        "question": "파이썬 리스트에서 항목을 끝에 추가할 때 가장 직접적인 방법은?",
                        "options": [
                            "1) append()로 원소 추가",
                            "2) pop()으로 원소 삭제",
                            "3) clear()로 전체 제거",
                            "4) sort()로 정렬 수행",
                        ],
                        "correct_answer": 0,
                        "explanation": "append()는 리스트의 마지막에 새 항목을 추가하는 기본 메서드라 문제 의도와 정확히 맞습니다.",
                    },
                    {
                        "question": "파이썬 리스트 슬라이싱의 기본 목적을 가장 잘 설명한 것은?",
                        "options": [
                            "부분 구간 복사/추출",
                            "원본 즉시 삭제",
                            "정수형 강제 변환",
                            "랜덤 값 생성",
                        ],
                        "correct_answer": 0,
                        "explanation": "슬라이싱은 시작/끝/간격 조건으로 원하는 구간을 선택해 새로운 리스트를 만들 때 주로 사용합니다.",
                    },
                    {
                        "question": "파이썬 리스트를 반복문에서 순회할 때 인덱스와 값을 함께 얻는 표준 방식은?",
                        "options": [
                            "enumerate() 사용",
                            "input() 호출",
                            "replace() 호출",
                            "split() 호출",
                        ],
                        "correct_answer": 0,
                        "explanation": "enumerate()는 인덱스와 값을 동시에 제공해 상태 추적이 필요한 반복 로직을 명확하게 작성할 수 있습니다.",
                    },
                ],
            }
        )
        gs._get_ai_service = lambda: fake

        result = gs.compat_generate(self._payload(question_count=3))

        self.assertEqual(fake.calls, 1)
        self.assertEqual(len(result["quiz"]), 3)
        self.assertEqual(result["code_examples"], [])
        self.assertEqual(result["quiz"][0]["options"][0], "append()로 원소 추가")

    def test_target_quiz_count_clamps_unsafe_values(self) -> None:
        low_payload = gs.GenerateRequest.model_construct(
            language="Python",
            topic="파이썬 리스트",
            difficulty="beginner",
            targetAudience="초급 학습자",
            contentMode="quiz_only",
            questionCount=0,
        )
        high_payload = gs.GenerateRequest.model_construct(
            language="Python",
            topic="파이썬 리스트",
            difficulty="beginner",
            targetAudience="초급 학습자",
            contentMode="quiz_only",
            questionCount=100,
        )
        self.assertEqual(gs._target_quiz_count(low_payload), 3)
        self.assertEqual(gs._target_quiz_count(high_payload), 20)

    def test_normalize_quiz_replaces_placeholder_options(self) -> None:
        normalized = gs._normalize_quiz(
            {
                "question": "파이썬 리스트 메서드 append의 동작은?",
                "options": ["1", "선택지 2", "A", "append()로 끝에 추가"],
                "correct_answer": 9,
                "explanation": "append는 마지막에 원소를 추가합니다.",
            },
            topic="파이썬 리스트",
        )

        self.assertEqual(len(normalized["options"]), 4)
        self.assertEqual(normalized["correct_answer"], 0)
        self.assertNotIn("1", normalized["options"])
        self.assertIn("append()로 끝에 추가", normalized["options"])

    def test_generated_content_quality_issues_flags_insufficient_quiz_count(self) -> None:
        payload = gs.GenerateRequest(
            language="Python",
            topic="파이썬 리스트",
            difficulty="beginner",
            targetAudience="초급 학습자",
            contentMode="quiz_only",
            questionCount=5,
        )
        issues = gs._generated_content_quality_issues(
            {
                "title": "파이썬 리스트 문제 훈련",
                "content": "파이썬 리스트 핵심을 점검하는 문제 세트로, 기초 개념과 응용 판단을 연습합니다.",
                "code_examples": [],
                "quiz": [
                    {
                        "question": "파이썬 리스트의 append() 목적은 무엇인가요?",
                        "options": ["끝에 요소 추가", "리스트 삭제", "정렬 수행", "초기화 수행"],
                        "correct_answer": 0,
                        "explanation": "append는 리스트의 마지막에 요소를 추가하는 메서드입니다.",
                    },
                    {
                        "question": "리스트 슬라이싱의 장점은 무엇인가요?",
                        "options": ["부분 구간 추출", "문자열 강제 변환", "메모리 초기화", "랜덤 생성"],
                        "correct_answer": 0,
                        "explanation": "원하는 범위를 간단한 문법으로 선택할 수 있어 가독성이 높습니다.",
                    },
                ],
            },
            payload,
        )

        self.assertIn("quiz_count_insufficient", issues)

    def test_sections_quality_issues_detects_required_section_gaps(self) -> None:
        payload = gs.ReasoningRequest(
            topic="파이썬 리스트",
            curriculumGoal="웹 서비스 백엔드 개발",
            learnerLevel="beginner",
            language="Python",
        )
        issues = gs._sections_quality_issues(
            {
                "title": "요약만 있는 결과",
                "sections": [
                    {
                        "type": "summary",
                        "title": "학습 요약",
                        "body": "핵심 정리",
                        "code": "",
                        "explanation": "요약",
                        "question": "",
                        "options": [],
                        "correct_answer": 0,
                        "next_preview": "다음 토픽으로",
                    }
                ],
            },
            payload,
        )

        self.assertIn("concept_missing", issues)
        self.assertIn("example_missing", issues)
        self.assertIn("check_count_lt_2", issues)

    def test_classify_ai_failure_maps_timeout_and_rate_limit(self) -> None:
        timeout_kind, timeout_status, timeout_retryable = gs._classify_ai_failure("request timed out")
        self.assertEqual((timeout_kind, timeout_status, timeout_retryable), ("timeout", 504, True))

        rate_kind, rate_status, rate_retryable = gs._classify_ai_failure("429 too many requests")
        self.assertEqual((rate_kind, rate_status, rate_retryable), ("rate_limited", 429, True))


if __name__ == "__main__":
    unittest.main()
