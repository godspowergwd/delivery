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
        imageUrl: null,
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
