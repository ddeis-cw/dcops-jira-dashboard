# ── Build stage: install deps + compile frontend ──────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY build.js      ./
# Install all deps (esbuild is a devDependency needed for the build step)
RUN npm install --no-audit --no-fund
# Compile frontend JSX → bundle.js
COPY public/ ./public/
RUN node build.js

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy dependencies and source
# Copy only production node_modules
COPY --from=deps /app/node_modules ./node_modules
# Copy built frontend bundle
COPY --from=deps /app/public/bundle.js ./public/bundle.js
COPY package*.json ./
COPY src/           ./src/
COPY migrations/    ./migrations/
COPY public/        ./public/

# Data directory — mount as volume to persist SQLite DB across rebuilds
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--max-old-space-size=4096", "src/server.js"]
