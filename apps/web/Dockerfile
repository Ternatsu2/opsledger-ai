FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

FROM node:24.16.0-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace @opsledger/web

FROM node:24.16.0-bookworm-slim AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

RUN useradd --create-home --uid 10001 opsledger
COPY --from=builder --chown=opsledger:opsledger /app/apps/web/.next/standalone ./
COPY --from=builder --chown=opsledger:opsledger /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=opsledger:opsledger /app/apps/web/public ./apps/web/public

USER opsledger
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
