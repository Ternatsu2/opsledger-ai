# Known Limitations

- The buildathon demo accepts synthetic records only. It has not undergone the legal, privacy, security, or model-risk review required for production financial data.
- The readiness score measures a configurable document checklist. It does not estimate creditworthiness or eligibility.
- Local model runs depend on Terry’s authenticated Codex CLI. Hosted environments use the disclosed deterministic fallback unless an approved model provider is configured.
- The demo parser targets the supplied synthetic PDF, CSV, and XLSX layouts. It does not claim general document-understanding accuracy.
- SQLite supports local development only. The selected deployment uses PostgreSQL.
- The Railway demonstration may use a private persistent volume for synthetic files. A controlled pilot needs private object storage, malware scanning, retention automation, and tenant-scoped access.
- The signed-out public showcase is intentionally read-only. Mutating routes require a server-side reviewer token; a controlled pilot still needs named-user authentication, roles, tenant isolation, and access review.
- The system drafts follow-up messages but does not send email.
- TapIn builder-portal access and final-submission authority remain with Terry.
- The build machine does not have Docker installed, so the local Compose stack was not executed there. Railway built and health-checked both application Dockerfiles against the deployed PostgreSQL service.
- No external finance/operations professional feedback, penetration test, load test, or screen-reader study has been completed. None is claimed.
