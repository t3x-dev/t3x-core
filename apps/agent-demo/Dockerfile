# Agent Demo - Summarize + Email
#
# Build:
#   docker build -t agent-demo .
#
# Run:
#   docker run -p 9000:9000 agent-demo

FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src/

RUN npm install
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV PORT=9000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:9000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 9000

CMD ["node", "dist/server.js"]
