# T3X Core API (Node) - Docker image
#
# This image runs the Core API server implemented in `t3x-cli` (see `t3x-cli/src/serve.ts`).
#
# Build context: repo root (.)
#   docker build -f t3x-cli/Dockerfile -t t3x-core .

FROM node:20-slim AS builder

WORKDIR /app

# Native deps for better-sqlite3 (node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./
COPY t3x-core/package.json t3x-core/package.json
COPY t3x-core/sdk/javascript/package.json t3x-core/sdk/javascript/package.json
COPY t3x-cli/package.json t3x-cli/package.json
COPY t3x-runner/package.json t3x-runner/package.json
COPY t3x-webui/package.json t3x-webui/package.json
COPY agent-demo/package.json agent-demo/package.json

# Install only required workspaces (Core + Server)
RUN npm ci --include-workspace-root -w @t3x/core -w t3x-cli --no-audit --no-fund

# Copy sources needed to build
COPY t3x-core/src t3x-core/src
COPY t3x-core/tsconfig.json t3x-core/tsconfig.json
COPY t3x-cli/src t3x-cli/src
COPY t3x-cli/bin t3x-cli/bin
COPY t3x-cli/tsconfig.json t3x-cli/tsconfig.json

# Build
RUN npm run build -w @t3x/core && npm run build -w t3x-cli

# Runtime image
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    T3X_ROOT=/app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/t3x-core/dist ./t3x-core/dist
COPY --from=builder /app/t3x-core/package.json ./t3x-core/package.json
COPY --from=builder /app/t3x-cli/dist ./t3x-cli/dist
COPY --from=builder /app/t3x-cli/package.json ./t3x-cli/package.json

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8000

CMD ["node", "t3x-cli/dist/src/serve.js"]
