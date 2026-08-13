# Data and fixtures

## Provenance

All names, email addresses, identifiers, amounts, transactions, documents, and findings in this repository are synthetic. They were generated from code in `apps/api/opsledger/fixtures.py`. No former client file, real applicant record, copied bank statement, tax document, identity record, or private company screenshot is included.

The `example` email domain is reserved for documentation. Registration numbers and case references are invented. The demo policy in `apps/api/opsledger/policy.py` is a product test contract, not a law, lender rule, or regional standard.

## Reproducible fixture set

Run `npm run fixtures` to regenerate the committed files. ReportLab produces invariant PDFs so their hashes remain stable; pandas and openpyxl produce the tabular evidence. Each case directory contains:

- `intake.json` — canonical synthetic application values;
- `expected.json` — expected score, route, finding codes, and key extracted values;
- registration-evidence PDF;
- revenue XLSX;
- bank-statement-style UTF-8 CSV;
- ownership-declaration PDF, except where deliberately omitted in Case B.

`fixtures/manifest.json` lists each evidence file, MIME type, document type, and byte size.

## Expected cases

| Reference | Evidence variation | Expected finding codes | Expected action |
| --- | --- | --- | --- |
| `OPS-2026-0001` | Four required documents; current, matching XCD evidence | none | `READY_FOR_HUMAN_REVIEW` |
| `OPS-2026-0002` | Ownership PDF absent; revenue as of 2025-10-31 | `REQUIRED_DOCUMENT_MISSING`, `FINANCIAL_EVIDENCE_STALE` | `NEEDS_INFORMATION` |
| `OPS-2026-0003` | Registration PDF says “Caribbean Green Freight Services Ltd.”; registration `ABR-4421-A` matches the earlier open Case A | `LEGAL_NAME_MISMATCH`, `DUPLICATE_REGISTRATION` | `MANUAL_INVESTIGATION` |

## Parsing

PDF extraction looks only for explicit `Label: value` lines and records page/line locators. It does not use OCR. CSV and XLSX parsing require named columns and reject invalid dates or numbers. Revenue totals are calculated from the detail rows; the declared total is checked separately. Bank-style files yield transaction count, last date, ending balance, and currency.

The fixture inputs are intentionally simple enough to make extraction behavior testable. Production document variety would require a larger consented evaluation set, OCR and layout handling, per-document confidence thresholds, and a correction workflow.

## Data retention and deletion

Local evidence is stored beneath an ignored `data/` directory. The Docker stack uses a private volume. S3-compatible mode uses private API-mediated access and requests server-side encryption. The demo has no automated retention job or end-user deletion workflow. Those are recorded limitations, not implied capabilities.

## External sources

No external policy corpus, embeddings, credit-bureau data, identity service, bank feed, or proprietary dataset is used. Future Caribbean’s published submission materials informed project scope but are not copied into the runtime or fixtures.
