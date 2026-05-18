# tokagent-billing-server — Dockerfile
#
# Deploys ONE tokagentos instance running in `BILLING_MODE=server` as the
# canonical hosted billing rail. Other users run tokagentos locally in
# `BILLING_MODE=client` pointing at this deployment via TOKAGENT_GATEWAY_URL.
#
# Build context: the tokagentos monorepo root (NOT this directory).
#   docker build -f tokagentos/apps/billing-server/Dockerfile tokagentos/

# ---- Stage 1: install + build ----
FROM oven/bun:1.3-alpine AS builder

WORKDIR /workspace

# Copy workspace manifests first to maximise layer cache hits.
COPY package.json bun.lock bunfig.toml turbo.json tsconfig.base.json tsconfig.build.template.json tsconfig.json ./
COPY scripts/ ./scripts/

# Copy ONLY the packages billing-server actually needs to run.
# Skip every app/ entry — apps like app-lifeops/app-vincent/app-shopify
# pull large native deps and dramatically inflate the image without being
# used in server-mode.
COPY packages/billing/         ./packages/billing/
COPY packages/agent/           ./packages/agent/
COPY packages/app-core/        ./packages/app-core/
COPY packages/native-plugins/  ./packages/native-plugins/
COPY packages/shared/          ./packages/shared/
COPY packages/typescript/      ./packages/typescript/
COPY packages/schemas/         ./packages/schemas/
COPY packages/scenario-runner/ ./packages/scenario-runner/
COPY packages/ui/              ./packages/ui/
COPY packages/tokagentos/      ./packages/tokagentos/
COPY plugins/plugin-tokagent-billing/ ./plugins/plugin-tokagent-billing/

# bun install handles workspace symlinking automatically.
RUN bun install --frozen-lockfile

# Type-check the billing surface (fail fast on type errors at build time).
RUN cd packages/billing                && ./node_modules/.bin/tsc --noEmit
RUN cd plugins/plugin-tokagent-billing && ./node_modules/.bin/tsc --noEmit

# ---- Stage 2: runtime ----
FROM oven/bun:1.3-alpine AS runtime

# Run as non-root.
RUN addgroup -g 1001 -S tokagent && adduser -S tokagent -u 1001 -G tokagent

WORKDIR /workspace

# Copy the resolved workspace from the builder.
COPY --from=builder --chown=tokagent:tokagent /workspace /workspace

USER tokagent

# Fly routes traffic to internal_port (see fly.toml).
EXPOSE 8080

# Server-mode is the entire reason this image exists; lock it in.
ENV BILLING_MODE=server
ENV BILLING_ENABLED=true
ENV TOKAGENT_PORT=8080
ENV NODE_ENV=production

# The autonomous CLI's bin.ts is the same entry-point used in local dev.
# Running TS directly via `bun --bun` avoids needing a compiled dist; bun's
# loader is the canonical path tokagentos uses elsewhere.
CMD ["bun", "--bun", "packages/agent/src/bin.ts"]
