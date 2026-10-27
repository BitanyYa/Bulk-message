import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const isDatabaseConfigured = (): boolean => {
  const url = process.env.DATABASE_URL;
  return Boolean(
    url &&
    url.trim().length > 0 &&
    !url.includes('placeholder') &&
    !url.includes('your_database')
  );
};

export function formatPrismaErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'An unexpected database error occurred.';
  const msg = err.message;
  if (msg.includes('tenant/user') && msg.includes('not found')) {
    return 'Supabase project tenant not found. Please verify that your Supabase project is active (not paused) and check if the project reference in .env.local has a typo.';
  }
  if (msg.includes("Can't reach database server")) {
    return 'Cannot reach database server. Please check if your database is running and verify your network and DATABASE_URL in .env.local.';
  }
  if (msg.includes('Authentication failed') || msg.includes('password authentication failed')) {
    return 'Database authentication failed. Please verify your database username and password in .env.local.';
  }
  if (msg.includes('Table') && msg.includes('does not exist')) {
    return 'Database tables do not exist yet. Please run `npx prisma db push` to initialize tables.';
  }
  const lines = msg.split('\n');
  const lastLine = lines.filter((l) => l.trim().length > 0).pop();
  return lastLine && !lastLine.includes('TURBOPACK') ? lastLine.trim() : 'Database query failed.';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
