# =========================================================
# Stage 1: Install production dependencies
# =========================================================
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Clean dependency installation for production
RUN npm ci --only=production

# =========================================================
# Stage 2: Minimal runtime image
# =========================================================
FROM node:18-alpine

WORKDIR /usr/src/app

# Set non-privileged user and production env
ENV NODE_ENV=production
USER node

# Copy dependencies and source files from builder stage
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 8080

# Health check to ensure microservice orchestration self-healing is triggered on network failures
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
