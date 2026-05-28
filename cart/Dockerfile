# =========================================================
# Stage 1: Install production dependencies
# =========================================================
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

# =========================================================
# Stage 2: Hardened runtime environment
# =========================================================
FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production
USER node

COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 8002

# Health check to monitor Redis connectivity status and socket active flags
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8002/health || exit 1

CMD ["node", "server.js"]
