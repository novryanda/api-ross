import 'dotenv/config';

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

export function getFrontendUrl(): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const origins = getTrustedOrigins().filter(
    (origin) => origin !== getBetterAuthUrl(),
  );
  return (origins[0] ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Returns the root domain for cross-subdomain cookie sharing.
 * Set AUTH_COOKIE_DOMAIN=".netkrida.cloud" in production so that cookies
 * set by api.netkrida.cloud are readable by ross.netkrida.cloud.
 * Returns null in development (cookies stay on localhost).
 */
export function getAuthCookieDomain(): string | null {
  return process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
}

export type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
};

export type SmtpEmailConfig = {
  provider: 'smtp';
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return value.trim().toLowerCase() === 'true';
}

export function getSmtpEmailConfig(): SmtpEmailConfig | null {
  if (process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== 'smtp') {
    return null;
  }

  const from = process.env.EMAIL_FROM?.trim();
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() ?? '587');

  if (!from || !host || !user || !pass || !Number.isFinite(port)) {
    return null;
  }

  return {
    provider: 'smtp',
    from,
    host,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user,
    pass,
  };
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
