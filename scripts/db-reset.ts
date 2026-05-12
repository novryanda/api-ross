import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ross_db?schema=public';

function assertDevelopmentDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset database while NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const databaseName = url.pathname.replace(/^\//, '').toLowerCase();
  const forbiddenPattern = /(prod|production|live|staging)/i;

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `Refusing to reset non-local database host "${url.hostname}".`,
    );
  }

  if (forbiddenPattern.test(host) || forbiddenPattern.test(databaseName)) {
    throw new Error(
      `Refusing to reset database that looks non-development: "${databaseName}".`,
    );
  }
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed.`);
  }
}

assertDevelopmentDatabase();
run('npx', ['prisma', 'generate']);
run('npx', ['prisma', 'migrate', 'reset', '--force']);
run('npx', ['prisma', 'generate']);
run('npx', ['prisma', 'db', 'seed']);
