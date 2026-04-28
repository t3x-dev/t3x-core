# T3X Runner - Grey-box Agent Evaluation
#
# Build from repo root:
#   docker build -f apps/runner/Dockerfile -t t3x-runner .

FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and package files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tools/hooks/install-hooks.sh ./tools/hooks/install-hooks.sh
COPY packages/yops/package.json ./packages/yops/
COPY packages/yschema/package.json ./packages/yschema/
COPY packages/core/package.json ./packages/core/
COPY apps/runner/package.json ./apps/runner/

# Install dependencies (shamefully-hoist flattens deps for Docker compatibility)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source files
COPY packages/yops/ ./packages/yops/
COPY packages/yschema/ ./packages/yschema/
COPY packages/core/ ./packages/core/
COPY apps/runner/ ./apps/runner/

# Build all packages
RUN pnpm --filter @t3x-dev/yops build && \
    pnpm --filter @t3x-dev/yschema build && \
    pnpm --filter @t3x-dev/core build && \
    pnpm --filter @t3x-dev/runner build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 runner

# Copy everything from builder (simpler approach for monorepo)
# Note: We don't prune devDependencies because pnpm workspace links can break
COPY --from=builder /app ./

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8080

USER runner

WORKDIR /app/apps/runner
CMD ["node", "dist/server.js"]
