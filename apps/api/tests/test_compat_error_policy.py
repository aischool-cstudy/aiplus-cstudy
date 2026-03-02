import unittest

from fastapi import HTTPException

from app.services.compat.error_policy import build_http_error_payload, build_structured_error_detail


class CompatErrorPolicyTests(unittest.TestCase):
    def test_structured_detail_round_trip(self) -> None:
        detail = build_structured_error_detail(
            error_code="rate_limited",
            message="429 too many requests",
            retryable=True,
            detail="content_generate_failed:rate_limited:429 too many requests",
        )
        exc = HTTPException(status_code=429, detail=detail)
        payload = build_http_error_payload(exc, trace_id="trace-1")

        self.assertEqual(payload["error_code"], "rate_limited")
        self.assertEqual(payload["message"], "429 too many requests")
        self.assertTrue(payload["retryable"])
        self.assertEqual(payload["trace_id"], "trace-1")
        self.assertIn("content_generate_failed:rate_limited", payload["detail"])

    def test_structured_detail_defaults_retryable_from_code(self) -> None:
        detail = build_structured_error_detail(
            error_code="provider_error",
            message="downstream unavailable",
            detail="curriculum_refine_failed:provider_error:downstream unavailable",
        )
        exc = HTTPException(status_code=502, detail=detail)
        payload = build_http_error_payload(exc, trace_id="trace-2")

        self.assertEqual(payload["error_code"], "provider_error")
        self.assertEqual(payload["message"], "downstream unavailable")
        self.assertFalse(payload["retryable"])


if __name__ == "__main__":
    unittest.main()
