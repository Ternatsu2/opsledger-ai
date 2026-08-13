from __future__ import annotations

import json
from pathlib import Path

from opsledger.fixtures import demo_fixtures

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = PROJECT_ROOT / "fixtures"
EXPECTED = {
    "OPS-2026-0001": {
        "expected_stage": "READY_FOR_HUMAN_REVIEW",
        "expected_completeness_score": 100,
        "expected_findings": [],
        "expected_extracted_values": {
            "legal_business_name": "Island Harvest Foods Ltd.",
            "registration_number": "ABR-4421-A",
            "jurisdiction": "Antigua and Barbuda",
            "revenue_computed_total": "480000",
            "revenue_as_of_date": "2026-07-31",
            "bank_as_of_date": "2026-07-31",
            "ownership_declared": True,
        },
    },
    "OPS-2026-0002": {
        "expected_stage": "NEEDS_INFORMATION",
        "expected_completeness_score": 85,
        "expected_findings": [
            "REQUIRED_DOCUMENT_MISSING",
            "FINANCIAL_EVIDENCE_STALE",
        ],
        "expected_extracted_values": {
            "legal_business_name": "Blue Shore Repairs",
            "registration_number": "LCR-7319-R",
            "jurisdiction": "Saint Lucia",
            "revenue_computed_total": "210000",
            "revenue_as_of_date": "2025-10-31",
            "bank_as_of_date": "2025-10-31",
        },
    },
    "OPS-2026-0003": {
        "expected_stage": "MANUAL_INVESTIGATION",
        "expected_completeness_score": 100,
        "expected_findings": [
            "LEGAL_NAME_MISMATCH",
            "DUPLICATE_REGISTRATION",
        ],
        "expected_extracted_values": {
            "legal_business_name": "Caribbean Green Freight Services Ltd.",
            "registration_number": "ABR-4421-A",
            "jurisdiction": "Antigua and Barbuda",
            "revenue_computed_total": "720000",
            "revenue_as_of_date": "2026-07-31",
            "bank_as_of_date": "2026-07-31",
            "ownership_declared": True,
        },
    },
}


def main() -> None:
    FIXTURE_ROOT.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for case in demo_fixtures():
        case_dir = FIXTURE_ROOT / case.reference
        case_dir.mkdir(parents=True, exist_ok=True)
        intake_path = case_dir / "intake.json"
        intake_path.write_text(
            json.dumps(case.profile.model_dump(mode="json"), indent=2) + "\n",
            encoding="utf-8",
        )
        expected_path = case_dir / "expected.json"
        expected_path.write_text(
            json.dumps(EXPECTED[case.reference], indent=2) + "\n",
            encoding="utf-8",
        )
        for document in case.documents:
            path = case_dir / document.filename
            path.write_bytes(document.content)
            manifest.append(
                {
                    "case_reference": case.reference,
                    "document_type": document.document_type,
                    "path": str(path.relative_to(PROJECT_ROOT)),
                    "mime_type": document.mime_type,
                    "size_bytes": len(document.content),
                }
            )
    (FIXTURE_ROOT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Generated {len(manifest)} synthetic evidence files and six case contracts "
        f"in {FIXTURE_ROOT}."
    )


if __name__ == "__main__":
    main()
