# OpsLedger AI — submission overview

**Track:** Finance, Payments & MSME Capital<br>
**Builder:** Terry Benjamin Jr. · Antigua and Barbuda<br>
**Status:** Working synthetic-data MVP; final portal submission requires Terry’s review

**Live demo:** [opsledger-web-production.up.railway.app](https://opsledger-web-production.up.railway.app)<br>
**Repository:** [github.com/Ternatsu2/opsledger-ai](https://github.com/Ternatsu2/opsledger-ai)

## Problem

Small businesses and the organizations that support them often manage financing applications across email, PDFs, spreadsheets, shared folders, and repeated follow-up. A reviewer has to locate evidence, retype fields, check whether documents are current, reconcile inconsistent names and totals, spot repeat records, and explain what remains missing. For a lean Caribbean team, that administrative work consumes time that should go to advising businesses and evaluating the cases that are actually ready.

The delay affects both sides. An MSME waits longer without knowing which item blocked progress. A credit union, grant program, advisor, or development-finance team carries an opaque queue with little evidence about where time was lost.

## Solution

OpsLedger AI is a human-reviewed financing-readiness workflow. An operator creates a case and uploads a small set of supporting documents. The system validates the files, extracts explicit fields into a canonical record, checks completeness and internal consistency, and routes the package to one of three operational outcomes: Ready for Human Review, Needs Information, or Manual Investigation.

A bounded agent then receives five typed, read-only evidence bundles. It prepares a concise case summary, cites the exact fields and findings behind its claims, lists missing information, and drafts a follow-up when appropriate. Strict schema and grounding checks reject invented citations or a route that conflicts with deterministic code. A qualified reviewer approves, edits, or reroutes the work and supplies a rationale. OpsLedger does not approve credit, reject an applicant, send funds, or transmit a message.

## Working demonstration

The repository includes three reproducible synthetic businesses:

- Island Harvest Foods Ltd. has a complete, current, internally consistent package. It reaches Ready for Human Review with a 100/100 transparent checklist and no open finding.
- Blue Shore Repairs omits an ownership declaration and supplies 286-day-old revenue evidence against a 180-day demonstration policy. It reaches Needs Information and receives an editable—but unsent—follow-up draft.
- Caribbean Green Logistics Ltd. has a legal-name mismatch and reuses an open case’s registration number. It reaches Manual Investigation without the agent inventing a conclusion.

Reviewers can inspect extracted values and source locators, deterministic findings, the agent’s evidence citations and limitations, every state transition, human rationale, correlation IDs, and a downloadable PDF review packet.

The signed-out showcase is intentionally read-only. Every mutating API route requires a server-side reviewer token, while the interface keeps the intake, rerun, editing, and approval boundaries visible. This protects the seeded demonstration without pretending that a shared token is the named-user identity system required for a pilot.

## Caribbean and global relevance

Many Caribbean institutions operate with small teams and mixed digital systems. Replacing a core platform is expensive and slow; improving one document-heavy workflow is a practical entry point. OpsLedger can sit beside the current process, apply a buyer-configured document policy, and show exactly why a case moved or stopped.

The architecture applies beyond financing readiness to grants, supplier onboarding, insurance intake, accounting operations, and regulated case preparation. The global problem is the same: language models can help with explanation, but trusted systems still need explicit state, evidence, permissions, deterministic checks, and human accountability.

## Technical and agentic approach

The interface is built with Next.js and TypeScript. FastAPI, Pydantic, SQLAlchemy, and Alembic provide the API and canonical data model. PostgreSQL is the deployment database; SQLite supports fast local work. PyMuPDF parses labelled PDFs, while pandas and openpyxl process bounded CSV/XLSX files. Evidence remains in private storage, and audit events are protected against update or deletion at both application and database layers.

Local demonstrations can call `gpt-5.6-luna` at `xhigh` through an authenticated Codex installation, inside an ephemeral read-only directory. The hosted demonstration uses a transparent deterministic provider because the local Codex session is not available in Railway. Every run stores provider identity; no fallback is presented as model output.

The current measured build passes 33 backend tests, three frontend unit tests, six Chrome/Chromium browser flows, 20 live-system assertions, and the optimized production build. Railway built both application containers and serves the public interface and API against managed PostgreSQL. The seeded set detects all four intentionally introduced deterministic issues. These are synthetic fixture results, not a claim of real-document accuracy.

## Business model and go-to-market

Initial buyer hypotheses are credit unions and community lenders, MSME and grant programs, accounting/advisory firms, development-finance programs, and government small-business units. The value proposition is operational: reduce document chasing, re-entry, avoidable review cycles, and undocumented overrides.

The commercial hypothesis combines a paid workflow-discovery/configuration engagement with a recurring subscription based on users, case volume, storage, and model use. Pricing remains unvalidated and is deliberately omitted.

The first deployment should be a 30- to 60-day controlled pilot with one institution and one document policy. OpsLedger would run alongside the manual process rather than replace it. The pilot would measure median preparation time, missing-document cycles, extraction corrections, reviewer overrides, case throughput, and failure reasons. Integrations and adjacent workflows should be added only after those results support expansion.

Defensibility comes from configurable workflow policies, evidence-linked human review, reusable extraction and validation adapters, an inspectable audit model, and deployment choices that can respect Caribbean data-region and retention needs—not from wrapping a general-purpose model.

## Safety, limits, and scaling path

Only synthetic data belongs in the public buildathon environment. The MVP does not claim legal or financial-regulatory compliance. Before a real pilot it needs tenant authentication and authorization, malware scanning, formal accessibility and security testing, retention/deletion automation, a data-protection impact assessment, vendor review, model-risk governance, and local legal advice.

The present synchronous processor suits the small fixture set. At pilot scale, parsing and model tasks move to a queue; web and API services scale statelessly; PostgreSQL and private object storage scale independently; and tenant policies select retention, region, and permitted model processing. The current idempotency keys, migrations, provider abstraction, private storage interface, explicit state machine, and failure/retry states provide the seam for that work.
