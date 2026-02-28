from __future__ import annotations

import json
from datetime import datetime, timezone

try:
    from tests.quality_eval_common import build_summary, evaluate_all_cases
except ModuleNotFoundError:
    from quality_eval_common import build_summary, evaluate_all_cases


def main() -> None:
    results = evaluate_all_cases()
    summary = build_summary(results)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "cases": [
            {
                "case_name": row.case_name,
                "tier": row.tier,
                "score": row.score,
                "issues": list(row.issues),
                "missing_required_issues": list(row.missing_required_issues),
            }
            for row in results
        ],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
