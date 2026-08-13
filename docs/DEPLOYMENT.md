# Deployment and rollback

## Local profiles

The default local profile uses SQLite and private filesystem storage. `docker-compose.yml` uses PostgreSQL, a persistent file volume, health checks, and the deterministic agent provider.

The API startup command applies Alembic migrations, seeds the three cases once, and starts Uvicorn. The Next.js image uses the framework’s standalone server output and runs as a non-root user. The API image also runs as a non-root user.

## Railway target

The intended Railway project contains:

- `opsledger-web` built from `apps/web/Dockerfile`;
- `opsledger-api` built from `apps/api/Dockerfile`;
- managed PostgreSQL;
- a private persistent volume mounted at `/data` for the buildathon demonstration.

Recommended API variables:

```text
DATABASE_URL
ALLOWED_ORIGINS
APP_BASE_URL
API_BASE_URL
DEMO_MODE
SEED_DEMO
MODEL_PROVIDER
MODEL_STRICT
LOCAL_DATA_DIR
MAX_UPLOAD_MB
MAX_PDF_PAGES
MAX_TABLE_ROWS
LOG_LEVEL
```

The web build requires `NEXT_PUBLIC_API_URL`. Do not expose `REVIEWER_TOKEN`, database credentials, object-storage credentials, or a model key through a `NEXT_PUBLIC_` variable.

For the public buildathon service, set `MODEL_PROVIDER=deterministic`: Railway does not have Terry’s authenticated local Codex session. Local demonstrations can use Luna and will record the provider identity on that run. Do not describe the hosted deterministic output as a remote model call.

## Storage

The Railway volume is acceptable for synthetic buildathon fixtures. A controlled pilot should use a private S3-compatible bucket, short-lived download authorization, malware scanning, tenant-scoped keys, retention automation, and a backup policy. S3 mode requires:

```text
STORAGE_BACKEND=s3
STORAGE_BUCKET
S3_ENDPOINT_URL
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_REGION
```

## Health and smoke checks

Railway health checks should target:

- API liveness: `/health`
- API database readiness: `/ready`
- web readiness: `/`

After each deployment:

```bash
OPSLEDGER_API_URL=https://<api-domain> npm run verify
PLAYWRIGHT_BASE_URL=https://<web-domain> npm run test:e2e
```

Then open the web URL in a signed-out browser and test every public route, one PDF download, the Case A confirmation dialog without submitting it, and Case B’s lack of a send control.

## Rollback

1. Keep the last successful Railway deployments for web and API.
2. If an application release fails health checks, roll each affected service back to its last successful deployment.
3. Do not run a destructive database downgrade as an incident response shortcut.
4. For a schema issue, restore from the managed database backup into a separate service, verify it, and then redirect the API.
5. Preserve logs and correlation IDs without copying document content into an incident ticket.

The initial migration’s downgrade drops the schema and is intended only for disposable local environments. It must not be used against the demonstration or a future production database.
