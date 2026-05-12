#!/bin/sh
set -e

echo "🔧 [entrypoint] ROSS API starting..."
echo "🔧 [entrypoint] NODE_ENV=${NODE_ENV}"
echo "🔧 [entrypoint] PORT=${PORT:-3001}"

# ── Apply pending Prisma migrations ──────────────────────────
# Controlled by RUN_MIGRATE_ON_STARTUP (default: true)
# `prisma migrate deploy` is safe for production:
# - only applies pending migrations (never creates new ones)
# - exits with non-zero on failure → container will not start
if [ "${RUN_MIGRATE_ON_STARTUP}" = "false" ]; then
  echo "⏭️  [entrypoint] Skipping Prisma migrate (RUN_MIGRATE_ON_STARTUP=false)"
else
  echo "🔧 [entrypoint] Running Prisma migrate deploy..."
  ./node_modules/.bin/prisma migrate deploy
  echo "✅ [entrypoint] Migrations applied."
fi

# ── Bootstrap initial admin user ─────────────────────────────
# Controlled by RUN_SEED_ON_STARTUP (default: true)
# Idempotent: skips if an admin user already exists.
# Configurable via SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
if [ "${RUN_SEED_ON_STARTUP}" = "false" ]; then
  echo "⏭️  [entrypoint] Skipping seed (RUN_SEED_ON_STARTUP=false)"
else
  echo "🔧 [entrypoint] Bootstrapping admin user..."
  node prisma/bootstrap-admin.mjs
  echo "✅ [entrypoint] Seed completed."
fi

echo "✅ [entrypoint] Ready. Starting application..."

# ── Hand off to CMD (node dist/main.js) ──────────────────────
exec "$@"
