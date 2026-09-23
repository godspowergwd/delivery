import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf('const CATEGORIES');
const endMarker = "  {\n    name: 'Caesar Salad',";
const endIdx = s.indexOf(endMarker);
console.log('start=' + start + ' endIdx=' + endIdx);
const head = s.slice(0, start);
const tail = s.slice(endIdx);

const replacement = `const CATEGORIES: Array<{
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
`;
fs.writeFileSync(p, head + replacement + tail);
console.log('wrote OK, new size=' + (head + replacement + tail).length);
