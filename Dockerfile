# ============================================================
# ROSS/BuzzTrack Backend – Production Dockerfile
# Multi-stage build: deps → builder → runner
# ============================================================

# ── Base ─────────────────────────────────────────────────────
FROM node:22-slim AS base

# Prisma needs openssl at generate-time and at runtime
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends openssl ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────
FROM base AS deps

# Copy lockfile + package manifest first (better layer caching)
COPY package.json package-lock.json ./

# Install ALL deps (dev included – needed for nest build + prisma generate)
RUN npm ci

# ── Builder ──────────────────────────────────────────────────
FROM deps AS builder

# Copy Prisma schema + config (needed for prisma generate)
COPY prisma ./prisma
COPY prisma.config.ts ./

# Dummy DATABASE_URL for build-time only – prisma generate needs the config
# to load but does NOT connect to the database. The real URL is injected at
# runtime via Dokploy environment variables.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# Generate Prisma Client targeting the runtime platform
RUN npx prisma generate

# Copy full source
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Build NestJS
RUN npm run build

# ── Runner ───────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user with home directory (npm cache needs ~/.npm)
RUN groupadd --system --gid 1001 ross && \
    useradd --system --uid 1001 --gid ross --create-home ross

WORKDIR /app

# Copy package manifest (needed by Node resolution)
COPY --from=builder /app/package.json /app/package-lock.json ./

# Install production-only deps
RUN npm ci --omit=dev

# Install runtime tools needed by entrypoint (migrate deploy + bootstrap)
# These are devDeps but required at container startup
RUN npm install --no-save prisma tsx

# Copy Prisma schema + config (needed for runtime migrations)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Copy generated Prisma Client from builder
COPY --from=builder /app/src/generated ./src/generated

# Copy compiled NestJS app
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create storage directory for local exports
RUN mkdir -p /app/storage/exports && chown -R ross:ross /app/storage

# Ensure ross owns the app directory (for npm cache + node_modules access)
RUN chown -R ross:ross /app

# Switch to non-root
USER ross

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
