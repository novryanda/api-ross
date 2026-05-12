import 'dotenv/config';
import { resolve } from 'node:path';

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ross?schema=public';

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
}

export function getTrustedOrigins(): string[] {
  const configuredOrigins = process.env.TRUSTED_ORIGINS;
  if (!configuredOrigins) {
    return ['http://localhost:3000', 'http://localhost:3001'];
  }

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getBetterAuthUrl(): string {
  return process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
}

/**
 * Absolute directory path where generated export artefacts are written.
 * Override via `EXPORT_STORAGE_DIR`. Defaults to `<cwd>/storage/exports`.
 */
export function getExportStorageDir(): string {
  const configured = process.env.EXPORT_STORAGE_DIR?.trim();
  if (configured && configured.length > 0) {
    return resolve(configured);
  }
  return resolve(process.cwd(), 'storage', 'exports');
}

export type ExportStorageDriver = 'local' | 'r2';

export type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
};

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getExportStorageDriver(): ExportStorageDriver {
  const configured = process.env.EXPORT_STORAGE_DRIVER?.trim().toLowerCase();
  if (configured === 'r2' || isEnabled(process.env.R2_ENABLED)) {
    return 'r2';
  }
  return 'local';
}

export function getExportProcessingTimeoutMinutes(): number {
  const configured = Number(process.env.EXPORT_PROCESSING_TIMEOUT_MINUTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 10;
}

export function getR2Config(): R2Config {
  return {
    endpoint: requiredEnv('R2_ENDPOINT'),
    bucket: requiredEnv('R2_BUCKET'),
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE?.trim() !== 'false',
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() || null,
  };
}
