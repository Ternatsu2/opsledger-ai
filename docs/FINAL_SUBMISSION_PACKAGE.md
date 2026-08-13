# OpsLedger AI — final submission package

Prepared: 2026-08-13 AST<br>
Status: release candidate ready for Terry Benjamin Jr.’s review; **not submitted**

## Submission fields

**Project name:** OpsLedger AI<br>
**Track:** Finance, Payments & MSME Capital<br>
**Builder:** Terry Benjamin Jr., Antigua and Barbuda<br>
**Live demo:** [https://opsledger-web-production.up.railway.app](https://opsledger-web-production.up.railway.app)<br>
**Public repository:** [https://github.com/Ternatsu2/opsledger-ai](https://github.com/Ternatsu2/opsledger-ai)<br>
**License:** Apache-2.0<br>
**Submission artifact:** Signed-out live demo link. A three- to five-minute walkthrough is optional under the published “video or live demo link” requirement.

## One-line summary

OpsLedger AI turns scattered MSME financing documents into an evidence-linked review queue with deterministic checks, bounded AI analysis, and a recorded human decision.

## Short description

Small financing and business-support teams lose time collecting files, retyping fields, checking document age, reconciling names and totals, and explaining what is still missing. OpsLedger AI turns that administrative work into a traceable financing-readiness workflow.

The system validates synthetic PDF and spreadsheet evidence, extracts cited fields, applies deterministic rules, and routes a package to Ready for Human Review, Needs Information, or Manual Investigation. A bounded agent receives five typed read-only evidence bundles and returns a strict, citation-checked summary. It cannot override the route, approve credit, contact an applicant, or move money. A person records every consequential workflow action with a rationale, and an append-only audit ledger preserves the history.

The live demo includes one clean package, one stale/incomplete package, and one identity/duplicate conflict. It runs on Railway with Next.js, FastAPI, PostgreSQL, private synthetic-evidence storage, health checks, migrations, and a signed-out read-only safeguard.

## What to inspect in the live demo

1. Open the dashboard and confirm all three operational outcomes are visible.
2. Open `OPS-2026-0001` to inspect its four required documents, source-linked details, review summary, approval note, History, and PDF packet.
3. Open `OPS-2026-0002` to inspect the missing ownership declaration, 286-day-old revenue evidence, and editable follow-up draft with no send control.
4. Open `OPS-2026-0003` to inspect the legal-name mismatch, registration-number collision, and **Needs a closer look** status.
5. Open **Activity** to see what changed, which application it affected, who updated it, and when. Optional demo details sit below the activity list.

The public showcase deliberately blocks writes. Its controls remain visible so judges can inspect the workflow boundary; recording a change requires reviewer authorization in a controlled environment.

## Verified evidence

- 35 backend tests passing
- 7 frontend unit tests passing
- 7 Playwright desktop/mobile flows passing
- 20 live API assertions passing against Railway
- Optimized Next.js production build passing
- GitHub Actions release gate passing
- npm audit reporting zero known vulnerabilities
- All three strict local `gpt-5.6-luna` `xhigh` runs completed with five typed tools, validated citations, and deterministic routes preserved
- Signed-out desktop and 390-pixel mobile QA completed on the deployed system

These results apply to the project-created synthetic fixture set. They are not claims about arbitrary real documents, creditworthiness, eligibility, legal compliance, or production security certification.

## Technical disclosure

- Next.js 16, React 19, and TypeScript reviewer interface
- FastAPI, Pydantic, SQLAlchemy, and Alembic API/data layer
- PostgreSQL in Railway; SQLite for local development
- PyMuPDF, pandas, and openpyxl for bounded fixture parsing
- Five typed read-only agent tools; strict schema, citation allowlist, two attempts, eight-call ceiling
- Local `gpt-5.6-luna` at `xhigh` through Terry’s authenticated Codex installation
- Transparent deterministic provider in Railway because the local Codex session is unavailable there
- Private API-mediated evidence downloads, SHA-256 hashes, safe filenames, limits, CORS, security headers, rate limits, idempotency, reviewer authorization, and database-enforced append-only audit history

## Documentation links

- [Submission overview](SUBMISSION_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Agent design](AGENT_DESIGN.md)
- [Responsible AI statement](RESPONSIBLE_AI.md)
- [Models, tools, and data](MODELS_TOOLS_DATA.md)
- [Testing evidence](TESTING.md)
- [Deployment and rollback](DEPLOYMENT.md)
- [Known limitations](../KNOWN_LIMITATIONS.md)
- [Security policy](../SECURITY.md)
- [License](../LICENSE)
- [Demo script](DEMO_SCRIPT.md)

## Approval boundary

Before portal submission, Terry should verify the live demo and repository while signed out, review the wording above, decide whether to add the optional video, complete TapIn sign-in/terms personally, and explicitly approve submission. Do not press the final submit control without that approval. After submission, save the final portal URL, timestamp, and receipt in `PROGRESS_LOG.md` and `SUBMISSION_CHECKLIST.md`.
