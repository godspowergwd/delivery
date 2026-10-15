import type { Prisma, PrismaClient } from '@prisma/client';

const CATEGORIES = [
  {
    name: 'Waakye Packs',
    slug: 'waakye-packs',
    description: 'Complete waakye meal packs.',
    sortOrder: 1,
  },
  {
    name: 'Waakye Ingredients',
    slug: 'waakye-ingredients',
    description: 'Individual ingredients for customized waakye meals.',
    sortOrder: 2,
  },
] as const;

export const WAAKYE_MENU_PRODUCTS = [
  {
    menuKey: 'waakye-pack-premium',
    name: 'Premium Waakye Pack',
    description: 'Waakye, fish, meat, egg, wele, sausage, gari, macaroni salad, and plantain.',
    price: 100,
    categorySlug: 'waakye-packs',
    productType: 'MEAL_PACK',
    isBaseIngredient: false,
    ingredients: ['Waakye', 'Fish', 'Meat', 'Egg', 'Wele', 'Sausage', 'Gari', 'Macaroni salad', 'Plantain'],
    customizationOptions: [],
  },
  {
    menuKey: 'waakye-pack-standard',
    name: 'Standard Waakye Pack',
    description: 'Waakye, choice of fish or meat, egg, wele, macaroni, gari, salad, and plantain.',
    price: 80,
    categorySlug: 'waakye-packs',
    productType: 'MEAL_PACK',
    isBaseIngredient: false,
    ingredients: ['Waakye', 'Fish or meat', 'Egg', 'Wele', 'Macaroni', 'Gari', 'Salad', 'Plantain'],
    customizationOptions: [
      { id: 'protein', label: 'Protein', options: ['Fish', 'Meat'], required: true, maxSelections: 1 },
    ],
  },
  {
    menuKey: 'waakye-pack-basic',
    name: 'Basic Waakye Pack',
    description: 'Waakye, choice of fish or meat, macaroni, and choice of gari or salad.',
    price: 50,
    categorySlug: 'waakye-packs',
    productType: 'MEAL_PACK',
    isBaseIngredient: false,
    ingredients: ['Waakye', 'Fish or meat', 'Macaroni', 'Gari or salad'],
    customizationOptions: [
      { id: 'protein', label: 'Protein', options: ['Fish', 'Meat'], required: true, maxSelections: 1 },
      { id: 'side', label: 'Gari or salad', options: ['Gari', 'Salad'], required: true, maxSelections: 1 },
    ],
  },
  ...[
    ['waakye', 'Waakye', true],
    ['fish', 'Fish', false],
    ['meat', 'Meat', false],
    ['egg', 'Egg', false],
    ['wele', 'Wele', false],
    ['sausage', 'Sausage', false],
    ['gari', 'Gari', false],
    ['macaroni', 'Macaroni', false],
    ['salad', 'Salad', false],
    ['plantain', 'Plantain', false],
  ].map(([slug, name, isBase]) => ({
    menuKey: `waakye-ingredient-${slug}`,
    name: String(name),
    description: `${String(name)} for customized meals.`,
    price: 0,
    categorySlug: 'waakye-ingredients',
    productType: 'INGREDIENT' as const,
    isBaseIngredient: isBase === true,
    ingredients: [String(name)],
    customizationOptions: [],
  })),
] satisfies Array<{
  menuKey: string;
  name: string;
  description: string;
  price: number;
  categorySlug: string;
  productType: 'MEAL_PACK' | 'INGREDIENT';
  isBaseIngredient: boolean;
  ingredients: string[];
  customizationOptions: Array<{
    id: string;
    label: string;
    options: string[];
    required: boolean;
    maxSelections: number;
  }>;
}>;

export const WAAKYE_DEMO_PRICES: Record<string, number> = {
  'waakye-ingredient-waakye': 20,
  'waakye-ingredient-fish': 25,
  'waakye-ingredient-meat': 25,
  'waakye-ingredient-egg': 5,
  'waakye-ingredient-wele': 10,
  'waakye-ingredient-sausage': 10,
  'waakye-ingredient-gari': 3,
  'waakye-ingredient-macaroni': 5,
  'waakye-ingredient-salad': 5,
  'waakye-ingredient-plantain': 10,
};

export const WAAKYE_MENU_IMAGES: Record<string, string> = {
  'waakye-pack-premium': '/menu-images/waakye-pack-premium.webp',
  'waakye-pack-standard': '/menu-images/waakye-pack-standard.webp',
  'waakye-pack-basic': '/menu-images/waakye-pack-basic.webp',
  'waakye-ingredient-waakye': '/menu-images/waakye-ingredient-waakye.webp',
  'waakye-ingredient-fish': '/menu-images/waakye-ingredient-fish.webp',
  'waakye-ingredient-meat': '/menu-images/waakye-ingredient-meat.webp',
  'waakye-ingredient-egg': '/menu-images/waakye-ingredient-egg.webp',
  'waakye-ingredient-wele': '/menu-images/waakye-ingredient-wele.webp',
  'waakye-ingredient-sausage': '/menu-images/waakye-ingredient-sausage.webp',
  'waakye-ingredient-gari': '/menu-images/waakye-ingredient-gari.webp',
  'waakye-ingredient-macaroni': '/menu-images/waakye-ingredient-macaroni.webp',
  'waakye-ingredient-salad': '/menu-images/waakye-ingredient-salad.webp',
  'waakye-ingredient-plantain': '/menu-images/waakye-ingredient-plantain.webp',
};

export async function applyWaakyeDemoDefaults(prisma: PrismaClient): Promise<void> {
  const products = await prisma.product.findMany({
    where: { menuKey: { in: WAAKYE_MENU_PRODUCTS.map((product) => product.menuKey) } },
    select: { id: true, menuKey: true, price: true, isDemoPrice: true, imageUrl: true },
  });
  let pricesInitialized = 0;
  let imagesInitialized = 0;
  for (const product of products) {
    if (!product.menuKey) continue;
    const data: Prisma.ProductUpdateInput = {};
    if (!product.isDemoPrice && Number(product.price) <= 0) {
      const demoPrice = WAAKYE_DEMO_PRICES[product.menuKey];
      if (demoPrice !== undefined) {
        data.price = demoPrice;
        data.isDemoPrice = true;
        pricesInitialized += 1;
      }
    }
    if (!product.imageUrl) {
      const imageUrl = WAAKYE_MENU_IMAGES[product.menuKey];
      if (imageUrl) {
        data.imageUrl = imageUrl;
        imagesInitialized += 1;
      }
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.product.update({
      where: { id: product.id },
      data,
    });
  }
  console.log(
    `[seed] demo defaults ready (${pricesInitialized} GHS demo price(s), ${imagesInitialized} missing image(s))`,
  );
}

export async function replaceMenuCatalog(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const baseline = await tx.menuCatalogBackup.findUnique({
      where: { id: 'waakye-menu-replacement-baseline' },
      select: { id: true },
    });
    if (baseline) {
      console.log('[seed] waakye menu migration already applied; preserving catalog and admin edits');
      return;
    }

    const [previousCategories, previousProducts] = await Promise.all([
      tx.category.findMany(),
      tx.product.findMany(),
    ]);

    await tx.menuCatalogBackup.upsert({
      where: { id: 'waakye-menu-replacement-baseline' },
      update: {},
      create: {
        id: 'waakye-menu-replacement-baseline',
        categories: previousCategories.map((category) => ({
          ...category,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        })) as Prisma.InputJsonValue,
        products: previousProducts.map((product) => ({
          ...product,
          price: product.price.toString(),
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        })) as Prisma.InputJsonValue,
      },
    });

    const categoryIds = new Map<string, string>();
    for (const category of CATEGORIES) {
      const existing = await tx.category.findUnique({ where: { slug: category.slug } });
      const row = existing ?? await tx.category.create({ data: { ...category, isActive: true } });
      categoryIds.set(category.slug, row.id);
    }

    let initialized = 0;
    for (const product of WAAKYE_MENU_PRODUCTS) {
      const categoryId = categoryIds.get(product.categorySlug);
      if (!categoryId) throw new Error(`Missing category for ${product.menuKey}.`);

      const existing = await tx.product.findUnique({ where: { menuKey: product.menuKey } });
      if (existing) continue;

      const legacy = await tx.product.findFirst({
        where: {
          menuKey: null,
          name: { equals: product.name, mode: 'insensitive' },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const data = {
        menuKey: product.menuKey,
        name: product.name,
        description: product.description,
        imageUrl: WAAKYE_MENU_IMAGES[product.menuKey] ?? null,
        price: product.price,
        productType: product.productType,
        isBaseIngredient: product.isBaseIngredient,
        customizationOptions: product.customizationOptions,
        ingredients: product.ingredients,
        prepTimeMinutes: 15,
        isAvailable: true,
        stock: 50,
        isArchived: false,
        isPopular: false,
        isNew: false,
        categoryId,
      };
      if (legacy) await tx.product.update({ where: { id: legacy.id }, data });
      else await tx.product.create({ data });
      initialized += 1;
    }

    console.log(
      `[seed] waakye menu ready (${WAAKYE_MENU_PRODUCTS.length} products; ${initialized} initialized)`,
    );
  });
}
