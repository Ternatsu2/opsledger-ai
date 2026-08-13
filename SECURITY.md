# Security policy

## Supported version

This buildathon repository supports the current `main` branch only. It is a synthetic-data demonstration and must not be used for real applicant, banking, tax, identity, health, or client records.

## Report a vulnerability

Do not open a public issue containing exploit details, credentials, uploaded evidence, personal data, or a live service secret. Contact Terry Benjamin Jr. privately through the contact method associated with the submission. Include the affected route/version, a minimal reproduction using synthetic data, impact, and any correlation ID. Do not retain or distribute accessed data.

## Implemented controls

- Server-side input validation and safe error envelopes
- PDF/CSV/XLSX allowlist, MIME check, content check, size/page/row bounds
- Sanitized filenames, SHA-256 duplicate checks, opaque storage keys
- Private API-mediated downloads and optional S3 server-side encryption
- Explicit state-transition allowlist and required human rationale
- Optional constant-time reviewer token check
- Idempotency keys for processing and agent review
- Restricted CORS, security headers, production CSP, and request rate limits
- Correlation IDs without raw document logging
- Strict agent schema, citation allowlist, two-attempt ceiling, read-only local sandbox
- Append-only ORM guards and database triggers for audit events
- Non-root application containers

## Demonstration limitations

The public demo does not provide tenant authentication, per-case authorization, malware scanning, antivirus quarantine, encrypted local volumes, automated retention/deletion, a SIEM, formal penetration testing, or compliance certification. The in-memory rate limiter is per API process and should be replaced with a shared limiter before horizontal scaling. A reviewer token can protect write actions, but the buildathon’s signed-out judge flow may intentionally leave it unset.

## Secret handling

`.env` files, local databases, evidence storage, exports, test artifacts, and Python/Node caches are ignored. Never commit `DATABASE_URL`, `REVIEWER_TOKEN`, object-storage credentials, a model key, session credentials, or Railway/GitHub tokens. Browser variables must be limited to values intentionally prefixed `NEXT_PUBLIC_`.
