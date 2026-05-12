import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import {
  AuditAction,
  BlastAttemptStatus,
  BlastSourceType,
  BlastTargetStatus,
  CampaignMemberRole,
  CampaignStatus,
  CommentCommandStatus,
  CommentStance,
  CommentTaskStatus,
  ExportFormat,
  ExportScope,
  ExportStatus,
  Platform,
  Prisma,
  PrismaClient,
  ReviewStatus,
  SocialAccountCategory,
  SocialAccountStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client.js';

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ross_db?schema=public';
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Password123!';

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
  },
  campaigns: {
    literacy: '10000000-0000-4000-8000-000000000001',
    transport: '10000000-0000-4000-8000-000000000002',
    umkm: '10000000-0000-4000-8000-000000000003',
    publicOpinion: '10000000-0000-4000-8000-000000000004',
  },
  socialAccounts: {
    mediaUpdate: '20000000-0000-4000-8000-000000000001',
    infoIndonesia: '20000000-0000-4000-8000-000000000002',
    newsPortal: '20000000-0000-4000-8000-000000000003',
    komunitasDigital: '20000000-0000-4000-8000-000000000004',
    viralKonten: '20000000-0000-4000-8000-000000000005',
  },
  blastTargets: {
    tiktokMediaUpdate: '30000000-0000-4000-8000-000000000001',
    instagramInfoAbc: '30000000-0000-4000-8000-000000000002',
    xNewsPortal999: '30000000-0000-4000-8000-000000000003',
    instagramInfoXyz: '30000000-0000-4000-8000-000000000004',
    facebookKomunitas: '30000000-0000-4000-8000-000000000005',
    xNewsPortal1000: '30000000-0000-4000-8000-000000000006',
  },
  blastAttempts: {
    tiktokCompleted: '40000000-0000-4000-8000-000000000001',
    tiktokAvailable: '40000000-0000-4000-8000-000000000002',
    instagramKept: '40000000-0000-4000-8000-000000000003',
    xCompleted: '40000000-0000-4000-8000-000000000004',
    instagramPausedAvailable: '40000000-0000-4000-8000-000000000005',
    facebookExpired: '40000000-0000-4000-8000-000000000006',
    xReleased: '40000000-0000-4000-8000-000000000007',
  },
  commentCommands: {
    proInstagram: '60000000-0000-4000-8000-000000000001',
    kontraTiktok: '60000000-0000-4000-8000-000000000002',
    proTwitter: '60000000-0000-4000-8000-000000000003',
  },
  commentTasks: {
    proIgKept: '70000000-0000-4000-8000-000000000001',
    proIgInProgress: '70000000-0000-4000-8000-000000000002',
    proIgCompleted: '70000000-0000-4000-8000-000000000003',
    proIgAvailable: '70000000-0000-4000-8000-000000000004',
    kontraCompletedByte: '70000000-0000-4000-8000-000000000005',
    kontraCompletedNova: '70000000-0000-4000-8000-000000000006',
    kontraExpiredSpark: '70000000-0000-4000-8000-000000000007',
    twitterAvailable: '70000000-0000-4000-8000-000000000008',
    twitterReleased: '70000000-0000-4000-8000-000000000009',
  },
  exports: {
    summaryProcessing: '80000000-0000-4000-8000-000000000001',
    commentFailed: '80000000-0000-4000-8000-000000000002',
    blastPending: '80000000-0000-4000-8000-000000000003',
  },
};

const adapter = new PrismaPg(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
const prisma = new PrismaClient({ adapter });

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

function assertDevelopmentDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed while NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const databaseName = url.pathname.replace(/^\//, '').toLowerCase();
  const forbiddenPattern = /(prod|production|live|staging)/i;

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
      id: user.id,
      name: user.name,
      role: user.role,
      status: user.status,
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

async function seedUsers() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
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
  };
}

async function seedCampaigns(users: Awaited<ReturnType<typeof seedUsers>>) {
  const campaignRows = [
    {
      id: ids.campaigns.literacy,
      name: 'Kampanye Literasi Digital Mei',
      description:
        'Koordinasi awareness multi-platform untuk edukasi literasi digital.',
      startDate: new Date('2026-04-28'),
      endDate: new Date('2026-05-25'),
      status: CampaignStatus.ACTIVE,
    },
    {
      id: ids.campaigns.transport,
      name: 'Monitoring Isu Transportasi Publik',
      description:
        'Pemantauan dan respons narasi terkait layanan transportasi publik.',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-22'),
      status: CampaignStatus.ACTIVE,
    },
    {
      id: ids.campaigns.umkm,
      name: 'Peluncuran Program UMKM Lokal',
      description: 'Rekap kampanye peluncuran program dukungan UMKM lokal.',
      startDate: new Date('2026-04-15'),
      endDate: new Date('2026-04-29'),
      status: CampaignStatus.COMPLETED,
    },
    {
      id: ids.campaigns.publicOpinion,
      name: 'Kajian Opini Ruang Publik',
      description: 'Draft kajian percakapan publik lintas platform.',
      startDate: new Date('2026-05-19'),
      endDate: new Date('2026-06-02'),
      status: CampaignStatus.DRAFT,
    },
  ];

  const campaigns = Object.fromEntries(
    await Promise.all(
      campaignRows.map(async (campaign) => [
        campaign.id,
        await prisma.campaign.upsert({
          where: { id: campaign.id },
          update: {
            ...campaign,
            createdById: users.admin.id,
            deletedAt: null,
          },
          create: {
            ...campaign,
            createdById: users.admin.id,
          },
        }),
      ]),
    ),
  );

  return {
    literacy: campaigns[ids.campaigns.literacy],
    transport: campaigns[ids.campaigns.transport],
    umkm: campaigns[ids.campaigns.umkm],
    publicOpinion: campaigns[ids.campaigns.publicOpinion],
  };
}

async function upsertCampaignMember(
  campaignId: string,
  userId: string,
  memberRole: CampaignMemberRole,
) {
  return prisma.campaignMember.upsert({
    where: {
      campaignId_userId: {
        campaignId,
        userId,
      },
    },
    update: { memberRole },
    create: {
      campaignId,
      userId,
      memberRole,
    },
  });
}

async function seedCampaignMembers(
  users: Awaited<ReturnType<typeof seedUsers>>,
  campaigns: Awaited<ReturnType<typeof seedCampaigns>>,
) {
  const rows = [
    [campaigns.literacy.id, users.admin.id, CampaignMemberRole.ADMIN],
    [campaigns.literacy.id, users.byteWraith.id, CampaignMemberRole.BUZZER],
    [campaigns.literacy.id, users.novaSyn.id, CampaignMemberRole.BUZZER],
    [campaigns.literacy.id, users.sparkWave.id, CampaignMemberRole.BUZZER],
    [campaigns.literacy.id, users.jordanLee.id, CampaignMemberRole.VIEWER],
    [campaigns.literacy.id, users.viralVortex.id, CampaignMemberRole.VIEWER],
    [campaigns.transport.id, users.admin.id, CampaignMemberRole.ADMIN],
    [campaigns.transport.id, users.byteWraith.id, CampaignMemberRole.BUZZER],
    [campaigns.transport.id, users.novaSyn.id, CampaignMemberRole.BUZZER],
    [campaigns.transport.id, users.jordanLee.id, CampaignMemberRole.VIEWER],
    [campaigns.umkm.id, users.admin.id, CampaignMemberRole.ADMIN],
    [campaigns.umkm.id, users.novaSyn.id, CampaignMemberRole.BUZZER],
    [campaigns.umkm.id, users.sparkWave.id, CampaignMemberRole.BUZZER],
    [campaigns.umkm.id, users.viralVortex.id, CampaignMemberRole.VIEWER],
    [campaigns.publicOpinion.id, users.admin.id, CampaignMemberRole.ADMIN],
    [
      campaigns.publicOpinion.id,
      users.byteWraith.id,
      CampaignMemberRole.BUZZER,
    ],
    [campaigns.publicOpinion.id, users.sparkWave.id, CampaignMemberRole.BUZZER],
    [campaigns.publicOpinion.id, users.jordanLee.id, CampaignMemberRole.VIEWER],
  ] as const;

  return Promise.all(
    rows.map(([campaignId, userId, role]) =>
      upsertCampaignMember(campaignId, userId, role),
    ),
  );
}

async function seedSocialAccounts(
  users: Awaited<ReturnType<typeof seedUsers>>,
) {
  const rows = [
    {
      id: ids.socialAccounts.mediaUpdate,
      platform: Platform.TIKTOK,
      username: 'mediaupdate.id',
      displayName: 'Media Update ID',
      profileUrl: 'https://www.tiktok.com/@mediaupdate.id',
      category: SocialAccountCategory.MEDIA,
      status: SocialAccountStatus.ACTIVE,
    },
    {
      id: ids.socialAccounts.infoIndonesia,
      platform: Platform.INSTAGRAM,
      username: 'infoindonesia_',
      displayName: 'Info Indonesia',
      profileUrl: 'https://www.instagram.com/infoindonesia_',
      category: SocialAccountCategory.MEDIA,
      status: SocialAccountStatus.ACTIVE,
    },
    {
      id: ids.socialAccounts.newsPortal,
      platform: Platform.X_TWITTER,
      username: 'newsportalid',
      displayName: 'News Portal ID',
      profileUrl: 'https://x.com/newsportalid',
      category: SocialAccountCategory.MEDIA,
      status: SocialAccountStatus.ACTIVE,
    },
    {
      id: ids.socialAccounts.komunitasDigital,
      platform: Platform.FACEBOOK,
      username: 'komunitasdigital',
      displayName: 'Komunitas Digital',
      profileUrl: 'https://facebook.com/komunitasdigital',
      category: SocialAccountCategory.COMMUNITY,
      status: SocialAccountStatus.ACTIVE,
    },
    {
      id: ids.socialAccounts.viralKonten,
      platform: Platform.TIKTOK,
      username: 'viralkonten_',
      displayName: 'Viral Konten',
      profileUrl: 'https://www.tiktok.com/@viralkonten_',
      category: SocialAccountCategory.KOL,
      status: SocialAccountStatus.INACTIVE,
    },
  ];

  const socialAccounts = Object.fromEntries(
    await Promise.all(
      rows.map(async (account) => [
        account.id,
        await prisma.socialAccount.upsert({
          where: { id: account.id },
          update: {
            ...account,
            createdById: users.admin.id,
            deletedAt: null,
          },
          create: {
            ...account,
            createdById: users.admin.id,
          },
        }),
      ]),
    ),
  );

  return {
    mediaUpdate: socialAccounts[ids.socialAccounts.mediaUpdate],
    infoIndonesia: socialAccounts[ids.socialAccounts.infoIndonesia],
    newsPortal: socialAccounts[ids.socialAccounts.newsPortal],
    komunitasDigital: socialAccounts[ids.socialAccounts.komunitasDigital],
    viralKonten: socialAccounts[ids.socialAccounts.viralKonten],
  };
}

async function seedBlast(
  users: Awaited<ReturnType<typeof seedUsers>>,
  campaigns: Awaited<ReturnType<typeof seedCampaigns>>,
  socialAccounts: Awaited<ReturnType<typeof seedSocialAccounts>>,
) {
  const targets = [
    {
      id: ids.blastTargets.tiktokMediaUpdate,
      socialAccountId: socialAccounts.mediaUpdate.id,
      postUrl: 'https://www.tiktok.com/@mediaupdate.id/video/111',
      platform: Platform.TIKTOK,
      instruction: 'Amplify video edukasi literasi digital.',
      status: BlastTargetStatus.ACTIVE,
    },
    {
      id: ids.blastTargets.instagramInfoAbc,
      socialAccountId: socialAccounts.infoIndonesia.id,
      postUrl: 'https://www.instagram.com/p/ABC123/',
      platform: Platform.INSTAGRAM,
      instruction: 'Dorong interaksi natural pada postingan utama.',
      status: BlastTargetStatus.ACTIVE,
    },
    {
      id: ids.blastTargets.xNewsPortal999,
      socialAccountId: socialAccounts.newsPortal.id,
      postUrl: 'https://x.com/newsportalid/status/9998887',
      platform: Platform.X_TWITTER,
      instruction: 'Repost thread literasi digital dengan komentar singkat.',
      status: BlastTargetStatus.ACTIVE,
    },
    {
      id: ids.blastTargets.instagramInfoXyz,
      socialAccountId: socialAccounts.infoIndonesia.id,
      postUrl: 'https://www.instagram.com/p/XYZ456/',
      platform: Platform.INSTAGRAM,
      instruction: 'Target paused untuk mengetes filter status.',
      status: BlastTargetStatus.PAUSED,
    },
    {
      id: ids.blastTargets.facebookKomunitas,
      socialAccountId: socialAccounts.komunitasDigital.id,
      postUrl: 'https://facebook.com/komunitasdigital/posts/20260510',
      platform: Platform.FACEBOOK,
      instruction: 'Distribusikan ke audiens komunitas digital.',
      status: BlastTargetStatus.ACTIVE,
    },
    {
      id: ids.blastTargets.xNewsPortal1000,
      socialAccountId: socialAccounts.newsPortal.id,
      postUrl: 'https://x.com/newsportalid/status/1000206051',
      platform: Platform.X_TWITTER,
      instruction: 'Target released untuk mengetes keep ulang.',
      status: BlastTargetStatus.ACTIVE,
    },
  ];

  for (const target of targets) {
    await prisma.blastTarget.upsert({
      where: { id: target.id },
      update: {
        ...target,
        campaignId: campaigns.literacy.id,
        submittedById: users.admin.id,
        sourceType: BlastSourceType.ADMIN_SUBMITTED,
        reviewStatus: ReviewStatus.APPROVED,
        deletedAt: null,
      },
      create: {
        ...target,
        campaignId: campaigns.literacy.id,
        submittedById: users.admin.id,
        sourceType: BlastSourceType.ADMIN_SUBMITTED,
        reviewStatus: ReviewStatus.APPROVED,
      },
    });
  }

  const attempts = [
    {
      id: ids.blastAttempts.tiktokCompleted,
      blastTargetId: ids.blastTargets.tiktokMediaUpdate,
      attemptNo: 1,
      status: BlastAttemptStatus.COMPLETED,
      keptById: users.sparkWave.id,
      keptAt: new Date('2026-05-10T10:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T12:00:00+07:00'),
      completedAt: new Date('2026-05-10T11:35:00+07:00'),
    },
    {
      id: ids.blastAttempts.tiktokAvailable,
      blastTargetId: ids.blastTargets.tiktokMediaUpdate,
      attemptNo: 2,
      status: BlastAttemptStatus.AVAILABLE,
      keptById: null,
      keptAt: null,
      keepExpiresAt: null,
      completedAt: null,
    },
    {
      id: ids.blastAttempts.instagramKept,
      blastTargetId: ids.blastTargets.instagramInfoAbc,
      attemptNo: 1,
      status: BlastAttemptStatus.KEPT,
      keptById: users.byteWraith.id,
      keptAt: new Date('2026-05-11T14:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-11T16:00:00+07:00'),
      completedAt: null,
    },
    {
      id: ids.blastAttempts.xCompleted,
      blastTargetId: ids.blastTargets.xNewsPortal999,
      attemptNo: 1,
      status: BlastAttemptStatus.COMPLETED,
      keptById: users.novaSyn.id,
      keptAt: new Date('2026-05-09T13:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-09T15:00:00+07:00'),
      completedAt: new Date('2026-05-09T14:20:00+07:00'),
    },
    {
      id: ids.blastAttempts.instagramPausedAvailable,
      blastTargetId: ids.blastTargets.instagramInfoXyz,
      attemptNo: 1,
      status: BlastAttemptStatus.AVAILABLE,
      keptById: null,
      keptAt: null,
      keepExpiresAt: null,
      completedAt: null,
    },
    {
      id: ids.blastAttempts.facebookExpired,
      blastTargetId: ids.blastTargets.facebookKomunitas,
      attemptNo: 1,
      status: BlastAttemptStatus.EXPIRED,
      keptById: users.byteWraith.id,
      keptAt: new Date('2026-05-10T08:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T10:00:00+07:00'),
      completedAt: null,
    },
    {
      id: ids.blastAttempts.xReleased,
      blastTargetId: ids.blastTargets.xNewsPortal1000,
      attemptNo: 1,
      status: BlastAttemptStatus.RELEASED,
      keptById: users.novaSyn.id,
      keptAt: new Date('2026-05-10T15:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T17:00:00+07:00'),
      completedAt: null,
    },
  ];

  for (const attempt of attempts) {
    await prisma.blastAttempt.upsert({
      where: { id: attempt.id },
      update: attempt,
      create: attempt,
    });
  }
}

async function seedComments(
  users: Awaited<ReturnType<typeof seedUsers>>,
  campaigns: Awaited<ReturnType<typeof seedCampaigns>>,
  socialAccounts: Awaited<ReturnType<typeof seedSocialAccounts>>,
) {
  const commands = [
    {
      id: ids.commentCommands.proInstagram,
      targetPostUrl: 'https://www.instagram.com/p/TARGET123/',
      platform: Platform.INSTAGRAM,
      socialAccountId: socialAccounts.infoIndonesia.id,
      stance: CommentStance.PRO,
      narrative:
        'Program ini sangat bermanfaat bagi masyarakat dan patut didukung penuh oleh semua pihak.',
      instruction: 'Gunakan bahasa natural, jangan copy-paste langsung.',
      requiredSlots: 4,
      keepExpiryMinutes: 120,
      deadline: new Date('2026-05-16T17:00:00+07:00'),
      status: CommentCommandStatus.ACTIVE,
    },
    {
      id: ids.commentCommands.kontraTiktok,
      targetPostUrl: 'https://www.tiktok.com/@targetaccount/video/555',
      platform: Platform.TIKTOK,
      socialAccountId: socialAccounts.mediaUpdate.id,
      stance: CommentStance.KONTRA,
      narrative:
        'Kebijakan ini perlu dikaji ulang karena berdampak negatif pada ekonomi masyarakat kecil.',
      instruction: 'Sampaikan dengan sopan dan faktual.',
      requiredSlots: 3,
      keepExpiryMinutes: 120,
      deadline: new Date('2026-05-13T17:00:00+07:00'),
      status: CommentCommandStatus.PAUSED,
    },
    {
      id: ids.commentCommands.proTwitter,
      targetPostUrl: 'https://x.com/newsportalid/status/1000206051',
      platform: Platform.X_TWITTER,
      socialAccountId: socialAccounts.newsPortal.id,
      stance: CommentStance.PRO,
      narrative:
        'Literasi digital perlu diperkuat agar masyarakat lebih aman menghadapi disinformasi.',
      instruction: null,
      requiredSlots: 2,
      keepExpiryMinutes: 120,
      deadline: new Date('2026-05-19T17:00:00+07:00'),
      status: CommentCommandStatus.ACTIVE,
    },
  ];

  for (const command of commands) {
    await prisma.commentCommand.upsert({
      where: { id: command.id },
      update: {
        ...command,
        campaignId: campaigns.literacy.id,
        createdById: users.admin.id,
        deletedAt: null,
      },
      create: {
        ...command,
        campaignId: campaigns.literacy.id,
        createdById: users.admin.id,
      },
    });
  }

  const tasks = [
    {
      id: ids.commentTasks.proIgKept,
      commentCommandId: ids.commentCommands.proInstagram,
      taskNo: 1,
      status: CommentTaskStatus.KEPT,
      keptById: users.byteWraith.id,
      keptAt: new Date('2026-05-11T14:05:00+07:00'),
      keepExpiresAt: new Date('2026-05-11T16:05:00+07:00'),
      completedAt: null,
      proofLink: null,
      notes: 'Seed kept task for ByteWraith.',
    },
    {
      id: ids.commentTasks.proIgInProgress,
      commentCommandId: ids.commentCommands.proInstagram,
      taskNo: 2,
      status: CommentTaskStatus.IN_PROGRESS,
      keptById: users.novaSyn.id,
      keptAt: new Date('2026-05-11T14:15:00+07:00'),
      keepExpiresAt: new Date('2026-05-11T16:15:00+07:00'),
      completedAt: null,
      proofLink: null,
      notes: 'Seed in-progress task for NovaSyn.',
    },
    {
      id: ids.commentTasks.proIgCompleted,
      commentCommandId: ids.commentCommands.proInstagram,
      taskNo: 3,
      status: CommentTaskStatus.COMPLETED,
      keptById: users.sparkWave.id,
      keptAt: new Date('2026-05-11T13:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-11T15:00:00+07:00'),
      completedAt: new Date('2026-05-11T14:10:00+07:00'),
      proofLink: 'https://example.com/proofs/comment-task-pro-ig-3',
      notes: 'Komentar natural sudah tayang.',
    },
    {
      id: ids.commentTasks.proIgAvailable,
      commentCommandId: ids.commentCommands.proInstagram,
      taskNo: 4,
      status: CommentTaskStatus.AVAILABLE,
      keptById: null,
      keptAt: null,
      keepExpiresAt: null,
      completedAt: null,
      proofLink: null,
      notes: null,
    },
    {
      id: ids.commentTasks.kontraCompletedByte,
      commentCommandId: ids.commentCommands.kontraTiktok,
      taskNo: 1,
      status: CommentTaskStatus.COMPLETED,
      keptById: users.byteWraith.id,
      keptAt: new Date('2026-05-10T09:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T11:00:00+07:00'),
      completedAt: new Date('2026-05-10T10:05:00+07:00'),
      proofLink: 'https://example.com/proofs/comment-task-kontra-tt-1',
      notes: 'Komentar faktual selesai.',
    },
    {
      id: ids.commentTasks.kontraCompletedNova,
      commentCommandId: ids.commentCommands.kontraTiktok,
      taskNo: 2,
      status: CommentTaskStatus.COMPLETED,
      keptById: users.novaSyn.id,
      keptAt: new Date('2026-05-10T09:20:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T11:20:00+07:00'),
      completedAt: new Date('2026-05-10T10:40:00+07:00'),
      proofLink: 'https://example.com/proofs/comment-task-kontra-tt-2',
      notes: 'Komentar sopan selesai.',
    },
    {
      id: ids.commentTasks.kontraExpiredSpark,
      commentCommandId: ids.commentCommands.kontraTiktok,
      taskNo: 3,
      status: CommentTaskStatus.EXPIRED,
      keptById: users.sparkWave.id,
      keptAt: new Date('2026-05-10T08:30:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T10:30:00+07:00'),
      completedAt: null,
      proofLink: null,
      notes: 'Keep window expired.',
    },
    {
      id: ids.commentTasks.twitterAvailable,
      commentCommandId: ids.commentCommands.proTwitter,
      taskNo: 1,
      status: CommentTaskStatus.AVAILABLE,
      keptById: null,
      keptAt: null,
      keepExpiresAt: null,
      completedAt: null,
      proofLink: null,
      notes: null,
    },
    {
      id: ids.commentTasks.twitterReleased,
      commentCommandId: ids.commentCommands.proTwitter,
      taskNo: 2,
      status: CommentTaskStatus.RELEASED,
      keptById: users.novaSyn.id,
      keptAt: new Date('2026-05-10T18:00:00+07:00'),
      keepExpiresAt: new Date('2026-05-10T20:00:00+07:00'),
      completedAt: null,
      proofLink: null,
      notes: 'Released by seed for queue testing.',
    },
  ];

  for (const task of tasks) {
    await prisma.commentTask.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }
}

async function seedExports(
  users: Awaited<ReturnType<typeof seedUsers>>,
  campaigns: Awaited<ReturnType<typeof seedCampaigns>>,
) {
  const rows = [
    {
      id: ids.exports.summaryProcessing,
      campaignId: campaigns.literacy.id,
      format: ExportFormat.EXCEL,
      scope: ExportScope.SUMMARY,
      requestedBy: users.admin.id,
      status: ExportStatus.PROCESSING,
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-11'),
      startedAt: new Date('2026-05-11T09:00:00+07:00'),
      completedAt: null,
      failedAt: null,
      errorMessage: null,
    },
    {
      id: ids.exports.commentFailed,
      campaignId: campaigns.literacy.id,
      format: ExportFormat.PDF,
      scope: ExportScope.COMMENT_TASKS,
      requestedBy: users.admin.id,
      status: ExportStatus.FAILED,
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-11'),
      startedAt: new Date('2026-05-11T08:00:00+07:00'),
      completedAt: null,
      failedAt: new Date('2026-05-11T08:02:00+07:00'),
      errorMessage: 'Snapshot data tidak lengkap.',
    },
    {
      id: ids.exports.blastPending,
      campaignId: campaigns.literacy.id,
      format: ExportFormat.EXCEL,
      scope: ExportScope.BLAST_REPORTS,
      requestedBy: users.admin.id,
      status: ExportStatus.PENDING,
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-11'),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null,
    },
  ];

  for (const row of rows) {
    await prisma.exportReport.upsert({
      where: { id: row.id },
      update: {
        ...row,
        fileName: null,
        filePath: null,
        fileUrl: null,
        fileSize: null,
        mimeType: null,
        retriedFromId: null,
      },
      create: {
        ...row,
        fileName: null,
        filePath: null,
        fileUrl: null,
        fileSize: null,
        mimeType: null,
        retriedFromId: null,
      },
    });
  }
}

type AuditSeed = {
  id: string;
  actorId: string;
  campaignId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  newValue?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

async function upsertAuditLog(audit: AuditSeed) {
  await prisma.auditLog.upsert({
    where: { id: audit.id },
    update: {
      actorId: audit.actorId,
      campaignId: audit.campaignId ?? null,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      oldValue: audit.oldValue ?? Prisma.JsonNull,
      newValue: audit.newValue ?? Prisma.JsonNull,
      ipAddress: '127.0.0.1',
      userAgent: 'ROSS seed',
    },
    create: {
      id: audit.id,
      actorId: audit.actorId,
      campaignId: audit.campaignId ?? null,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      oldValue: audit.oldValue ?? Prisma.JsonNull,
      newValue: audit.newValue ?? Prisma.JsonNull,
      ipAddress: '127.0.0.1',
      userAgent: 'ROSS seed',
    },
  });
}

async function seedAuditLogs(
  users: Awaited<ReturnType<typeof seedUsers>>,
  campaigns: Awaited<ReturnType<typeof seedCampaigns>>,
) {
  const logs: AuditSeed[] = [
    {
      id: '90000000-0000-4000-8000-000000000001',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.CAMPAIGN_CREATED,
      entityType: 'Campaign',
      entityId: campaigns.literacy.id,
      newValue: {
        name: campaigns.literacy.name,
        status: campaigns.literacy.status,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000002',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.CAMPAIGN_MEMBER_ADDED,
      entityType: 'CampaignMember',
      entityId: users.byteWraith.id,
      newValue: { memberRole: CampaignMemberRole.BUZZER },
    },
    {
      id: '90000000-0000-4000-8000-000000000003',
      actorId: users.admin.id,
      action: AuditAction.SOCIAL_ACCOUNT_CREATED,
      entityType: 'SocialAccount',
      entityId: ids.socialAccounts.mediaUpdate,
      newValue: { username: 'mediaupdate.id', platform: Platform.TIKTOK },
    },
    {
      id: '90000000-0000-4000-8000-000000000004',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.BLAST_TARGET_CREATED,
      entityType: 'BlastTarget',
      entityId: ids.blastTargets.tiktokMediaUpdate,
      newValue: { postUrl: 'https://www.tiktok.com/@mediaupdate.id/video/111' },
    },
    {
      id: '90000000-0000-4000-8000-000000000005',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.BLAST_ATTEMPT_CREATED,
      entityType: 'BlastAttempt',
      entityId: ids.blastAttempts.tiktokAvailable,
      newValue: { status: BlastAttemptStatus.AVAILABLE, attemptNo: 2 },
    },
    {
      id: '90000000-0000-4000-8000-000000000006',
      actorId: users.byteWraith.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.BLAST_ATTEMPT_KEPT,
      entityType: 'BlastAttempt',
      entityId: ids.blastAttempts.instagramKept,
      newValue: {
        status: BlastAttemptStatus.KEPT,
        keptById: users.byteWraith.id,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000007',
      actorId: users.novaSyn.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.BLAST_ATTEMPT_RELEASED,
      entityType: 'BlastAttempt',
      entityId: ids.blastAttempts.xReleased,
      newValue: {
        status: BlastAttemptStatus.RELEASED,
        keptById: users.novaSyn.id,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000008',
      actorId: users.byteWraith.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.BLAST_ATTEMPT_EXPIRED,
      entityType: 'BlastAttempt',
      entityId: ids.blastAttempts.facebookExpired,
      newValue: {
        status: BlastAttemptStatus.EXPIRED,
        keptById: users.byteWraith.id,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000009',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.COMMENT_COMMAND_CREATED,
      entityType: 'CommentCommand',
      entityId: ids.commentCommands.proInstagram,
      newValue: { stance: CommentStance.PRO, requiredSlots: 4 },
    },
    {
      id: '90000000-0000-4000-8000-000000000010',
      actorId: users.byteWraith.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.COMMENT_TASK_KEPT,
      entityType: 'CommentTask',
      entityId: ids.commentTasks.proIgKept,
      newValue: {
        status: CommentTaskStatus.KEPT,
        keptById: users.byteWraith.id,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000011',
      actorId: users.novaSyn.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.COMMENT_TASK_STARTED,
      entityType: 'CommentTask',
      entityId: ids.commentTasks.proIgInProgress,
      newValue: {
        status: CommentTaskStatus.IN_PROGRESS,
        keptById: users.novaSyn.id,
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000012',
      actorId: users.sparkWave.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.COMMENT_TASK_COMPLETED,
      entityType: 'CommentTask',
      entityId: ids.commentTasks.proIgCompleted,
      newValue: { status: CommentTaskStatus.COMPLETED },
    },
    {
      id: '90000000-0000-4000-8000-000000000013',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.EXPORT_REQUESTED,
      entityType: 'ExportReport',
      entityId: ids.exports.summaryProcessing,
      newValue: { status: ExportStatus.PROCESSING, scope: ExportScope.SUMMARY },
    },
    {
      id: '90000000-0000-4000-8000-000000000014',
      actorId: users.admin.id,
      campaignId: campaigns.literacy.id,
      action: AuditAction.EXPORT_FAILED,
      entityType: 'ExportReport',
      entityId: ids.exports.commentFailed,
      newValue: {
        status: ExportStatus.FAILED,
        errorMessage: 'Snapshot data tidak lengkap.',
      },
    },
  ];

  for (const log of logs) {
    await upsertAuditLog(log);
  }
}

async function countSeedData() {
  const [
    users,
    campaigns,
    campaignMembers,
    socialAccounts,
    blastTargets,
    blastAttempts,
    blastReports,
    commentCommands,
    commentTasks,
    auditLogs,
    exports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.campaign.count(),
    prisma.campaignMember.count(),
    prisma.socialAccount.count(),
    prisma.blastTarget.count(),
    prisma.blastAttempt.count(),
    prisma.blastReport.count(),
    prisma.commentCommand.count(),
    prisma.commentTask.count(),
    prisma.auditLog.count(),
    prisma.exportReport.count(),
  ]);

  return {
    users,
    campaigns,
    campaignMembers,
    socialAccounts,
    blastTargets,
    blastAttempts,
    blastReports,
    commentCommands,
    commentTasks,
    auditLogs,
    exports,
  };
}

async function main() {
  assertDevelopmentDatabase();

  const users = await seedUsers();
  const campaigns = await seedCampaigns(users);
  await seedCampaignMembers(users, campaigns);
  const socialAccounts = await seedSocialAccounts(users);
  await seedBlast(users, campaigns, socialAccounts);
  await seedComments(users, campaigns, socialAccounts);
  await seedExports(users, campaigns);
  await seedAuditLogs(users, campaigns);

  const counts = await countSeedData();

  console.log('Seed completed.');
  console.table(counts);
  console.log('Demo credentials, password for all accounts:');
  console.log(`- admin: ${users.admin.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.byteWraith.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.novaSyn.email} / ${DEFAULT_PASSWORD}`);
  console.log(`- buzzer: ${users.sparkWave.email} / ${DEFAULT_PASSWORD}`);
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
