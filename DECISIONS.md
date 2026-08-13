# OpsLedger AI Decisions

## D-001: Focus the buildathon submission on financing readiness

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

OpsLedger will ship one complete MSME financing-readiness workflow. The configurable workflow-platform concept stays in the roadmap.

## D-002: Separate deterministic checks from model work

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

Python code owns parsing, normalization, duplicate detection, arithmetic, document recency, completeness, workflow transitions, and audit history. The model summarizes cited evidence, explains unresolved findings, drafts a request for missing information, and proposes one allowed workflow action.

## D-003: Require a person for consequential actions

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

The agent cannot approve financing, reject an applicant, send a message, transfer money, or close an investigation. A reviewer must confirm each workflow action, and OpsLedger records the reviewer’s rationale.

## D-004: Use local Codex Luna for the demo agent

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

Local agent runs use the installed Codex CLI, `gpt-5.6-luna`, `xhigh` reasoning, a read-only sandbox, a strict JSON output schema, and two attempts at most. A deterministic provider keeps the seeded demo usable when Codex is unavailable. The interface and run record identify the provider used.

## D-005: Keep the deployment path PostgreSQL-compatible

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

SQLAlchemy supports SQLite during local development and PostgreSQL in Railway. File storage uses a local private directory by default and an S3-compatible backend when a Railway bucket is configured.

## D-006: Use synthetic data only

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

The public demo uses records created for Island Harvest Foods Ltd., Blue Shore Repairs, and Caribbean Green Logistics. The interface warns users not to upload identity, banking, tax, health, or client records.

## D-007: Treat conflict cases as internal investigations

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

The structured agent contract requires a follow-up draft for `NEEDS_INFORMATION` and requires a null draft for every other route. Identity and duplicate conflicts remain internal until a human resolves them.

## D-008: Use database-enforced append-only audit history

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

ORM listeners reject audit-event updates/deletes during application work. The initial Alembic migration installs equivalent SQLite and PostgreSQL triggers so direct database mutations cannot silently rewrite history.

## D-009: Publish under Apache-2.0

**Date:** 2026-08-13 AST<br>
**Status:** Accepted

The repository uses Apache License 2.0 for its explicit patent grant. Third-party dependencies retain their own licenses; no former client code or asset is included.
