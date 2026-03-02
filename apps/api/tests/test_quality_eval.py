import unittest

try:
    from tests.quality_eval_common import build_summary, evaluate_all_cases
except ModuleNotFoundError:
    from quality_eval_common import build_summary, evaluate_all_cases


class ContentQualityEvalTests(unittest.TestCase):
    def test_pass_cases_are_clean(self) -> None:
        results = evaluate_all_cases()
        pass_results = [row for row in results if row.tier == "pass"]
        self.assertGreaterEqual(len(pass_results), 2)

        for row in pass_results:
            self.assertEqual(row.issues, (), msg=f"{row.case_name} issues={row.issues}")
            self.assertGreaterEqual(row.score, 9.0, msg=f"{row.case_name} score={row.score}")
            self.assertEqual(row.missing_required_issues, (), msg=row.case_name)

    def test_fail_cases_include_required_issues(self) -> None:
        results = evaluate_all_cases()
        fail_results = [row for row in results if row.tier == "fail"]
        self.assertGreaterEqual(len(fail_results), 3)

        for row in fail_results:
            self.assertEqual(
                row.missing_required_issues,
                (),
                msg=f"{row.case_name} missing={row.missing_required_issues}",
            )

    def test_quality_gate_summary(self) -> None:
        summary = build_summary(evaluate_all_cases())

        self.assertTrue(summary["pass_case_success"])
        self.assertTrue(summary["fail_case_success"])
        self.assertTrue(summary["quality_gate_passed"])
        self.assertGreaterEqual(summary["average_score_pass_cases"], 9.0)


if __name__ == "__main__":
    unittest.main()
