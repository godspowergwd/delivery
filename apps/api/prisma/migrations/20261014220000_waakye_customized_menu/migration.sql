CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'MEAL_PACK', 'INGREDIENT');

ALTER TABLE "Product"
  ADD COLUMN "menuKey" TEXT,
  ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "isBaseIngredient" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customizationOptions" JSONB;

CREATE UNIQUE INDEX "Product_menuKey_key" ON "Product"("menuKey");

CREATE TABLE "MenuCatalogBackup" (
  "id" TEXT NOT NULL,
  "categories" JSONB NOT NULL,
  "products" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuCatalogBackup_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MenuCatalogBackup" ("id", "categories", "products")
SELECT
  'waakye-menu-replacement-baseline',
  COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM "Category" c), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM "Product" p), '[]'::jsonb);

UPDATE "Product"
SET "isArchived" = true, "isAvailable" = false, "stock" = 0;

UPDATE "Category" SET "isActive" = false;

INSERT INTO "Category" ("id", "name", "slug", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Waakye Packs', 'waakye-packs', 'Complete waakye meal packs.', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Waakye Ingredients', 'waakye-ingredients', 'Individual ingredients for customized waakye meals.', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

DO $$
DECLARE
  item RECORD;
  target_category_id TEXT;
  target_product_id TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('waakye-pack-premium', 'Premium Waakye Pack', 'Waakye, fish, meat, egg, wele, sausage, gari, macaroni salad, and plantain.', 100.00::numeric, 'waakye-packs', ARRAY['Waakye', 'Fish', 'Meat', 'Egg', 'Wele', 'Sausage', 'Gari', 'Macaroni salad', 'Plantain']::text[], 'MEAL_PACK', false, '[]'::jsonb),
      ('waakye-pack-standard', 'Standard Waakye Pack', 'Waakye, choice of fish or meat, egg, wele, macaroni, gari, salad, and plantain.', 80.00::numeric, 'waakye-packs', ARRAY['Waakye', 'Fish or meat', 'Egg', 'Wele', 'Macaroni', 'Gari', 'Salad', 'Plantain']::text[], 'MEAL_PACK', false, '[{"id":"protein","label":"Protein","options":["Fish","Meat"],"required":true,"maxSelections":1}]'::jsonb),
      ('waakye-pack-basic', 'Basic Waakye Pack', 'Waakye, choice of fish or meat, macaroni, and choice of gari or salad.', 50.00::numeric, 'waakye-packs', ARRAY['Waakye', 'Fish or meat', 'Macaroni', 'Gari or salad']::text[], 'MEAL_PACK', false, '[{"id":"protein","label":"Protein","options":["Fish","Meat"],"required":true,"maxSelections":1},{"id":"side","label":"Gari or salad","options":["Gari","Salad"],"required":true,"maxSelections":1}]'::jsonb),
      ('waakye-ingredient-waakye', 'Waakye', 'Waakye for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Waakye']::text[], 'INGREDIENT', true, '[]'::jsonb),
      ('waakye-ingredient-fish', 'Fish', 'Fish for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Fish']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-meat', 'Meat', 'Meat for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Meat']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-egg', 'Egg', 'Egg for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Egg']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-wele', 'Wele', 'Wele for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Wele']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-sausage', 'Sausage', 'Sausage for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Sausage']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-gari', 'Gari', 'Gari for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Gari']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-macaroni', 'Macaroni', 'Macaroni for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Macaroni']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-salad', 'Salad', 'Salad for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Salad']::text[], 'INGREDIENT', false, '[]'::jsonb),
      ('waakye-ingredient-plantain', 'Plantain', 'Plantain for customized meals.', 0.00::numeric, 'waakye-ingredients', ARRAY['Plantain']::text[], 'INGREDIENT', false, '[]'::jsonb)
    ) AS menu(menu_key, name, description, price, category_slug, ingredients, product_type, is_base_ingredient, customization_options)
  LOOP
    SELECT "id" INTO target_category_id FROM "Category" WHERE "slug" = item.category_slug;
    SELECT "id" INTO target_product_id
      FROM "Product"
      WHERE "menuKey" IS NULL AND lower("name") = lower(item.name)
      ORDER BY "createdAt", "id"
      LIMIT 1;

    IF target_product_id IS NULL THEN
      target_product_id := gen_random_uuid()::text;
      INSERT INTO "Product" (
        "id", "menuKey", "name", "description", "imageUrl", "price", "productType",
        "isBaseIngredient", "customizationOptions", "ingredients", "prepTimeMinutes",
        "isAvailable", "stock", "isArchived", "isPopular", "isNew", "categoryId",
        "createdAt", "updatedAt"
      )
      VALUES (
        target_product_id, item.menu_key, item.name, item.description, NULL, item.price,
        item.product_type::"ProductType", item.is_base_ingredient, item.customization_options,
        item.ingredients, 15, true, 50, false, false, false, target_category_id,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE "Product" SET
        "menuKey" = item.menu_key,
        "name" = item.name,
        "description" = item.description,
        "imageUrl" = NULL,
        "price" = item.price,
        "productType" = item.product_type::"ProductType",
        "isBaseIngredient" = item.is_base_ingredient,
        "customizationOptions" = item.customization_options,
        "ingredients" = item.ingredients,
        "prepTimeMinutes" = 15,
        "isAvailable" = true,
        "stock" = 50,
        "isArchived" = false,
        "isPopular" = false,
        "isNew" = false,
        "categoryId" = target_category_id,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = target_product_id;
    END IF;

    UPDATE "Product"
    SET "isArchived" = true, "isAvailable" = false, "stock" = 0
    WHERE lower("name") = lower(item.name) AND "id" <> target_product_id;
  END LOOP;
END $$;
