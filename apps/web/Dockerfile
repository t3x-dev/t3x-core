# T3X WebUI - Next.js App
#
# Build from repo root:
#   docker build -f apps/web/Dockerfile -t t3x-webui .

FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and package files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/storage/package.json ./packages/storage/
COPY apps/web/package.json ./apps/web/

# Install dependencies (shamefully-hoist flattens deps for Docker compatibility)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source files
COPY packages/core/ ./packages/core/
COPY packages/storage/ ./packages/storage/
COPY apps/web/ ./apps/web/

# Build dependencies first
RUN pnpm --filter @t3x/core build && \
    pnpm --filter @t3x/storage build

# Build webui
# NEXT_PUBLIC_* vars must be set at build time (inlined into JS bundle)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_RUNNER_ENABLED=true
ENV NEXT_PUBLIC_RUNNER_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=http://localhost:8000
RUN pnpm --filter t3x-webui build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets (Next.js standalone output)
# Note: standalone output preserves monorepo structure, so server.js is at apps/web/server.js
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

# Use 0.0.0.0 instead of localhost because Docker may set HOSTNAME env var
# which causes Next.js to bind to container hostname instead of all interfaces
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://0.0.0.0:3000').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["node", "server.js"]
