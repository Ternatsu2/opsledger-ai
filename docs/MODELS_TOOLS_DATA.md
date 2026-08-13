# Models, tools, and data disclosure

This table lists what the project actually uses. It deliberately excludes proposed sponsor services and unimplemented integrations.

| Category | Choice | Use in OpsLedger |
| --- | --- | --- |
| Local model | `gpt-5.6-luna`, `xhigh`, through Codex CLI | Optional local structured recommendation; verified against all three cases |
| Hosted model | None | No hosted model API key or remote provider is required |
| Deterministic provider | `opsledger-rules-2026-08-13` | Reproducible seed/hosted demo output and explicit provider fallback |
| Embedding model / vector database | None | The small policy pack is versioned Python data; no vector claim |
| Orchestration | Explicit FastAPI service workflow | Five typed read results, two-attempt ceiling, schema/citation validation |
| Frontend | Next.js 16, React 19, TypeScript, Phosphor Icons | Reviewer interface and responsive navigation |
| Backend | FastAPI, Pydantic, SQLAlchemy, Alembic | API, validation, state, migrations, and data contracts |
| Database | PostgreSQL for deployment; SQLite locally | Cases, documents, extracted fields, findings, runs, reviews, audit |
| File storage | Private local/Railway volume; optional S3-compatible backend | Source evidence; downloads pass through API |
| PDF tools | PyMuPDF, ReportLab | Extraction and generated fixtures/review packets |
| Spreadsheet tools | pandas, openpyxl | CSV/XLSX parsing and synthetic workbook generation |
| Browser testing | Playwright with installed Chrome/Chromium | Critical desktop and mobile workflows |
| Hosting | Terry’s personal Railway workspace | Deployed web, API, PostgreSQL, and private synthetic-evidence volume |
| Runtime data | Project-created synthetic fixtures | Three applications, 11 evidence files, expected-result contracts |
| External runtime data | None | No bureau, bank, identity, policy, or client feed |

## Provider behavior

`MODEL_PROVIDER=codex_luna` calls the local binary. `MODEL_STRICT=true` makes any provider/schema failure visible. `MODEL_STRICT=false` returns a labelled deterministic fallback. `MODEL_PROVIDER=deterministic` skips the model call. Stored runs always expose the provider and model identity.

## Third-party assets

The product uses no stock photography, copied UI kit, external company logo, or former client asset. The logo mark is project-authored SVG. Font files are provided through Next.js font tooling. See `THIRD_PARTY_NOTICES.md` for dependency acknowledgements.
