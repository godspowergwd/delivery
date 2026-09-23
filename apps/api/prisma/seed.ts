/**
 * Database seed - default staff accounts, business settings and (outside
 * production) a demo catalogue.
 *
 * Rules this file follows:
 *  1. Credentials live here, in source, and never in environment variables.
 *  2. Every write is create-if-missing. An existing account keeps its password,
 *     role, name and activation state; existing settings, categories and products
 *     are never overwritten. Re-running the seed against the live database is safe.
 *  3. Every password is hashed with bcrypt (same work factor as the API) before it
 *     reaches PostgreSQL.
 *
 *   npm run db:seed
 *   npm run db:seed -- --admin-password="..." --cashier-password="..." --inventory-password="..."
 *   npm run db:seed -- --link-usernames   # attach short usernames to existing default accounts
 *   npm run db:seed -- --with-demo-data   # also seed the demo catalogue + demo accounts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../src/config/defaults';
import { hashPassword } from '../src/lib/password';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

interface SeedProduct {
  name: string;
  description: string;
  price: number;
  category: string;
  ingredients: string[];
  prepTimeMinutes: number;
  stock: number;
  isPopular?: boolean;
  isNew?: boolean;
  imageUrl: string | null;
  /** Legacy dishes seed as archived + unavailable so history survives but the menu stays waakye-only. */
  archive?: boolean;
}

/** Non-waakye dishes from the old marketplace seed — archived on every re-seed, never orderable. */
const LEGACY_PRODUCT_NAMES = [
  'Veggie Fried Rice',
  'Grilled Tilapia & Banku',
  'Chicken Shawarma',
  'Fried Rice with Shrimp',
  'Caesar Salad',
  'Beef Burger & Fries',
  'Fresh Orange Juice',
  'Iced Coffee',
  'Bottled Water 750ml',
  'Meat Pie (2 pcs)',
  'Spring Rolls (4 pcs)',
  'Chocolate Brownie',
  'Vanilla Milkshake',
  'Chef Burger Combo',
  'Friday Fish Fry Platter',
  'Tilapia & Banku',
  'Beef Burger',
];

const CATEGORIES: Array<{
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}> = [
  { name: 'Waakye', slug: 'waakye', description: 'Classic waakye plates served fresh from the coalpot.', sortOrder: 1 },
  { name: 'Rice Meals', slug: 'rice-meals', description: 'Jollof, fried rice and plain rice plates.', sortOrder: 2 },
  { name: 'Sides & Protein', slug: 'sides-protein', description: 'Extra eggs, chicken, fish and sides to complete your meal.', sortOrder: 3 },
  { name: 'Drinks', slug: 'drinks', description: 'Chilled drinks to go with your meal.', sortOrder: 4 },
];

/**
 * Waakye App — one kitchen, one focused menu. A small waakye/rice catalogue
 * keeps customer choice simple and the kitchen queue predictable. Anything
 * outside this menu is managed from Admin > Products (CRUD still works), but
 * the seed never restores non-waakye dishes.
 */
const PRODUCTS: SeedProduct[] = [
  {
    name: 'Waakye Special',
    description: 'Classic waakye with beans, gari, spaghetti, boiled egg, salad and shito.',
    price: 35,
    category: 'waakye',
    ingredients: ['Rice', 'Beans', 'Gari', 'Egg', 'Spaghetti', 'Shito'],
    prepTimeMinutes: 15,
    stock: 60,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Waakye with Chicken',
    description: 'Waakye plate with grilled chicken, gari, spaghetti and pepper sauce.',
    price: 45,
    category: 'waakye',
    ingredients: ['Rice', 'Beans', 'Chicken', 'Gari', 'Pepper sauce'],
    prepTimeMinutes: 15,
    stock: 50,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Waakye with Fish',
    description: 'Waakye plate with fried fish, gari, spaghetti, salad and shito.',
    price: 42,
    category: 'waakye',
    ingredients: ['Rice', 'Beans', 'Fish', 'Gari', 'Spaghetti', 'Shito'],
    prepTimeMinutes: 15,
    stock: 50,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Waakye Regular',
    description: 'Everyday waakye plate with gari, spaghetti, salad and stew.',
    price: 25,
    category: 'waakye',
    ingredients: ['Rice', 'Beans', 'Gari', 'Spaghetti', 'Stew'],
    prepTimeMinutes: 10,
    stock: 80,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Jollof Rice with Chicken',
    description: 'Smoky party jollof rice served with grilled chicken and shito.',
    price: 45,
    category: 'rice-meals',
    ingredients: ['Rice', 'Chicken', 'Tomato', 'Pepper sauce'],
    prepTimeMinutes: 20,
    stock: 40,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Fried Rice with Chicken',
    description: 'Tasty fried rice with mixed vegetables and grilled chicken.',
    price: 45,
    category: 'rice-meals',
    ingredients: ['Rice', 'Chicken', 'Vegetables', 'Spices'],
    prepTimeMinutes: 20,
    stock: 40,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Plain Rice with Stew',
    description: 'Steamed white rice with rich tomato stew and your choice of protein.',
    price: 30,
    category: 'rice-meals',
    ingredients: ['Rice', 'Tomato stew', 'Protein'],
    prepTimeMinutes: 15,
    stock: 45,
    isPopular: false,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Extra Chicken',
    description: 'A full piece of seasoned grilled chicken added to any plate.',
    price: 20,
    category: 'sides-protein',
    ingredients: ['Chicken', 'Spices'],
    prepTimeMinutes: 5,
    stock: 60,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Extra Fish',
    description: 'Crispy fried fish to go with your waakye or rice.',
    price: 18,
    category: 'sides-protein',
    ingredients: ['Fish', 'Spices'],
    prepTimeMinutes: 5,
    stock: 60,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Extra Egg & Salad',
    description: 'Boiled egg plus fresh salad and avocado when available.',
    price: 10,
    category: 'sides-protein',
    ingredients: ['Egg', 'Salad', 'Avocado'],
    prepTimeMinutes: 5,
    stock: 70,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Sobolo (Bissap)',
    description: 'Chilled homemade hibiscus drink, lightly spiced.',
    price: 10,
    category: 'drinks',
    ingredients: ['Hibiscus', 'Ginger', 'Spices'],
    prepTimeMinutes: 2,
    stock: 80,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Bottled Water',
    description: 'Chilled 750ml bottled water.',
    price: 5,
    category: 'drinks',
    ingredients: ['Water'],
    prepTimeMinutes: 1,
    stock: 120,
    isPopular: false,
    isNew: false,
    imageUrl: null,
  },
  // --- Legacy non-waakye dishes (archived, never re-seeded) ---
  // These rows exist so historical orders keep their items. They are
  // archived + unavailable, so they never appear in the customer menu.
  {
    name: "Veggie Fried Rice",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Fresh Orange Juice",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Iced Coffee",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Bottled Water 750ml",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Meat Pie (2 pcs)",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Spring Rolls (4 pcs)",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Chocolate Brownie",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Vanilla Milkshake",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Chef Burger Combo",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
  {
    name: "Friday Fish Fry Platter",
    description: 'Legacy dish — no longer sold.',
    price: 1,
    category: 'drinks',
    ingredients: [],
    prepTimeMinutes: 1,
    stock: 0,
    isPopular: false,
    isNew: false,
    imageUrl: null,
    archive: true,
  },
];

/**
 * Settings are seeded from the same constants the API falls back to, so code and
 * database can never drift apart. `update: {}` keeps an existing - possibly
 * already edited - value untouched.
 */
const SETTING_SEEDS = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));

type SeedRole = 'CUSTOMER' | 'KITCHEN' | 'DRIVER' | 'ADMIN';

interface SeedAccount {
  /** Also the CLI flag name for the password, for example `--admin-password`. */
  key: string;
  username: string;
  email: string;
  name: string;
  role: SeedRole;
  password: string;
  /** Protected accounts cannot be deleted or demoted from the admin UI. */
  isProtected: boolean;
}

/** Default staff accounts. Override a password with `--<key>-password="..."`. */
const STAFF_ACCOUNTS: SeedAccount[] = [
  {
    key: 'admin',
    username: 'admin',
    email: 'admin@deliverysystem.app',
    name: 'Business Owner',
    role: 'ADMIN',
    password: 'Admin@12345',
    isProtected: true,
  },
  {
    key: 'cashier',
    username: 'cashier',
    email: 'cashier@deliverysystem.app',
    name: 'Front Counter',
    role: 'KITCHEN',
    password: 'Cashier@12345',
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
    password: 'Inventory@12345',
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
    password: 'Kitchen@12345',
    isProtected: false,
  },
  {
    key: 'driver',
    username: 'driver',
    email: 'driver@deliverysystem.app',
    name: 'Kwame Rider',
    role: 'DRIVER',
    password: 'Driver@12345',
    isProtected: false,
  },
  {
    key: 'customer',
    username: 'customer',
    email: 'customer@deliverysystem.app',
    name: 'Ama Mensah',
    role: 'CUSTOMER',
    password: 'Customer@12345',
    isProtected: false,
  },
];

/** `--flag`, `--key=value` command line parsing (no environment variables needed). */
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
async function seedAccount(account: SeedAccount, password: string): Promise<'created' | 'kept'> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: account.email }, { username: account.username }] },
    select: { email: true },
  });
  if (existing) {
    console.log(`[seed] kept existing ${account.role} account: ${existing.email}`);
    return 'kept';
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

/** Demo catalogue: only ever creates missing rows, never rewrites a price or stock level. */
/** Focused Waakye App catalogue (waakye / rice meals / sides / drinks). */
async function seedDemoCatalogue(): Promise<void> {
  // Legacy (non-waakye) dishes from the old marketplace seed must never come
  // back as orderable items — archive them even when products already exist.
  const legacy = await prisma.product.updateMany({
    where: { name: { in: LEGACY_PRODUCT_NAMES }, isArchived: false },
    data: { isArchived: true, isAvailable: false, stock: 0 },
  });
  if (legacy.count > 0) {
    console.log(`Archived ${legacy.count} legacy non-waakye product(s) so the menu stays focused.`);
  }

  const categoriesBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: category.slug } });
    const row = existing ?? (await prisma.category.create({ data: category }));
    categoriesBySlug.set(category.slug, row.id);
  }

  let createdProducts = 0;
  for (const product of PRODUCTS) {
    const categoryId = categoriesBySlug.get(product.category);
    if (!categoryId) throw new Error(`Missing category for product ${product.name}`);

    const existing = await prisma.product.findFirst({
      where: { name: product.name, categoryId },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.product.create({
      data: {
        name: product.name,
        description: product.description,
        price: product.price,
        ingredients: product.ingredients,
        prepTimeMinutes: product.prepTimeMinutes,
        stock: product.archive ? 0 : product.stock,
        categoryId,
        imageUrl: product.imageUrl,
        isPopular: product.isPopular ?? false,
        isNew: product.isNew ?? false,
        isAvailable: !product.archive,
        isArchived: product.archive ?? false,
      },
    });
    createdProducts += 1;
  }

  console.log(
    `[seed] demo catalogue ready (${CATEGORIES.length} categories, ${createdProducts} products created, ${
      PRODUCTS.length - createdProducts
    } kept)`,
  );
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
    const password = flags.get(`${account.key}-password`) ?? account.password;
    if ((await seedAccount(account, password)) === 'created') created += 1;
  }

  if (flags.has('link-usernames')) {
    await linkUsernames(accounts);
  }

  await seedSettings();

  if (withDemo) {
    await seedDemoCatalogue();
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
