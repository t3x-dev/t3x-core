# T3X WebUI - Next.js App
#
# Build from repo root:
#   docker build -f apps/web/Dockerfile -t t3x-webui .

FROM node:20-slim AS builder

WORKDIR /app

# Match the packageManager declared by the workspace.
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Copy workspace config and package files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tools/hooks/install-hooks.mjs ./tools/hooks/install-hooks.mjs
COPY tools/dev-package-runner.mjs ./tools/dev-package-runner.mjs
COPY tools/web-next-guard.mjs ./tools/web-next-guard.mjs
COPY tools/lib/sourceDevAuthDefaults.mjs ./tools/lib/sourceDevAuthDefaults.mjs
COPY packages/yops/package.json ./packages/yops/
COPY packages/yschema/package.json ./packages/yschema/
COPY packages/transition/package.json ./packages/transition/
COPY packages/core/package.json ./packages/core/
COPY packages/storage/package.json ./packages/storage/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/web/package.json ./apps/web/

# Install dependencies (shamefully-hoist flattens deps for Docker compatibility)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source files
COPY packages/yops/ ./packages/yops/
COPY packages/yschema/ ./packages/yschema/
COPY packages/transition/ ./packages/transition/
COPY packages/core/ ./packages/core/
COPY packages/storage/ ./packages/storage/
COPY packages/api-client/ ./packages/api-client/
COPY apps/web/ ./apps/web/

# Build dependencies first
RUN pnpm --filter @t3x-dev/yops build && \
    pnpm --filter @t3x-dev/yschema build && \
    pnpm --filter @t3x-dev/transition build && \
    pnpm --filter @t3x-dev/core build && \
    pnpm --filter @t3x-dev/storage build && \
    pnpm --filter @t3x-dev/api-client build

# Build webui
# NEXT_PUBLIC_* vars must be set at build time (inlined into JS bundle)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_RUNNER_ENABLED=true
ARG NEXT_PUBLIC_AUTH_DISABLED=false
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_RUNNER_ENABLED=$NEXT_PUBLIC_RUNNER_ENABLED
ENV NEXT_PUBLIC_AUTH_DISABLED=$NEXT_PUBLIC_AUTH_DISABLED
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
