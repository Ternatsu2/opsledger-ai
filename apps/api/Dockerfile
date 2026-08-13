FROM ghcr.io/astral-sh/uv:0.11.17-python3.12-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/ ./
RUN uv sync --frozen --no-dev && \
    useradd --create-home --uid 10001 opsledger && \
    mkdir -p /data && \
    chown -R opsledger:opsledger /app /data

USER opsledger
EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
