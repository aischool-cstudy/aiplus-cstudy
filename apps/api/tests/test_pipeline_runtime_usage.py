import unittest

from app.domain.ai.providers.base import AIAttemptError, AIResponseMeta, AIUsageMeta, StructuredAIResponse
from app.services.compat.pipeline_runtime import PipelineFailure, run_ai_with_retry


class PipelineRuntimeUsageTests(unittest.TestCase):
    def test_run_ai_with_retry_accumulates_usage_across_retries(self) -> None:
        def call(attempt: int) -> StructuredAIResponse:
            if attempt == 1:
                raise AIAttemptError(
                    "quality_validation_failed:first attempt",
                    meta=AIResponseMeta(
                        provider="gemini",
                        model="gemini-3-flash-preview",
                        usage=AIUsageMeta(input_tokens=120, output_tokens=30, total_tokens=150),
                    ),
                )

            return StructuredAIResponse(
                data={"ok": True},
                meta=AIResponseMeta(
                    provider="gemini",
                    model="gemini-3-flash-preview",
                    usage=AIUsageMeta(input_tokens=80, output_tokens=20, total_tokens=100),
                ),
            )

        response, attempt_count = run_ai_with_retry(
            call,
            pipeline="curriculum_sections",
            max_attempts=2,
            retryable_kinds={"quality_failed"},
        )

        self.assertEqual(attempt_count, 2)
        self.assertEqual(response.meta.usage.input_tokens, 200)
        self.assertEqual(response.meta.usage.output_tokens, 50)
        self.assertEqual(response.meta.usage.total_tokens, 250)

    def test_run_ai_with_retry_attaches_usage_to_terminal_failure(self) -> None:
        def call(_attempt: int) -> StructuredAIResponse:
            raise AIAttemptError(
                "quality_validation_failed:still invalid",
                meta=AIResponseMeta(
                    provider="gemini",
                    model="gemini-3-flash-preview",
                    usage=AIUsageMeta(input_tokens=60, output_tokens=15, total_tokens=75),
                ),
            )

        with self.assertRaises(PipelineFailure) as context:
            run_ai_with_retry(
                call,
                pipeline="content_generate",
                max_attempts=1,
                retryable_kinds={"quality_failed"},
            )

        failure = context.exception
        self.assertIsNotNone(failure.response_meta)
        self.assertEqual(failure.response_meta.usage.input_tokens, 60)
        self.assertEqual(failure.response_meta.usage.output_tokens, 15)
        self.assertEqual(failure.response_meta.usage.total_tokens, 75)


if __name__ == "__main__":
    unittest.main()
