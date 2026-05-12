import { jest } from '@jest/globals';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { ExportsService } from './exports.service.js';
import { LocalFileStore } from './stores/local-file-store.js';
import { R2FileStore } from './stores/r2-file-store.js';
import {
  AuditAction,
  ExportFormat,
  ExportScope,
  ExportStatus,
  UserRole,
} from '../generated/prisma/client.js';
import type { LoadSnapshotArgs } from './generators/snapshot-loader.js';
import type { ExportSnapshot } from './generators/snapshot.js';

const admin = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  status: 'ACTIVE',
};

const viewer = {
  id: '44444444-4444-4444-4444-444444444444',
  name: 'Viewer',
  email: 'viewer@example.com',
  role: UserRole.VIEWER,
  status: 'ACTIVE',
};

const campaignId = '22222222-2222-2222-2222-222222222222';

function buildSnapshot(scope: ExportScope): ExportSnapshot {
  return {
    meta: {
      scope,
      format: ExportFormat.PDF,
      dateFrom: null,
      dateTo: null,
      generatedAt: new Date('2026-05-11T00:00:00.000Z'),
      requestedBy: { id: admin.id, name: admin.name, email: admin.email },
    },
    campaign: {
      id: campaignId,
      name: 'Campaign',
      description: null,
      status: 'ACTIVE',
      startDate: new Date('2026-05-01'),
      endDate: null,
      memberCount: 1,
      platforms: [],
    },
    summary: {
      totalBlastTargets: 0,
      totalAttempts: 0,
      completedAttempts: 0,
      availableAttempts: 0,
      keptAttempts: 0,
      expiredAttempts: 0,
      totalBlastReports: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalReposts: 0,
      totalEngagement: 0,
      commentCommandsCount: 0,
      totalCommentTasks: 0,
      availableCommentTasks: 0,
      keptCommentTasks: 0,
      inProgressCommentTasks: 0,
      totalCompletedCommentTasks: 0,
      expiredCommentTasks: 0,
    },
    platformBreakdown: [],
    topBuzzers: [],
    blastReports: [],
    commentTasks: [],
  };
}

function stubCompletedExport(id: string, format: ExportFormat) {
  return {
    id,
    campaignId,
    format,
    scope: ExportScope.FULL,
    requestedBy: admin.id,
    status: ExportStatus.COMPLETED,
    dateFrom: null,
    dateTo: null,
    fileName: `export_${campaignId}_x.${format === 'PDF' ? 'pdf' : 'xlsx'}`,
    filePath: `/tmp/${id}.${format === 'PDF' ? 'pdf' : 'xlsx'}`,
    fileUrl: `/api/v1/exports/${id}/download`,
    fileSize: 100,
    mimeType: format === 'PDF' ? 'application/pdf' : 'xlsx-mime',
    errorMessage: null,
    retriedFromId: null,
    startedAt: new Date(),
    completedAt: new Date(),
    failedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    campaign: {
      id: campaignId,
      name: 'Campaign',
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: null,
      deletedAt: null,
    },
    requester: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: UserRole.ADMIN,
    },
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  const prisma = {
    campaign: {
      findFirst: jest.fn().mockResolvedValue({ id: campaignId }),
    },
    exportReport: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    campaignMember: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callbackOrOps) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(prisma);
      }
      return Promise.all(callbackOrOps);
    }),
  };
  Object.assign(prisma, overrides);
  return prisma;
}

describe('ExportsService', () => {
  const originalEnv = { ...process.env };
  let writeObjectSpy: jest.SpiedFunction<any>;
  let ensureReadySpy: jest.SpiedFunction<any>;
  let statSpy: jest.SpiedFunction<any>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      EXPORT_STORAGE_DRIVER: 'local',
      R2_ENABLED: 'false',
    };
    writeObjectSpy = jest
      .spyOn(LocalFileStore.prototype, 'writeObject')
      .mockResolvedValue({
        key: '/tmp/file.bin',
        size: 12345,
        contentType: 'application/pdf',
      });
    ensureReadySpy = jest
      .spyOn(LocalFileStore.prototype, 'ensureReady')
      .mockResolvedValue(undefined);
    statSpy = jest
      .spyOn(LocalFileStore.prototype, 'stat')
      .mockResolvedValue({ size: 12345 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('rejects dateFrom > dateTo', async () => {
    const prisma = buildPrismaStub();
    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );

    await expect(
      service.create(admin as never, campaignId, {
        format: ExportFormat.PDF,
        dateFrom: '2026-05-31',
        dateTo: '2026-05-01',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });

  it('creates a COMPLETED export with EXPORT_REQUESTED + EXPORT_COMPLETED audits on the happy path', async () => {
    const prisma = buildPrismaStub();
    const pending = {
      ...stubCompletedExport('exp-1', ExportFormat.PDF),
      status: ExportStatus.PENDING,
      completedAt: null,
      filePath: null,
      fileSize: null,
      fileUrl: null,
      fileName: null,
      mimeType: null,
    };
    prisma.exportReport.create.mockResolvedValue(pending);
    prisma.exportReport.update
      .mockResolvedValueOnce({ ...pending, status: ExportStatus.PROCESSING })
      .mockResolvedValueOnce(stubCompletedExport('exp-1', ExportFormat.PDF));

    const loader = {
      load: jest.fn().mockResolvedValue(buildSnapshot(ExportScope.FULL)),
    };
    const service = new ExportsService(prisma as never, loader as never);

    const result = await service.create(admin as never, campaignId, {
      format: ExportFormat.PDF,
    });

    expect(result.status).toBe(ExportStatus.COMPLETED);
    expect(loader.load).toHaveBeenCalledWith(
      expect.objectContaining<LoadSnapshotArgs>({
        campaignId,
        scope: ExportScope.FULL,
        format: ExportFormat.PDF,
        dateFrom: null,
        dateTo: null,
        requestedBy: expect.objectContaining({ id: admin.id }),
      }),
    );
    expect(ensureReadySpy).toHaveBeenCalled();
    expect(writeObjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^ross_campaign_full_pdf_\d{8}_\d{6}\.pdf$/),
        contentType: 'application/pdf',
      }),
    );

    const auditActions = prisma.auditLog.create.mock.calls.map(
      (call: any[]) => call[0].data.action,
    );
    expect(auditActions).toEqual([
      AuditAction.EXPORT_REQUESTED,
      AuditAction.EXPORT_COMPLETED,
    ]);
  });

  it('marks export FAILED and writes EXPORT_FAILED when rendering throws', async () => {
    const prisma = buildPrismaStub();
    const pending = stubCompletedExport('exp-2', ExportFormat.EXCEL);
    prisma.exportReport.create.mockResolvedValue(pending);
    prisma.exportReport.update
      .mockResolvedValueOnce({ ...pending, status: ExportStatus.PROCESSING })
      .mockResolvedValueOnce({
        ...pending,
        status: ExportStatus.FAILED,
        errorMessage: 'boom',
        failedAt: new Date(),
      });

    const loader = {
      load: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const service = new ExportsService(prisma as never, loader as never);

    const result = await service.create(admin as never, campaignId, {
      format: ExportFormat.EXCEL,
      scope: ExportScope.BLAST_REPORTS,
    });

    expect(result.status).toBe(ExportStatus.FAILED);
    const actions = prisma.auditLog.create.mock.calls.map(
      (call: any[]) => call[0].data.action,
    );
    expect(actions).toEqual([
      AuditAction.EXPORT_REQUESTED,
      AuditAction.EXPORT_FAILED,
    ]);
  });

  it('rejects retry when source is not FAILED', async () => {
    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue(
      stubCompletedExport('exp-3', ExportFormat.PDF),
    );
    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );

    await expect(service.retry(admin as never, 'exp-3')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EXPORT_RETRY_NOT_ALLOWED',
      }),
    });
  });

  it('retry creates a new record and writes EXPORT_RETRIED', async () => {
    const prisma = buildPrismaStub();
    const failed = {
      ...stubCompletedExport('exp-failed', ExportFormat.PDF),
      status: ExportStatus.FAILED,
      errorMessage: 'prev error',
      failedAt: new Date(),
      completedAt: null,
      fileUrl: null,
    };
    prisma.exportReport.findUnique.mockResolvedValue(failed);
    prisma.exportReport.create.mockResolvedValue({
      ...failed,
      id: 'exp-retry',
      retriedFromId: 'exp-failed',
      status: ExportStatus.PENDING,
    });
    prisma.exportReport.update
      .mockResolvedValueOnce({
        ...failed,
        id: 'exp-retry',
        status: ExportStatus.PROCESSING,
      })
      .mockResolvedValueOnce({
        ...stubCompletedExport('exp-retry', ExportFormat.PDF),
        retriedFromId: 'exp-failed',
      });

    const loader = {
      load: jest.fn().mockResolvedValue(buildSnapshot(ExportScope.FULL)),
    };
    const service = new ExportsService(prisma as never, loader as never);

    const result = await service.retry(admin as never, 'exp-failed');

    expect(result.retriedFromId).toBe('exp-failed');
    const actions = prisma.auditLog.create.mock.calls.map(
      (call: any[]) => call[0].data.action,
    );
    expect(actions).toEqual([
      AuditAction.EXPORT_REQUESTED,
      AuditAction.EXPORT_RETRIED,
      AuditAction.EXPORT_COMPLETED,
    ]);
  });

  it('openForDownload returns 409 EXPORT_NOT_READY when status != COMPLETED for admin', async () => {
    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue({
      ...stubCompletedExport('exp-np', ExportFormat.PDF),
      status: ExportStatus.PROCESSING,
    });
    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );
    await expect(
      service.openForDownload(admin as never, 'exp-np'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXPORT_NOT_READY' }),
    });
  });

  it('openForDownload refuses VIEWER without campaign membership', async () => {
    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue(
      stubCompletedExport('exp-v', ExportFormat.PDF),
    );
    prisma.campaignMember.findUnique.mockResolvedValue(null);
    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );
    await expect(
      service.openForDownload(viewer as never, 'exp-v'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
  });

  it('openForDownload streams from local fallback and writes EXPORT_DOWNLOADED', async () => {
    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue(
      stubCompletedExport('exp-local', ExportFormat.PDF),
    );
    jest.spyOn(LocalFileStore.prototype, 'exists').mockResolvedValue(true);
    jest
      .spyOn(LocalFileStore.prototype, 'getDownloadStream')
      .mockResolvedValue(Readable.from(['pdf']));

    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );

    const result = await service.openForDownload(admin as never, 'exp-local');

    expect(result.fileName).toContain('export_');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.fileSize).toBe(100);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.EXPORT_DOWNLOADED,
        }),
      }),
    );
  });

  it('creates a COMPLETED export with R2 object key when R2 driver is enabled', async () => {
    process.env = {
      ...originalEnv,
      EXPORT_STORAGE_DRIVER: 'r2',
      R2_ENABLED: 'true',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_BUCKET: 'ross-project',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key',
      R2_FORCE_PATH_STYLE: 'true',
      R2_PUBLIC_BASE_URL: '',
    };

    const sentCommands: unknown[] = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      sentCommands.push(command);
      if (command.constructor.name === 'HeadObjectCommand') {
        return Promise.resolve({
          ContentLength: 12345,
          ContentType: 'application/pdf',
        }) as never;
      }
      return Promise.resolve({}) as never;
    });

    const prisma = buildPrismaStub();
    const pending = {
      ...stubCompletedExport(
        '33333333-3333-3333-3333-333333333333',
        ExportFormat.PDF,
      ),
      status: ExportStatus.PENDING,
      completedAt: null,
      filePath: null,
      fileSize: null,
      fileUrl: null,
      fileName: null,
      mimeType: null,
    };
    prisma.exportReport.create.mockResolvedValue(pending);
    prisma.exportReport.update
      .mockResolvedValueOnce({ ...pending, status: ExportStatus.PROCESSING })
      .mockImplementationOnce((args: any) =>
        Promise.resolve({
          ...stubCompletedExport(pending.id, ExportFormat.PDF),
          ...args.data,
        }),
      );

    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn().mockResolvedValue(buildSnapshot(ExportScope.FULL)),
      } as never,
    );

    const result = await service.create(admin as never, campaignId, {
      format: ExportFormat.PDF,
    });

    expect(result.status).toBe(ExportStatus.COMPLETED);
    const putCommand = sentCommands.find(
      (command) => command?.constructor.name === 'PutObjectCommand',
    ) as { input: Record<string, unknown> };
    expect(putCommand.input).toEqual(
      expect.objectContaining({
        Bucket: 'ross-project',
        Key: expect.stringMatching(
          /^exports\/22222222-2222-2222-2222-222222222222\/\d{4}\/\d{2}\/ross_campaign_full_pdf_\d{8}_\d{6}\.pdf$/,
        ),
        ContentType: 'application/pdf',
      }),
    );
  });

  it('openForDownload streams from R2 when R2 driver is enabled', async () => {
    process.env = {
      ...originalEnv,
      EXPORT_STORAGE_DRIVER: 'r2',
      R2_ENABLED: 'true',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_BUCKET: 'ross-project',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key',
    };

    const sentCommands: unknown[] = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      sentCommands.push(command);
      if (command.constructor.name === 'HeadObjectCommand') {
        return Promise.resolve({
          ContentLength: 3,
          ContentType: 'application/pdf',
        }) as never;
      }
      if (command.constructor.name === 'GetObjectCommand') {
        return Promise.resolve({ Body: Readable.from(['pdf']) }) as never;
      }
      return Promise.resolve({}) as never;
    });

    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue({
      ...stubCompletedExport('exp-r2-download', ExportFormat.PDF),
      filePath:
        'exports/22222222-2222-2222-2222-222222222222/exp-r2-download/export.pdf',
      fileSize: null,
    });

    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );

    const result = await service.openForDownload(
      admin as never,
      'exp-r2-download',
    );

    expect(result.fileSize).toBe(3);
    expect(result.stream).toBeInstanceOf(Readable);
    expect(
      sentCommands.some(
        (command) => command?.constructor.name === 'GetObjectCommand',
      ),
    ).toBe(true);
  });

  it('openForDownload returns EXPORT_FILE_NOT_FOUND when R2 object is missing', async () => {
    process.env = {
      ...originalEnv,
      EXPORT_STORAGE_DRIVER: 'r2',
      R2_ENABLED: 'true',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_BUCKET: 'ross-project',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key',
    };

    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    } as never);

    const prisma = buildPrismaStub();
    prisma.exportReport.findUnique.mockResolvedValue({
      ...stubCompletedExport('exp-r2-missing', ExportFormat.PDF),
      filePath:
        'exports/22222222-2222-2222-2222-222222222222/exp-r2-missing/export.pdf',
    });

    const service = new ExportsService(
      prisma as never,
      {
        load: jest.fn(),
      } as never,
    );

    await expect(
      service.openForDownload(admin as never, 'exp-r2-missing'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXPORT_FILE_NOT_FOUND' }),
    });
  });

  it('throws a config error when R2 driver is enabled without credentials', () => {
    process.env = {
      ...originalEnv,
      EXPORT_STORAGE_DRIVER: 'r2',
      R2_ENABLED: 'true',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_BUCKET: 'ross-project',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
    };

    expect(
      () =>
        new ExportsService(
          buildPrismaStub() as never,
          {
            load: jest.fn(),
          } as never,
        ),
    ).toThrow('Missing required environment variable: R2_ACCESS_KEY_ID');
  });
});

describe('R2FileStore', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writeObject sends bucket, key, and content type to S3Client', async () => {
    const sentCommands: unknown[] = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      sentCommands.push(command);
      if (command.constructor.name === 'HeadObjectCommand') {
        return Promise.resolve({
          ContentLength: 42,
          ContentType: 'application/pdf',
        }) as never;
      }
      return Promise.resolve({}) as never;
    });

    const store = new R2FileStore({
      endpoint: 'https://account.r2.cloudflarestorage.com',
      bucket: 'ross-project',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: true,
      publicBaseUrl: null,
    });

    const result = await store.writeObject({
      key: 'exports/campaign/export/file.pdf',
      body: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });

    expect(result).toEqual({
      key: 'exports/campaign/export/file.pdf',
      size: 42,
      contentType: 'application/pdf',
    });
    const putCommand = sentCommands.find(
      (command) => command?.constructor.name === 'PutObjectCommand',
    ) as { input: Record<string, unknown> };
    expect(putCommand.input).toEqual(
      expect.objectContaining({
        Bucket: 'ross-project',
        Key: 'exports/campaign/export/file.pdf',
        ContentType: 'application/pdf',
      }),
    );
  });
});
