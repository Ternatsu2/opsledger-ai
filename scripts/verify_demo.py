from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

API_ROOT = os.getenv("OPSLEDGER_API_URL", "http://localhost:8000").rstrip("/")


def _get(path: str) -> tuple[bytes, str]:
    try:
        with urlopen(f"{API_ROOT}{path}", timeout=15) as response:  # noqa: S310
            return response.read(), response.headers.get_content_type()
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"GET {path} failed: {exc}") from exc


def _json(path: str) -> Any:
    payload, _ = _get(path)
    return json.loads(payload)


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"PASS  {message}")


def main() -> int:
    try:
        health = _json("/health")
        readiness = _json("/ready")
        system = _json("/api/v1/system")
        cases = _json("/api/v1/cases")

        _check(health["status"] == "ok", "API health endpoint responds")
        _check(readiness["status"] == "ready", "database readiness check responds")
        _check(system["synthetic_data_only"] is True, "system declares synthetic-only data")
        _check(system["human_approval_required"] is True, "human approval remains required")
        _check(system["follow_up_auto_send"] is False, "agent follow-up cannot auto-send")

        by_reference = {case["reference"]: case for case in cases}
        expected_stages = {
            "OPS-2026-0001": "READY_FOR_HUMAN_REVIEW",
            "OPS-2026-0002": "NEEDS_INFORMATION",
            "OPS-2026-0003": "MANUAL_INVESTIGATION",
        }
        _check(set(by_reference) == set(expected_stages), "the three documented cases are present")

        details = {
            reference: _json(f"/api/v1/cases/{case['id']}")
            for reference, case in by_reference.items()
        }
        for reference, stage in expected_stages.items():
            _check(details[reference]["stage"] == stage, f"{reference} routes to {stage}")

        case_a = details["OPS-2026-0001"]
        case_b = details["OPS-2026-0002"]
        case_c = details["OPS-2026-0003"]
        _check(case_a["completeness_score"] == 100, "Case A has a transparent 100/100 score")
        _check(not case_a["findings"], "Case A has no open deterministic finding")
        a_run = max(case_a["agent_runs"], key=lambda run: run["started_at"])
        _check(
            a_run["structured_output_json"]["recommended_action"]
            == "READY_FOR_HUMAN_REVIEW",
            "Case A agent output preserves deterministic routing",
        )

        b_rules = {finding["rule_code"] for finding in case_b["findings"]}
        _check(
            b_rules == {"REQUIRED_DOCUMENT_MISSING", "FINANCIAL_EVIDENCE_STALE"},
            "Case B identifies missing ownership and stale revenue",
        )
        b_output = max(case_b["agent_runs"], key=lambda run: run["started_at"])[
            "structured_output_json"
        ]
        _check(bool(b_output["follow_up_draft"]), "Case B includes an editable follow-up draft")
        _check(
            not any(event["event_type"] == "MESSAGE_SENT" for event in case_b["audit_events"]),
            "Case B has no message-send audit event",
        )

        c_rules = {finding["rule_code"] for finding in case_c["findings"]}
        _check(
            c_rules == {"LEGAL_NAME_MISMATCH", "DUPLICATE_REGISTRATION"},
            "Case C identifies the identity mismatch and duplicate registration",
        )
        c_output = max(case_c["agent_runs"], key=lambda run: run["started_at"])[
            "structured_output_json"
        ]
        _check(
            c_output["follow_up_draft"] is None,
            "Case C remains an internal investigation without an applicant draft",
        )

        packet, content_type = _get(f"/api/v1/cases/{case_a['id']}/packet.pdf")
        _check(content_type == "application/pdf", "review packet uses the PDF content type")
        _check(packet.startswith(b"%PDF") and len(packet) > 2_000, "review packet is a valid PDF")

        audit = _json("/api/v1/audit?limit=200")
        _check(len(audit) >= 30, "append-only audit feed contains the workflow history")
    except (AssertionError, KeyError, IndexError, RuntimeError, ValueError) as exc:
        print(f"FAIL  {exc}", file=sys.stderr)
        return 1

    print("\nOpsLedger demo verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
