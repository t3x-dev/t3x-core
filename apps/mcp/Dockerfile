FROM node:22-slim AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tools/hooks/install-hooks.mjs ./tools/hooks/
COPY packages/ ./packages/
COPY apps/mcp/ ./apps/mcp/
COPY apps/runner/ ./apps/runner/

RUN pnpm install --frozen-lockfile
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm exec turbo run build --filter=@t3x-dev/mcp
RUN rm -rf .turbo node_modules apps/*/node_modules packages/*/node_modules && \
    pnpm install --prod --offline --frozen-lockfile

FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    T3X_TRANSPORT=http \
    T3X_MCP_BACKEND=api \
    HOST=0.0.0.0 \
    PORT=3001

COPY --from=builder /app ./
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => { if (!r.ok) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })"

USER node
CMD ["node", "apps/mcp/dist/index.js"]
