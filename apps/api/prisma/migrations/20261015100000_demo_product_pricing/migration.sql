ALTER TABLE "Product"
  ADD COLUMN "isDemoPrice" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem"
  ADD COLUMN "isDemoPrice" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Product"
SET "imageUrl" = CASE "menuKey"
  WHEN 'waakye-pack-premium' THEN '/menu-images/waakye-pack-premium.webp'
  WHEN 'waakye-pack-standard' THEN '/menu-images/waakye-pack-standard.webp'
  WHEN 'waakye-pack-basic' THEN '/menu-images/waakye-pack-basic.webp'
  WHEN 'waakye-ingredient-waakye' THEN '/menu-images/waakye-ingredient-waakye.webp'
  WHEN 'waakye-ingredient-fish' THEN '/menu-images/waakye-ingredient-fish.webp'
  WHEN 'waakye-ingredient-meat' THEN '/menu-images/waakye-ingredient-meat.webp'
  WHEN 'waakye-ingredient-egg' THEN '/menu-images/waakye-ingredient-egg.webp'
  WHEN 'waakye-ingredient-wele' THEN '/menu-images/waakye-ingredient-wele.webp'
  WHEN 'waakye-ingredient-sausage' THEN '/menu-images/waakye-ingredient-sausage.webp'
  WHEN 'waakye-ingredient-gari' THEN '/menu-images/waakye-ingredient-gari.webp'
  WHEN 'waakye-ingredient-macaroni' THEN '/menu-images/waakye-ingredient-macaroni.webp'
  WHEN 'waakye-ingredient-salad' THEN '/menu-images/waakye-ingredient-salad.webp'
  WHEN 'waakye-ingredient-plantain' THEN '/menu-images/waakye-ingredient-plantain.webp'
END
WHERE "menuKey" IN (
  'waakye-pack-premium', 'waakye-pack-standard', 'waakye-pack-basic',
  'waakye-ingredient-waakye', 'waakye-ingredient-fish', 'waakye-ingredient-meat',
  'waakye-ingredient-egg', 'waakye-ingredient-wele', 'waakye-ingredient-sausage',
  'waakye-ingredient-gari', 'waakye-ingredient-macaroni', 'waakye-ingredient-salad',
  'waakye-ingredient-plantain'
)
AND ("imageUrl" IS NULL OR "imageUrl" = '');
