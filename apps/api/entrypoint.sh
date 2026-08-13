#!/bin/sh
set -eu

data_dir="${LOCAL_DATA_DIR:-/data}"

if [ "$(id -u)" -eq 0 ]; then
    mkdir -p "$data_dir"
    chown opsledger:opsledger "$data_dir"
    exec gosu opsledger "$0" "$@"
fi

uv run alembic upgrade head
uv run python -m opsledger.seed
exec uv run uvicorn opsledger.main:app --host 0.0.0.0 --port "${PORT:-8000}"
