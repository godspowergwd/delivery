import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { isLoopbackDatabaseUrl } from '@delivery/shared';

const cli = process.argv.slice(2);
const developerDatabaseCommand =
  (cli[0] === 'migrate' && cli[1] === 'dev') ||
  (cli[0] === 'db' && (cli[1] === 'push' || cli[1] === 'seed'));
const databaseUrl = process.env.DATABASE_URL ?? env('DATABASE_URL');

if (
  developerDatabaseCommand &&
  (process.env.NODE_ENV === 'production' ||
    !isLoopbackDatabaseUrl(databaseUrl) ||
    (process.env.DIRECT_URL && !isLoopbackDatabaseUrl(process.env.DIRECT_URL)))
) {
  throw new Error('Refusing Prisma developer database command: non-production loopback DATABASE_URL and DIRECT_URL are required.');
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? databaseUrl,
  },
});
