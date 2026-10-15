/**
 * Database seed - default staff accounts, business settings and (outside
 * production) a demo catalogue.
 *
 * Rules this file follows:
 *  1. New-account credentials are supplied through ignored environment variables.
 *  2. Existing accounts and settings are never overwritten. The focused catalog
 *     is replaced once and then admin edits are preserved. Re-running is safe.
 *  3. Every password is hashed with bcrypt (same work factor as the API) before it
 *     reaches PostgreSQL.
 *
 *   npm run db:seed
 *   Set SEED_ADMIN_PASSWORD / SEED_CASHIER_PASSWORD / SEED_INVENTORY_PASSWORD in apps/api/.env
 *   npm run db:seed -- --link-usernames   # attach short usernames to existing default accounts
 *   npm run db:seed -- --with-demo-data   # also seed the demo catalogue + demo accounts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { isLoopbackDatabaseUrl } from '@delivery/shared';
import { DEFAULT_SETTINGS } from '../src/config/defaults';
import { hashPassword } from '../src/lib/password';
import { replaceMenuCatalog } from './menu-catalog';

loadEnv({ path: path.resolve(__dirname, '../.env') });

if (
  process.env.NODE_ENV === 'production' ||
  !isLoopbackDatabaseUrl(process.env.DATABASE_URL) ||
  (process.env.DIRECT_URL && !isLoopbackDatabaseUrl(process.env.DIRECT_URL))
) {
  throw new Error('Database seeding is restricted to non-production loopback databases.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const SETTING_SEEDS = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));

type SeedRole = 'CUSTOMER' | 'KITCHEN' | 'DRIVER' | 'ADMIN';

interface SeedAccount {
  key: string;
  username: string;
  email: string;
  name: string;
  role: SeedRole;
  /** Protected accounts cannot be deleted or demoted from the admin UI. */
  isProtected: boolean;
}

/** Existing account identities; passwords are never stored in source. */
const STAFF_ACCOUNTS: SeedAccount[] = [
  {
    key: 'admin',
    username: 'admin',
    email: 'admin@deliverysystem.app',
    name: 'Business Owner',
    role: 'ADMIN',
    isProtected: true,
  },
  {
    key: 'cashier',
    username: 'cashier',
    email: 'cashier@deliverysystem.app',
    name: 'Front Counter',
    role: 'KITCHEN',
    isProtected: false,
  },
  {
    key: 'inventory',
    username: 'inventory',
    email: 'inventory@deliverysystem.app',
    name: 'Inventory Desk',
    // The platform ships four roles (CUSTOMER / KITCHEN / DRIVER / ADMIN), so the
    // inventory desk gets the operations role. Switch this to 'ADMIN' if that
    // person must also manage the catalogue, stock levels and prices.
    role: 'KITCHEN',
    isProtected: false,
  },
];

/** Demo accounts: seeded locally (or with --with-demo-data), never required in production. */
const DEMO_ACCOUNTS: SeedAccount[] = [
  {
    key: 'kitchen',
    username: 'kitchen',
    email: 'kitchen@deliverysystem.app',
    name: 'Kitchen Station',
    role: 'KITCHEN',
    isProtected: false,
  },
  {
    key: 'driver',
    username: 'driver',
    email: 'driver@deliverysystem.app',
    name: 'Kwame Rider',
    role: 'DRIVER',
    isProtected: false,
  },
  {
    key: 'customer',
    username: 'customer',
    email: 'customer@deliverysystem.app',
    name: 'Ama Mensah',
    role: 'CUSTOMER',
    isProtected: false,
  },
];

/** `--flag`, `--key=value` parsing for non-secret seed options. */
function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? 'true');
  }
  return flags;
}

/** Prisma reports unique violations with code P2002 (older paths only carry the message). */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'P2002' || (error instanceof Error && error.message.includes('Unique constraint'));
}

/**
 * Creates the account only when neither its email nor its username exists yet.
 * Existing rows are never modified - not even to reset a forgotten password.
 */
async function seedAccount(account: SeedAccount, password: string | undefined): Promise<'created' | 'kept'> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: account.email }, { username: account.username }] },
    select: { email: true },
  });
  if (existing) {
    console.log(`[seed] kept existing ${account.role} account: ${existing.email}`);
    return 'kept';
  }
  if (!password || password.length < 12) {
    throw new Error(`Set ${`SEED_${account.key.toUpperCase()}_PASSWORD`} to a unique password of at least 12 characters to create this account.`);
  }

  const data = {
    email: account.email,
    name: account.name,
    username: account.username,
    role: account.role,
    isProtected: account.isProtected,
    isActive: true,
    passwordHash: await hashPassword(password),
  };

  try {
    await prisma.user.create({ data });
    console.log(`[seed] created ${account.role} account: ${account.username} / ${account.email}`);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another account already owns that username: keep the email-only sign-in.
    await prisma.user.create({ data: { ...data, username: null } });
    console.log(
      `[seed] created ${account.role} account: ${account.email} (username "${account.username}" was taken)`,
    );
  }
  return 'created';
}

/**
 * Opt-in backfill (`--link-usernames`) for accounts created before usernames
 * existed: only rows that match a default email AND have no username are touched.
 */
async function linkUsernames(accounts: SeedAccount[]): Promise<void> {
  for (const account of accounts) {
    const taken = await prisma.user.findUnique({
      where: { username: account.username },
      select: { id: true },
    });
    if (taken) continue;
    const result = await prisma.user.updateMany({
      where: { email: account.email, username: null },
      data: { username: account.username },
    });
    if (result.count > 0) {
      console.log(`[seed] linked username "${account.username}" to ${account.email}`);
    }
  }
}

/** Business settings: create-only, one batched transaction, existing values win. */
async function seedSettings(): Promise<void> {
  await prisma.$transaction(
    SETTING_SEEDS.map((setting) =>
      prisma.setting.upsert({
        where: { key: setting.key },
        update: {},
        create: { key: setting.key, value: setting.value as never },
      }),
    ),
  );
  console.log(`[seed] ${SETTING_SEEDS.length} settings ready (existing values untouched)`);
}

/** A saved address for the demo customer so checkout can be exercised locally. */
async function seedDemoAddress(): Promise<void> {
  const customer = await prisma.user.findUnique({
    where: { email: 'customer@deliverysystem.app' },
    select: { id: true },
  });
  if (!customer) return;

  const existing = await prisma.address.findFirst({ where: { userId: customer.id } });
  if (existing) return;

  await prisma.address.create({
    data: {
      userId: customer.id,
      label: 'Home',
      line1: 'House 7, Gbawe Road',
      area: 'Malam',
      city: 'Accra',
      isDefault: true,
    },
  });
  console.log('[seed] demo customer address created');
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const withDemo = flags.has('with-demo-data') || process.env.NODE_ENV !== 'production';

  console.log(`[seed] starting (${withDemo ? 'staff accounts + demo data' : 'staff accounts only'})`);

  let created = 0;
  const accounts = withDemo ? [...STAFF_ACCOUNTS, ...DEMO_ACCOUNTS] : STAFF_ACCOUNTS;
  for (const account of accounts) {
    const password = process.env[`SEED_${account.key.toUpperCase()}_PASSWORD`];
    if ((await seedAccount(account, password)) === 'created') created += 1;
  }

  if (flags.has('link-usernames')) {
    await linkUsernames(accounts);
  }

  await seedSettings();

  if (withDemo) {
    await replaceMenuCatalog(prisma);
    await seedDemoAddress();
  }

  console.log(`[seed] done - ${created} account(s) created, existing rows left untouched`);
  if (created > 0) {
    console.log('[seed] sign in and change every default password from the profile screen.');
  }
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
