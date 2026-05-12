import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Build-time fallback: `prisma generate` only needs the schema, not a real
// database connection. At runtime (migrate deploy / app start) the real
// DATABASE_URL is always injected via Dokploy / docker-compose env.
const FALLBACK_URL = 'postgresql://build:build@localhost:5432/build?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL || FALLBACK_URL,
  },
});
