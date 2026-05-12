/**
 * bootstrap-admin.ts – Production-safe initial admin user creation.
 *
 * Creates exactly 1 admin user if it doesn't already exist.
 * Idempotent: safe to run multiple times, never creates duplicates.
 *
 * Required env:
 *   DATABASE_URL           – PostgreSQL connection string
 *   SEED_ADMIN_NAME        – Admin display name (default: "ROSS Admin")
 *   SEED_ADMIN_EMAIL       – Admin email (default: "admin@example.com")
 *   SEED_ADMIN_PASSWORD    – Admin password (default: "ChangeMe123!")
 *
 * Usage:
 *   npx tsx prisma/bootstrap-admin.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import {
  PrismaClient,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client.js';

// ── Config ──────────────────────────────────────────────────
const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ross_db?schema=public';

const ADMIN_NAME = process.env.SEED_ADMIN_NAME?.trim() || 'ROSS Admin';
const ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

// ── Prisma Client ───────────────────────────────────────────
const adapter = new PrismaPg(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
const prisma = new PrismaClient({ adapter });

// ── Bootstrap Logic ─────────────────────────────────────────
async function bootstrapAdmin() {
  console.log('🔧 [bootstrap] Checking for existing admin user...');
  console.log(`   Email: ${ADMIN_EMAIL}`);

  // 1. Check if any ADMIN user already exists
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: UserRole.ADMIN,
      deletedAt: null,
    },
    select: { id: true, email: true, name: true },
  });

  if (existingAdmin) {
    console.log(
      `✅ [bootstrap] Admin already exists: ${existingAdmin.email} (${existingAdmin.name})`,
    );
    console.log('   Skipping creation. No changes made.');
    return;
  }

  // 2. Check if the specific email already exists (could be non-admin)
  const existingUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, role: true },
  });

  if (existingUser) {
    // User exists but is not ADMIN – upgrade to ADMIN
    console.log(
      `⚠️  [bootstrap] User ${ADMIN_EMAIL} exists as ${existingUser.role}. Upgrading to ADMIN...`,
    );
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        banned: false,
        banReason: null,
        banExpires: null,
        deletedAt: null,
      },
    });
    console.log('✅ [bootstrap] User upgraded to ADMIN.');
    return;
  }

  // 3. Create new admin user + credential account
  console.log('🔧 [bootstrap] Creating new admin user...');

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const admin = await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      banned: false,
    },
  });

  // Create the Better Auth credential account (password login)
  await prisma.account.create({
    data: {
      userId: admin.id,
      providerId: 'credential',
      accountId: admin.id,
      password: passwordHash,
    },
  });

  console.log('✅ [bootstrap] Admin user created successfully!');
  console.log(`   Name:  ${ADMIN_NAME}`);
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Role:  ADMIN`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password after first login!');
}

// ── Entry Point ─────────────────────────────────────────────
bootstrapAdmin()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ [bootstrap] Failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
