FROM ghcr.io/astral-sh/uv:0.11.32-python3.12-trixie-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/ ./
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/* && \
    uv sync --frozen --no-dev && \
    useradd --create-home --uid 10001 opsledger && \
    mkdir -p /data && \
    chown -R opsledger:opsledger /app /data

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
