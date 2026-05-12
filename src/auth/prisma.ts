import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getDatabaseUrl } from '../config/env.js';

const globalForPrisma = globalThis as unknown as {
  rossPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.rossPrisma ??
  new PrismaClient({
    adapter: new PrismaPg(getDatabaseUrl()),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.rossPrisma = prisma;
}
