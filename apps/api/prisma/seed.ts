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
}

const CATEGORIES: Array<{
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}> = [
  { name: 'Meals', slug: 'meals', description: 'Hearty main dishes cooked fresh to order.', sortOrder: 1 },
  { name: 'Drinks', slug: 'drinks', description: 'Chilled drinks, fresh juices and hot beverages.', sortOrder: 2 },
  { name: 'Snacks', slug: 'snacks', description: 'Quick bites for between meals.', sortOrder: 3 },
  { name: 'Desserts', slug: 'desserts', description: 'Sweet treats to finish your meal.', sortOrder: 4 },
  { name: 'Specials', slug: 'specials', description: 'Limited-time chef specials.', sortOrder: 5 },
];

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Jollof Rice with Chicken',
    description: 'Smoky party jollof rice served with grilled chicken, fried plantain and shito.',
    price: 45,
    category: 'meals',
    ingredients: ['Rice', 'Chicken', 'Tomato', 'Plantain', 'Pepper sauce'],
    prepTimeMinutes: 25,
    stock: 40,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Waakye Special',
    description: 'Classic waakye with gari, spaghetti, boiled egg, avocado and stew.',
    price: 38,
    category: 'meals',
    ingredients: ['Beans', 'Rice', 'Gari', 'Egg', 'Avocado'],
    prepTimeMinutes: 20,
    stock: 35,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Grilled Tilapia & Banku',
    description: 'Whole tilapia marinated in spices, grilled over coals, served with fresh banku.',
    price: 65,
    category: 'meals',
    ingredients: ['Tilapia', 'Banku', 'Pepper', 'Onions'],
    prepTimeMinutes: 30,
    stock: 20,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Chicken Shawarma',
    description: 'Grilled chicken strips with garlic sauce, vegetables and fries in a soft wrap.',
    price: 35,
    category: 'meals',
    ingredients: ['Chicken', 'Bread', 'Garlic sauce', 'Cabbage'],
    prepTimeMinutes: 15,
    stock: 50,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Veggie Fried Rice',
    description: 'Wok-fried rice with seasonal vegetables, soy sauce and a fried egg on top.',
    price: 40,
    category: 'meals',
    ingredients: ['Rice', 'Carrots', 'Beans', 'Egg', 'Soy sauce'],
    prepTimeMinutes: 18,
    stock: 30,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Fresh Orange Juice',
    description: 'Freshly squeezed orange juice served chilled with no added sugar.',
    price: 15,
    category: 'drinks',
    ingredients: ['Oranges'],
    prepTimeMinutes: 5,
    stock: 60,
    isPopular: true,
    isNew: false,
    imageUrl: null,
  },
  {
    name: 'Iced Coffee',
    description: 'Double-shot espresso over ice with milk and a hint of vanilla.',
    price: 18,
    category: 'drinks',
    ingredients: ['Espresso', 'Milk', 'Ice', 'Vanilla'],
    prepTimeMinutes: 6,
    stock: 55,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Bottled Water 750ml',
    description: 'Chilled still water in a resealable bottle.',
    price: 5,
    category: 'drinks',
    ingredients: ['Water'],
    prepTimeMinutes: 2,
    stock: 200,
    imageUrl: null,
  },
  {
    name: 'Meat Pie (2 pcs)',
    description: 'Flaky pastry filled with seasoned minced beef and potatoes.',
    price: 14,
    category: 'snacks',
    ingredients: ['Flour', 'Beef', 'Potato', 'Butter'],
    prepTimeMinutes: 8,
    stock: 45,
    isPopular: true,
    imageUrl: null,
  },
  {
    name: 'Spring Rolls (4 pcs)',
    description: 'Crispy vegetable spring rolls with sweet chilli dip.',
    price: 16,
    category: 'snacks',
    ingredients: ['Cabbage', 'Carrot', 'Pastry', 'Chilli sauce'],
    prepTimeMinutes: 10,
    stock: 40,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Chocolate Brownie',
    description: 'Warm fudgy brownie with a molten chocolate centre.',
    price: 20,
    category: 'desserts',
    ingredients: ['Chocolate', 'Butter', 'Eggs', 'Sugar'],
    prepTimeMinutes: 7,
    stock: 25,
    isPopular: true,
    imageUrl: null,
  },
  {
    name: 'Vanilla Milkshake',
    description: 'Thick vanilla ice cream milkshake topped with whipped cream.',
    price: 22,
    category: 'desserts',
    ingredients: ['Vanilla ice cream', 'Milk', 'Cream'],
    prepTimeMinutes: 6,
    stock: 30,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Chef Burger Combo',
    description: 'Double beef burger with cheese, served with fries and a soft drink.',
    price: 55,
    category: 'specials',
    ingredients: ['Beef', 'Cheese', 'Brioche bun', 'Fries', 'Soft drink'],
    prepTimeMinutes: 22,
    stock: 15,
    isPopular: true,
    isNew: true,
    imageUrl: null,
  },
  {
    name: 'Friday Fish Fry Platter',
    description: 'Weekend special: fried fish, yam chips, pepper and coleslaw. Limited stock.',
    price: 70,
    category: 'specials',
    ingredients: ['Fish', 'Yam', 'Pepper', 'Coleslaw'],
    prepTimeMinutes: 28,
    stock: 10,
    isNew: true,
    imageUrl: null,
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
async function seedDemoCatalogue(): Promise<void> {
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
        stock: product.stock,
        categoryId,
        imageUrl: product.imageUrl,
        isPopular: product.isPopular ?? false,
        isNew: product.isNew ?? false,
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
      line1: '12 Independence Avenue',
      area: 'Osu',
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
