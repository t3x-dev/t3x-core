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
COPY packages/core/package.json ./packages/core/
COPY apps/runner/package.json ./apps/runner/

# Install dependencies (shamefully-hoist flattens deps for Docker compatibility)
# Use China npm mirror for faster downloads
RUN pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile --shamefully-hoist

# Copy source files
COPY packages/core/ ./packages/core/
COPY apps/runner/ ./apps/runner/

# Build all packages
RUN pnpm --filter @t3x/core build && \
    pnpm --filter @t3x/runner build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy everything from builder (simpler approach for monorepo)
# Note: We don't prune devDependencies because pnpm workspace links can break
COPY --from=builder /app ./

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8080

WORKDIR /app/apps/runner
CMD ["node", "dist/server.js"]
