#!/bin/sh
set -eu

uv run alembic upgrade head
uv run python -m opsledger.seed
exec uv run uvicorn opsledger.main:app --host 0.0.0.0 --port "${PORT:-8000}"
