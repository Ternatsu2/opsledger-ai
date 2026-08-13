# Testing evidence

## Recorded result

Local verification on 2026-08-13 AST completed with:

| Layer | Result | Coverage purpose |
| --- | --- | --- |
| TypeScript and Python static checks | pass | TypeScript compile and Ruff rules |
| Frontend unit tests | 7 passed | plain labels, document counts, file types, prepared messages, amount/date presentation |
| Backend tests | 35 passed | parsers, storage, rules, state, API, agent contract, plain-language packet, audit, retries, export, packaged runtime, write authorization |
| Playwright | 7 passed | plain-language queue and case outcomes, approval guard, unsent draft, intake validation, Activity disclosure, mobile layouts |
| Live API verification | 20 assertions passed | health/readiness, seeded contracts, PDF, audit and safety flags |
| Next.js production build | pass | optimized production compilation and route generation |
| npm dependency audit | 0 known vulnerabilities | direct and transitive JavaScript dependency scan |
| Secret scan | pass | detect-secrets over intended tracked text source files |

The backend run prints 12 warnings from PyMuPDF’s generated bindings and library internals. They do not represent failed assertions. No application test warning is suppressed in the table above.

## Commands

```bash
npm run lint
npm test
npm run test:e2e
npm run build
npm run verify
npm run security:scan
npm audit
```

`npm run verify` expects the API on `http://localhost:8000`; set `OPSLEDGER_API_URL` for a deployed API.

## Deterministic rule evidence

Tests cover:

- required field/document completeness;
- business-name normalization and mismatch threshold;
- exact normalized registration matching;
- jurisdiction conflict;
- earlier-open-case duplicate registration;
- business name plus contact reuse;
- cross-case file-hash reuse;
- stale and future-dated financial evidence;
- revenue detail/declared total tolerance;
- supported and conflicting currencies;
- valid and invalid workflow transitions;
- extraction failure followed by a successful retry.

The three seeded contracts currently detect every intentionally seeded issue: 0/0 findings for Case A, 2/2 for Case B, and 2/2 for Case C. This is fixture coverage, not an accuracy claim for arbitrary real documents.

## Agent evidence

Automated tests prove that:

- every nested JSON Schema object rejects extra fields and requires every property;
- invalid citation grounding triggers exactly one repair call;
- a repaired output is saved with five tool records;
- the route remains deterministic;
- the tool count stays below the demonstration limit of eight;
- repeat API commands with the same idempotency key return the same run.
- reviewer-facing summary fields and the PDF packet omit internal model, schema, rule, route, and validation terminology.

A strict release refresh invoked local `gpt-5.6-luna` at `xhigh` for all three cases and saved only validated outputs:

| Case | Route preserved | Tool records | Citations | Latency | Input / output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| `OPS-2026-0001` | Ready for Human Review | 5 | 12 | 22,130 ms | 17,360 / 1,003 |
| `OPS-2026-0002` | Needs Information | 5 | 5 | 26,623 ms | 17,082 / 1,106 |
| `OPS-2026-0003` | Manual Investigation | 5 | 6 | 54,918 ms | 17,732 / 986 |

Case B returned the required editable draft. Case A and Case C returned `follow_up_draft: null`; the latter is enforced so an identity-conflict hold remains an internal investigation. These measurements verify the local provider bridge and do not predict production throughput.

## Browser evidence

Playwright runs desktop tests in installed Chrome and a mobile test with the Pixel 7 Chromium profile. The suite confirms:

- all three required outcomes appear on the dashboard;
- Case A cannot be approved without a rationale;
- Case B explains both issues in plain language, keeps the follow-up editable, and has no email-send control;
- Case C explains both conflicts without exposing internal rule codes;
- required intake errors render after submission;
- implementation terms are absent from the primary queue and Activity page;
- Home, Applications, Add application, Activity, and a full case review fit the mobile viewport with primary navigation visible.

A separate manual pass inspected Home, Applications, Add application, all three application workspaces, Documents, History, the approval dialog, Activity, and 390-pixel mobile layouts. It also checked single-item navigation state, readable document metadata, prepared-message wording, and optional source details. The app console contained no product errors.

## Deployed release evidence

Railway built and started both Dockerfiles against managed PostgreSQL. The API applied Alembic migrations, idempotently seeded the exact three cases, mounted its private synthetic-evidence volume, and passed `/health` and `/ready`. The web served its standalone Next.js build with CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, and permissions policy headers.

Against the public URLs, the same live verifier passed all 20 assertions. CORS accepted the exact web origin, all read-only evidence and audit routes remained available, and every mutating route returned `401 REVIEWER_AUTH_REQUIRED` without the server-side reviewer token. A signed-out Chrome pass confirmed the visible read-only disclosure and disabled final write controls.

## Remaining validation work

- The local `docker compose` profile was not executed because the build machine did not have Docker installed; Railway supplied executable image builds and health checks for both application containers.
- No external finance/operations professional feedback has been collected; no testimonial is claimed.
- No malware scanner, penetration test, load test, screen-reader study, or real-document benchmark has been run.
- Independent external review and assistive-technology validation remain future work.
