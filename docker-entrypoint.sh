#!/bin/sh
set -e

echo "🔧 [entrypoint] ROSS API starting..."
echo "🔧 [entrypoint] NODE_ENV=${NODE_ENV}"
echo "🔧 [entrypoint] PORT=${PORT:-3001}"

# ── Apply pending Prisma migrations ──────────────────────────
# `prisma migrate deploy` is safe for production:
# - only applies pending migrations (never creates new ones)
# - exits with non-zero on failure → container will not start
echo "🔧 [entrypoint] Running Prisma migrate deploy..."
./node_modules/.bin/prisma migrate deploy

# ── Bootstrap initial admin user ─────────────────────────────
# Idempotent: skips if an admin user already exists.
# Configurable via SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
echo "🔧 [entrypoint] Bootstrapping admin user..."
./node_modules/.bin/tsx prisma/bootstrap-admin.ts

echo "✅ [entrypoint] Ready. Starting application..."

# ── Hand off to CMD (node dist/main.js) ──────────────────────
exec "$@"
