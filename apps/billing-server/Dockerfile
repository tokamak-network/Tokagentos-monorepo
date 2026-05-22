# tokagent-billing-server — Dockerfile
#
# Deploys ONE tokagentos instance running in `BILLING_MODE=server` as the
# canonical hosted billing rail. Other users run tokagentos locally in
# `BILLING_MODE=client` pointing at this deployment via TOKAGENT_GATEWAY_URL.
#
# Build context: the tokagentos monorepo root (NOT this directory).
#   docker build -f tokagentos/apps/billing-server/Dockerfile tokagentos/

# ---- Stage 1: install + build ----
FROM oven/bun:1.3-debian AS builder

# Native-deps build toolchain. node-llama-cpp's postinstall checks for a
# usable prebuilt binary first; if missing, falls back to cloning llama.cpp
# via git and building with make + g++ + python3. On debian (glibc) the
# prebuilt path usually works, but we provide the fallback toolchain so
# install never gets stuck on tooling absence.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git make g++ python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

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
COPY packages/shared/          ./packages/shared/
COPY packages/typescript/      ./packages/typescript/
COPY packages/schemas/         ./packages/schemas/
COPY packages/ui/              ./packages/ui/
COPY packages/tokagentos/      ./packages/tokagentos/
# Skipped: packages/native-plugins and packages/scenario-runner — untracked
# in git (only exist on dev disks). Nothing in the billing-server code path
# imports either, and the workspace glob (packages/*) tolerates missing
# directories at install time.
COPY plugins/plugin-tokagent-billing/ ./plugins/plugin-tokagent-billing/

# Frontend marketing site — server-mode never runs it, but the root
# package.json declares "frontend" as a literal workspace member (not a glob),
# so `bun install` aborts with "Workspace not found 'frontend'" if the
# manifest is missing at /workspace/frontend/package.json. Copy just the
# package.json (~700 B) to satisfy the resolver; the actual frontend source
# stays out of the runtime image.
COPY frontend/package.json     ./frontend/package.json

# packages/agent/src/api/server.ts statically imports @tokagentos/app-
# tokagentmaker, app-knowledge, app-steward, app-task-coordinator, app-training
# at module-load time. Even in server-only mode the API server module is
# imported, so bun resolves these imports eagerly and the agent crashes with
# "Cannot find module" before binding the port if they're absent. They were
# briefly orphaned by commit 59868695 ("remove 16 legacy app integrations")
# but the import sites were never cleaned up — committed back via cb5ce... so
# the build context can resolve them.
COPY apps/app-companion/        ./apps/app-companion/
COPY apps/app-knowledge/        ./apps/app-knowledge/
COPY apps/app-lifeops/          ./apps/app-lifeops/
COPY apps/app-shopify/          ./apps/app-shopify/
COPY apps/app-steward/          ./apps/app-steward/
COPY apps/app-task-coordinator/ ./apps/app-task-coordinator/
COPY apps/app-tokagentmaker/    ./apps/app-tokagentmaker/
COPY apps/app-training/         ./apps/app-training/
COPY apps/app-vincent/          ./apps/app-vincent/

# bun install handles workspace symlinking automatically.
#
# NOT --frozen-lockfile: bun.lock was generated against the FULL workspace
# (~14 apps/*) that lives in the dev checkout. The Docker context only
# includes apps/app-companion (the one transitive dep packages/agent + app-core
# need); resolving against this slim set produces a different lockfile, which
# would fail the frozen check. Bun regenerates the lockfile inside the image
# at build time. Tradeoff: consecutive deploys could pull marginally different
# transitive versions if upstream releases happen between builds.
#
# Run postinstalls so node-llama-cpp can drop in its prebuilt glibc binary
# (which the agent's plugin-local-embedding loads at runtime via getInstance).
# Without this, runtime crashes with "Cannot find module ... node-llama-cpp"
# in plugin-local-embedding's getInstance call. The apt toolchain above is
# a fallback if the prebuilt binary isn't available for some reason.
RUN bun install

# Build the billing plugin + library dist/ in-image. Required because:
#   1. The build context excludes **/dist via .dockerignore (so the locally-
#      built dist/ doesn't ship into the container).
#   2. The plugin's package.json `main`/`exports` point at dist/index.js —
#      when dist is missing, the plugin-resolver falls back to src/index.ts,
#      which loads service modules one-by-one with unbundled imports. Bundled
#      dist works because internal services are inlined and only viem +
#      @tokagentos/{core,billing} remain as external imports the runtime can
#      resolve via /workspace/node_modules.
#
# We call `bun build` directly (not `bun run build`) to skip the tsc step
# inside the package's build.ts. tsc can't resolve @tokagentos/core types in
# the build container (the package's tsconfig paths assume a different
# directory layout) and fails the whole script. We don't need .d.ts emission
# at runtime — bun runs the bundled JS directly without type-checking.
RUN cd /workspace/packages/billing \
 && bun build ./src/index.ts --outdir ./dist --target=node --format=esm \
      --external=viem --external=@tokagentos/core --sourcemap=external \
 && mkdir -p dist/drizzle \
 && cp -r drizzle/migrations dist/drizzle/migrations 2>/dev/null || true \
 && cd /workspace/plugins/plugin-tokagent-billing \
 && bun build ./src/index.ts --outdir ./dist --target=node --format=esm \
      --external=viem \
      --sourcemap=external \
 && cp -r src/dashboard dist/dashboard 2>/dev/null || true

# Why no --external=@tokagentos/core / @tokagentos/billing for the plugin:
# bun's plugin staging dereferences the package to a temp dir and bun's
# runtime ESM resolver stops walking up at the staged package.json boundary.
# Even with workspace node_modules + ancestor symlinks pointing at it, the
# resolver doesn't reach them, so `import "@tokagentos/core"` from the staged
# dist/index.js fails. Bundling both packages INTO the plugin's dist makes
# it self-contained and removes the resolution dependency entirely.
# Side-effects:
#   - Plugin dist is larger (~MB scale instead of KB) — acceptable.
#   - The plugin gets its OWN instance of core+billing classes, separate
#     from the host agent's. For billing-server this is fine: the plugin
#     IS the billing runtime; the host agent doesn't share billing state.

# Typecheck was here as a fail-fast guard but removed because:
#   - tsc follows workspace imports into @tokagentos/core (packages/typescript/),
#     which depends on protobuf-generated files (./generated/tokagent/v1/*_pb.js)
#     produced by a separate `buf generate` step not in this Dockerfile.
#   - Adding `buf` + regenerating the proto stubs here adds another tool dep
#     and slows the build for a check that doesn't affect runtime correctness.
#   - Runtime is `bun --bun packages/agent/src/bin.ts` — bun executes TS without
#     typechecking, so the missing generated files don't block runtime.
# Typechecks still gate local dev + CI (typecheck-billing.yml workflow). If the
# generated proto stubs ever land in the repo or get bundled in @tokagentos/core's
# dist, re-enable these two RUN lines for defense-in-depth.

# ---- Stage 2: runtime ----
FROM oven/bun:1.3-debian AS runtime

# Run as non-root. (Debian syntax — alpine uses -S; not portable.)
# Why debian: native deps (onnxruntime-node, node-llama-cpp) ship glibc-linked
# binaries. Alpine's musl libc lacks ld-linux-x86-64.so.2 so the app crashes
# at startup with "Cannot find ld-linux..." before binding the port.
# --create-home: plugin-local-embedding caches the bge-small embedding model
# at $HOME/.cache by default; without a home dir it fails with EACCES on
# mkdir('/home/tokagent') and the agent never finishes boot.
RUN groupadd --system --gid 1001 tokagent \
 && useradd --system --uid 1001 --gid tokagent --shell /usr/sbin/nologin \
            --create-home --home-dir /home/tokagent tokagent

WORKDIR /workspace

# Copy the resolved workspace from the builder.
COPY --from=builder --chown=tokagent:tokagent /workspace /workspace

# Pre-create cache/data dirs as tokagent — plugin-local-embedding will mkdir
# under CACHE_DIR/MODELS_DIR at boot, which fails if /workspace is still
# root-owned (Docker's COPY --chown only chowns copied content, not the
# pre-existing destination dir created by WORKDIR). One chown -R on
# /workspace fixes ownership of the dir itself + creates the cache children.
#
# Also: pre-create /home/tokagent/.tokagent/plugins + symlink its node_modules
# into the workspace's. tokagentos stages plugins under .runtime-imports/...
# at runtime; from that staging path, Node module resolution walks UP looking
# for node_modules and won't find /workspace/node_modules (different subtree).
# This symlink puts a node_modules at an ancestor of every staged plugin path,
# so `import "@tokagentos/core"` inside a staged plugin resolves correctly.
RUN mkdir -p /workspace/.cache/models /workspace/.tokagent/plugins \
              /home/tokagent/.tokagent/plugins \
 && ln -s /workspace/node_modules /workspace/.tokagent/plugins/node_modules \
 && ln -s /workspace/node_modules /workspace/.tokagent/node_modules \
 && ln -s /workspace/node_modules /home/tokagent/.tokagent/plugins/node_modules \
 && ln -s /workspace/node_modules /home/tokagent/.tokagent/node_modules \
 && ln -s /workspace/node_modules /home/tokagent/node_modules \
 && chown -R tokagent:tokagent /workspace /home/tokagent

# Inline verification — printed in build logs so we can see if the workspace
# resolution is set up correctly before runtime.
RUN echo "=== /workspace/node_modules/@tokagentos/ ===" \
 && ls -la /workspace/node_modules/@tokagentos/ 2>&1 | head -10 \
 && echo "=== /home/tokagent/.tokagent/plugins/node_modules → ===" \
 && ls -la /home/tokagent/.tokagent/plugins/node_modules 2>&1 | head -5

USER tokagent

# Fly routes traffic to internal_port (see fly.toml).
EXPOSE 8080

# Server-mode is the entire reason this image exists; lock it in.
ENV BILLING_MODE=server
ENV BILLING_ENABLED=true
ENV BILLING_AUTH_REQUIRED=true
ENV TOKAGENT_PORT=8080
ENV NODE_ENV=production

# Non-secret billing config. railway.toml [deploy.envs] doesn't reliably
# propagate (same issue as TOKAGENT_API_BIND), so bake every non-secret
# value into the image. Secrets (DB URL, auth secret, operator key, RPC URLs,
# LiteLLM key) MUST come from Railway dashboard variables.
ENV BILLING_CHAIN_ID=1
ENV BILLING_VAULT_ADDRESS=0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F
ENV BILLING_PTON_ADDRESS=0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0
ENV BILLING_WTON_WETH_POOL_ADDRESS=0xC29271E3a68A7647Fd1399298Ef18FeCA3879F59
ENV BILLING_WTON_IS_TOKEN0_IN_WETH_POOL=false
ENV BILLING_WETH_USDC_POOL_ADDRESS=0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
ENV BILLING_WETH_IS_TOKEN0_IN_USDC_POOL=false
ENV BILLING_WTON_DECIMALS=27
ENV BILLING_WETH_DECIMALS=18
ENV BILLING_USDC_DECIMALS=6
ENV BILLING_TWAP_WINDOW_SECONDS=60
ENV BILLING_LITELLM_BASE_URL=https://api.ai.tokamak.network/
ENV BILLING_MARGIN_BPS=100
ENV BILLING_MARGIN_FLOOR_BPS=50
ENV BILLING_PROMOTION_DISCOUNT_BPS=0
ENV BILLING_RATE_LIMIT_ENABLED=true
ENV BILLING_RATE_LIMIT_QUOTE_PER_MIN=60
ENV BILLING_RATE_LIMIT_SETTLE_PER_MIN=30
ENV BILLING_CONSUME_SCAN_INTERVAL_MS=30000
ENV BILLING_CONSUME_BATCH_MIN_PTON=1000000000000000
ENV BILLING_CONSUME_MAX_PER_CYCLE=50
ENV BILLING_CONSUME_MAX_AGE_MS=300000
ENV BILLING_USAGE_RETENTION_DAYS=90
ENV BILLING_USAGE_CLEANUP_INTERVAL_MS=3600000

# Bind to all interfaces — without this, the agent's resolveApiBindHost falls
# back to DEFAULT_API_BIND_HOST = "127.0.0.1" and Railway's external
# healthcheck gets connection-refused. The railway.toml [deploy.envs] equivalent
# didn't propagate reliably, so bake it into the image ENV layer.
ENV NODE_PATH=/workspace/node_modules
ENV TOKAGENT_API_BIND=0.0.0.0
ENV TOKAGENT_ALLOWED_HOSTS=localhost,0.0.0.0,127.0.0.1,.up.railway.app,.railway.app,.railway.internal
ENV TOKAGENT_ALLOW_NULL_ORIGIN=true

# Pin HOME + cache dirs to a writable location under /workspace. Defends
# against plugins that resolve $HOME at runtime AND against the tokagent
# user's home dir disappearing if Railway mounts volumes over /home.
ENV HOME=/home/tokagent
ENV CACHE_DIR=/workspace/.cache
ENV MODELS_DIR=/workspace/.cache/models

# TOKAGENT_STATE_DIR overrides ~/.tokagent for plugin staging + config. Setting
# it under /workspace is the key fix for module resolution: tokagentos stages
# plugins under <STATE_DIR>/plugins/.runtime-imports/<plugin>/<timestamp>/root/.
# When STATE_DIR is /workspace/.tokagent, the staged plugin's bun import
# resolution walks up the tree and naturally hits /workspace/node_modules
# (the real workspace node_modules with @tokagentos/core symlinked). Without
# this, staging happens under $HOME (different subtree) and the walk-up
# never reaches /workspace/node_modules.
ENV TOKAGENT_STATE_DIR=/workspace/.tokagent
ENV TOKAGENT_DATA_DIR=/workspace/.tokagent

# The autonomous CLI's bin.ts is the same entry-point used in local dev.
# Running TS directly via `bun --bun` avoids needing a compiled dist; bun's
# loader is the canonical path tokagentos uses elsewhere.
CMD ["bun", "--bun", "packages/agent/src/bin.ts"]
