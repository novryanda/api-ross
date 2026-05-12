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
npx prisma migrate deploy

echo "✅ [entrypoint] Migrations applied. Starting application..."

# ── Hand off to CMD (node dist/main.js) ──────────────────────
exec "$@"
