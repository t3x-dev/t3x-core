# T3X WebUI - Next.js App
#
# Build from repo root:
#   docker build -f t3x-webui/Dockerfile -t t3x-webui .
#
# Run:
#   docker run -p 3000:3000 t3x-webui

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace package files
COPY package*.json ./
COPY t3x-core/package*.json ./t3x-core/
COPY t3x-storage/package*.json ./t3x-storage/
COPY t3x-webui/package*.json ./t3x-webui/

# Install all dependencies
RUN npm install --workspace=t3x-webui

# Copy source files
COPY t3x-core/ ./t3x-core/
COPY t3x-storage/ ./t3x-storage/
COPY t3x-webui/ ./t3x-webui/

# Build dependencies first
RUN npm run build --workspace=t3x-core
RUN npm run build --workspace=t3x-storage

# Build webui
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=t3x-webui

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/t3x-webui/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/t3x-webui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/t3x-webui/.next/static ./.next/static

USER nextjs

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 3000

CMD ["node", "server.js"]
