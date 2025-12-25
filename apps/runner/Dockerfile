# T3X Runner - Grey-box Agent Evaluation
#
# Build context: repo root (.)
#   docker build -f t3x-runner/Dockerfile -t t3x-runner .

FROM node:20-slim AS builder

WORKDIR /app

# Native deps for better-sqlite3 (workspace dep via @t3x/core)
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

# Install only required workspaces (Core + Runner)
RUN npm ci --include-workspace-root -w @t3x/core -w @t3x/runner --no-audit --no-fund

# Copy sources needed to build
COPY t3x-core/src t3x-core/src
COPY t3x-core/tsconfig.json t3x-core/tsconfig.json
COPY t3x-runner/src t3x-runner/src
COPY t3x-runner/schemas t3x-runner/schemas
COPY t3x-runner/scripts t3x-runner/scripts
COPY t3x-runner/tsconfig.json t3x-runner/tsconfig.json

# Build
RUN npm run build -w @t3x/core && npm run build -w @t3x/runner

# Production image
FROM node:20-slim AS runner

WORKDIR /app

# Copy runtime deps + built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/t3x-core/dist ./t3x-core/dist
COPY --from=builder /app/t3x-core/package.json ./t3x-core/package.json
COPY --from=builder /app/t3x-runner/dist ./t3x-runner/dist
COPY --from=builder /app/t3x-runner/package.json ./t3x-runner/package.json
# npm workspaces may install some deps under workspace-level node_modules (e.g. zod)
COPY --from=builder /app/t3x-runner/node_modules ./t3x-runner/node_modules

# Environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8080

WORKDIR /app/t3x-runner
CMD ["node", "dist/server.js"]
