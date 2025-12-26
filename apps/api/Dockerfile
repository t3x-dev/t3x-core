# T3X API - Hono + Zod OpenAPI
#
# Build from repo root:
#   docker build -f apps/api/Dockerfile -t t3x-api .

FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and package files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
COPY apps/runner/package.json ./apps/runner/

# Install dependencies (shamefully-hoist flattens deps for Docker compatibility)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source files
COPY packages/core/ ./packages/core/
COPY packages/storage/ ./packages/storage/
COPY packages/types/ ./packages/types/
COPY apps/api/ ./apps/api/
COPY apps/runner/ ./apps/runner/

# Build all packages
RUN pnpm --filter @t3x/types build && \
    pnpm --filter @t3x/core build && \
    pnpm --filter @t3x/storage build && \
    pnpm --filter @t3x/runner build && \
    pnpm --filter @t3x/api build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

# Copy everything from builder (simpler approach for monorepo)
# Note: We don't prune devDependencies because pnpm workspace links can break
COPY --from=builder /app ./

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8000

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
