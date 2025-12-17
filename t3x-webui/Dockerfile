# T3X WebUI - Canvas Visualization
#
# Build:
#   docker build -t t3x-webui .
#
# Run:
#   docker run -p 3000:3000 t3x-webui

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Vite envs are build-time injected into static assets
ARG VITE_CORE_API_URL=http://localhost:8000
ARG VITE_RUNNER_API_URL=http://localhost:8080
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_RUNNER_API_URL=$VITE_RUNNER_API_URL

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build for production
RUN npm run build

# Production stage - serve with lightweight static server
FROM node:20-slim

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built files
COPY --from=builder /app/dist ./dist

ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1))"

EXPOSE 3000

# Serve static files
CMD ["serve", "-s", "dist", "-l", "3000"]
