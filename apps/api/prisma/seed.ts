/**
 * Database seed: protected admin + kitchen accounts, a demo customer with a
 * saved address, business settings and a realistic starter catalogue.
 *
 *   npm run db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import bcrypt from 'bcryptjs';

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

const SETTING_SEEDS: Array<{ key: string; value: unknown }> = [
  { key: 'businessName', value: 'Delivery System' },
  { key: 'businessAddress', value: '1 Market Street, Accra' },
  { key: 'businessPhone', value: '+233000000000' },
  { key: 'businessEmail', value: 'support@deliverysystem.app' },
  { key: 'currencyCode', value: 'GHS' },
  { key: 'currencySymbol', value: 'GH\u20b5' },
  { key: 'deliveryFee', value: 8 },
  { key: 'taxRate', value: 2.5 },
  { key: 'minOrderTotal', value: 10 },
  { key: 'acceptingOrders', value: true },
  { key: 'supportPhone', value: '+233000000000' },
  { key: 'supportEmail', value: 'support@deliverysystem.app' },
  { key: 'lowStockThreshold', value: 10 },
];

async function upsertUser(
  email: string,
  name: string,
  role: 'CUSTOMER' | 'KITCHEN' | 'DRIVER' | 'ADMIN',
  password: string,
  isProtected: boolean,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name, role, isActive: true, isProtected, passwordHash },
    create: { email, name, role, passwordHash, isProtected, isActive: true, phone: '+233000000000' },
  });
  console.log(`[seed] user ready: ${email} (${role})`);
}

async function main(): Promise<void> {
  console.log('[seed] starting...');

  await upsertUser(
    process.env.SEED_ADMIN_EMAIL ?? 'admin@deliverysystem.app',
    'Business Owner',
    'ADMIN',
    process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
    true,
  );
  await upsertUser(
    process.env.SEED_KITCHEN_EMAIL ?? 'kitchen@deliverysystem.app',
    'Kitchen Station',
    'KITCHEN',
    process.env.SEED_KITCHEN_PASSWORD ?? 'Kitchen@12345',
    false,
  );
  await upsertUser(
    process.env.SEED_CUSTOMER_EMAIL ?? 'customer@deliverysystem.app',
    'Ama Mensah',
    'CUSTOMER',
    process.env.SEED_CUSTOMER_PASSWORD ?? 'Customer@12345',
    false,
  );
  await upsertUser(
    process.env.SEED_DRIVER_EMAIL ?? 'driver@deliverysystem.app',
    'Kwame Rider',
    'DRIVER',
    process.env.SEED_DRIVER_PASSWORD ?? 'Driver@12345',
    false,
  );

  for (const setting of SETTING_SEEDS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as object },
    });
  }
  console.log(`[seed] ${SETTING_SEEDS.length} settings ready`);

  const categoriesBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
      },
      create: category,
    });
    categoriesBySlug.set(category.slug, row.id);
  }
  console.log(`[seed] ${CATEGORIES.length} categories ready`);

  for (const product of PRODUCTS) {
    const categoryId = categoriesBySlug.get(product.category);
    if (!categoryId) throw new Error(`Missing category for product ${product.name}`);
    const data = {
      description: product.description,
      price: product.price,
      ingredients: product.ingredients,
      prepTimeMinutes: product.prepTimeMinutes,
      stock: product.stock,
      categoryId,
      imageUrl: product.imageUrl,
      isPopular: product.isPopular ?? false,
      isNew: product.isNew ?? false,
    };
    const existing = await prisma.product.findFirst({ where: { name: product.name } });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
    } else {
      await prisma.product.create({ data: { ...data, name: product.name } });
    }
  }
  console.log(`[seed] ${PRODUCTS.length} products ready`);

  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_CUSTOMER_EMAIL ?? 'customer@deliverysystem.app' },
  });
  const existingAddress = await prisma.address.findFirst({ where: { userId: customer.id } });
  if (!existingAddress) {
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

  console.log('[seed] done');
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
