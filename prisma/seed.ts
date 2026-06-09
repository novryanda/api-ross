import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import {
  OrgUnitStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client.js';

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ross_db?schema=public';
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Password123!';
const ALLOW_REMOTE_SEED = process.env.SEED_ALLOW_REMOTE === 'true';
const EXPECTED_DATABASE_NAME = process.env.SEED_EXPECT_DATABASE
  ?.trim()
  .toLowerCase();

const ids = {
  users: {
    admin: '00000000-0000-4000-8000-000000000001',
    byteWraith: '00000000-0000-4000-8000-000000000002',
    novaSyn: '00000000-0000-4000-8000-000000000003',
    sparkWave: '00000000-0000-4000-8000-000000000004',
    cipherQueen: '00000000-0000-4000-8000-000000000005',
    jordanLee: '00000000-0000-4000-8000-000000000006',
    viralVortex: '00000000-0000-4000-8000-000000000007',
    echoLaunch: '00000000-0000-4000-8000-000000000008',
    picAyu: '00000000-0000-4000-8000-000000000009',
    picDimas: '00000000-0000-4000-8000-000000000010',
  },
  orgUnits: {
    angkatanDarat: '25000000-0000-4000-8000-000000000001',
    adPenerangan: '25000000-0000-4000-8000-000000000002',
    adMediaSosial: '25000000-0000-4000-8000-000000000003',
    adVideo: '25000000-0000-4000-8000-000000000004',
  },
} as const;

const adapter = new PrismaPg(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
const prisma = new PrismaClient({ adapter });

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  picUnitId?: string | null;
};

function assertDevelopmentDatabase() {
  if (process.env.NODE_ENV === 'production' && !ALLOW_REMOTE_SEED) {
    throw new Error('Refusing to seed while NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const databaseName = url.pathname.replace(/^\//, '').toLowerCase();
  const forbiddenPattern = /(prod|production|live|staging)/i;

  if (ALLOW_REMOTE_SEED) {
    if (EXPECTED_DATABASE_NAME && databaseName !== EXPECTED_DATABASE_NAME) {
      throw new Error(
        `Remote seed allowed, but expected database "${EXPECTED_DATABASE_NAME}" and got "${databaseName}".`,
      );
    }

    console.warn(
      `[seed] Remote seed override enabled for ${url.hostname}/${databaseName}. Running in idempotent upsert mode.`,
    );
    return;
  }

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `Refusing to seed non-local database host "${url.hostname}".`,
    );
  }

  if (forbiddenPattern.test(databaseName) || forbiddenPattern.test(host)) {
    throw new Error(
      `Refusing to seed database that looks non-development: "${databaseName}".`,
    );
  }
}

async function upsertUser(user: SeedUser) {
  return prisma.user.upsert({
    where: { email: user.email.toLowerCase() },
    update: {
      name: user.name,
      role: user.role,
      status: user.status,
      picUnitId: user.picUnitId ?? null,
      emailVerified: true,
      deletedAt: null,
      banned: user.status !== UserStatus.ACTIVE,
      banReason:
        user.status === UserStatus.ACTIVE ? null : 'Seeded inactive user',
      banExpires: null,
    },
    create: {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      emailVerified: true,
      role: user.role,
      status: user.status,
      picUnitId: user.picUnitId ?? null,
      banned: user.status !== UserStatus.ACTIVE,
      banReason:
        user.status === UserStatus.ACTIVE ? null : 'Seeded inactive user',
    },
  });
}

async function upsertPasswordAccount(userId: string, passwordHash: string) {
  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: 'credential',
        accountId: userId,
      },
    },
    update: { userId, password: passwordHash },
    create: {
      userId,
      providerId: 'credential',
      accountId: userId,
      password: passwordHash,
    },
  });
}

async function seedAdmin() {
  return upsertUser({
    id: ids.users.admin,
    name: 'Reza Admin',
    email: 'admin@ross.local',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });
}

async function seedOrgUnits(adminId: string) {
  const rows = [
    {
      id: ids.orgUnits.angkatanDarat,
      name: 'Angkatan Darat',
      code: 'AD',
      status: OrgUnitStatus.ACTIVE,
      parentId: null,
    },
    {
      id: ids.orgUnits.adPenerangan,
      name: 'Penerangan Angkatan Darat',
      code: 'PENAD',
      status: OrgUnitStatus.ACTIVE,
      parentId: ids.orgUnits.angkatanDarat,
    },
    {
      id: ids.orgUnits.adMediaSosial,
      name: 'Media Sosial AD',
      code: 'MEDSOS-AD',
      status: OrgUnitStatus.ACTIVE,
      parentId: ids.orgUnits.adPenerangan,
    },
    {
      id: ids.orgUnits.adVideo,
      name: 'Produksi Video AD',
      code: 'VIDEO-AD',
      status: OrgUnitStatus.ACTIVE,
      parentId: ids.orgUnits.adPenerangan,
    },
  ];

  const units: Record<string, Awaited<ReturnType<typeof prisma.orgUnit.upsert>>> =
    {};

  for (const unit of rows) {
    units[unit.id] = await prisma.orgUnit.upsert({
      where: { id: unit.id },
      update: {
        name: unit.name,
        code: unit.code,
        status: unit.status,
        parentId: unit.parentId,
        createdById: adminId,
      },
      create: {
        ...unit,
        createdById: adminId,
      },
    });
  }

  return {
    angkatanDarat: units[ids.orgUnits.angkatanDarat],
    adPenerangan: units[ids.orgUnits.adPenerangan],
    adMediaSosial: units[ids.orgUnits.adMediaSosial],
    adVideo: units[ids.orgUnits.adVideo],
  };
}

async function seedUsers(passwordHash: string) {
  const userRows: SeedUser[] = [
    {
      id: ids.users.admin,
      name: 'Reza Admin',
      email: 'admin@ross.local',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.byteWraith,
      name: 'ByteWraith',
      email: 'bytewraith@ross.local',
      role: UserRole.BUZZER,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.novaSyn,
      name: 'NovaSyn',
      email: 'novasyn@ross.local',
      role: UserRole.BUZZER,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.sparkWave,
      name: 'SparkWave',
      email: 'sparkwave@ross.local',
      role: UserRole.BUZZER,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.cipherQueen,
      name: 'CipherQueen',
      email: 'cipherqueen@ross.local',
      role: UserRole.BUZZER,
      status: UserStatus.INACTIVE,
    },
    {
      id: ids.users.jordanLee,
      name: 'Jordan Lee',
      email: 'jordan.lee@ross.local',
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.viralVortex,
      name: 'ViralVortex',
      email: 'viralvortex@ross.local',
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
    },
    {
      id: ids.users.echoLaunch,
      name: 'EchoLaunch',
      email: 'echolaunch@ross.local',
      role: UserRole.VIEWER,
      status: UserStatus.INACTIVE,
    },
    {
      id: ids.users.picAyu,
      name: 'Ayu Penerangan',
      email: 'ayu.pic@ross.local',
      role: UserRole.PIC,
      status: UserStatus.ACTIVE,
      picUnitId: ids.orgUnits.adMediaSosial,
    },
    {
      id: ids.users.picDimas,
      name: 'Dimas Video',
      email: 'dimas.pic@ross.local',
      role: UserRole.PIC,
      status: UserStatus.ACTIVE,
      picUnitId: ids.orgUnits.adVideo,
    },
  ];

  const users = Object.fromEntries(
    await Promise.all(
      userRows.map(async (user) => [user.id, await upsertUser(user)] as const),
    ),
  );

  for (const user of Object.values(users)) {
    await upsertPasswordAccount(user.id, passwordHash);
  }

  return {
    admin: users[ids.users.admin],
    byteWraith: users[ids.users.byteWraith],
    novaSyn: users[ids.users.novaSyn],
    sparkWave: users[ids.users.sparkWave],
    cipherQueen: users[ids.users.cipherQueen],
    jordanLee: users[ids.users.jordanLee],
    viralVortex: users[ids.users.viralVortex],
    echoLaunch: users[ids.users.echoLaunch],
    picAyu: users[ids.users.picAyu],
    picDimas: users[ids.users.picDimas],
  };
}

async function countSeedData() {
  const [users, accounts, orgUnits] = await prisma.$transaction([
    prisma.user.count(),
    prisma.account.count(),
    prisma.orgUnit.count(),
  ]);

  return { users, accounts, orgUnits };
}

async function main() {
  assertDevelopmentDatabase();

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const admin = await seedAdmin();
  await seedOrgUnits(admin.id);
  const users = await seedUsers(passwordHash);
  const counts = await countSeedData();

  console.log('Seed completed.');
  console.table(counts);
  console.log('Demo credentials, password for all accounts:');
  console.log(`- admin: ${users.admin.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.byteWraith.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.novaSyn.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.sparkWave.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- pic: ${users.picAyu.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- pic: ${users.picDimas.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- viewer: ${users.jordanLee.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- viewer: ${users.viralVortex.email} / ${DEFAULT_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
