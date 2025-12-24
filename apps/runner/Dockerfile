# T3X Runner - Grey-box Agent Evaluation
#
# Build:
#   docker build -t t3x-runner .
#
# Run:
#   docker run -p 8080:8080 t3x-runner

FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY tsconfig.json ./

# Copy t3x-core (dependency)
COPY ../t3x-core/package*.json ./t3x-core/
COPY ../t3x-core/src ./t3x-core/src/
COPY ../t3x-core/tsconfig.json ./t3x-core/

# Copy runner source
COPY src ./src/

# Install dependencies and build
RUN npm install
RUN npm run build

# Production image
FROM node:20-slim AS runner

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 8080

CMD ["node", "dist/server.js"]
