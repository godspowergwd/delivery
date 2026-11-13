UPDATE "Product" AS product
SET
  "menuKey" = menu.menu_key,
  "productType" = menu.product_type::"ProductType",
  "isBaseIngredient" = menu.is_base_ingredient,
  "customizationOptions" = menu.customization_options
FROM (
  VALUES
    ('waakye-packs', 'Premium Waakye Pack', 'waakye-pack-premium', 'MEAL_PACK', false, '[]'::jsonb),
    ('waakye-packs', 'Standard Waakye Pack', 'waakye-pack-standard', 'MEAL_PACK', false, '[{"id":"protein","label":"Protein","options":["Fish","Meat"],"required":true,"maxSelections":1}]'::jsonb),
    ('waakye-packs', 'Basic Waakye Pack', 'waakye-pack-basic', 'MEAL_PACK', false, '[{"id":"protein","label":"Protein","options":["Fish","Meat"],"required":true,"maxSelections":1},{"id":"side","label":"Gari or salad","options":["Gari","Salad"],"required":true,"maxSelections":1}]'::jsonb),
    ('waakye-ingredients', 'Waakye', 'waakye-ingredient-waakye', 'INGREDIENT', true, '[]'::jsonb),
    ('waakye-ingredients', 'Fish', 'waakye-ingredient-fish', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Meat', 'waakye-ingredient-meat', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Egg', 'waakye-ingredient-egg', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Wele', 'waakye-ingredient-wele', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Sausage', 'waakye-ingredient-sausage', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Gari', 'waakye-ingredient-gari', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Macaroni', 'waakye-ingredient-macaroni', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Salad', 'waakye-ingredient-salad', 'INGREDIENT', false, '[]'::jsonb),
    ('waakye-ingredients', 'Plantain', 'waakye-ingredient-plantain', 'INGREDIENT', false, '[]'::jsonb)
) AS menu(category_slug, product_name, menu_key, product_type, is_base_ingredient, customization_options)
JOIN "Category" AS category ON category."slug" = menu.category_slug
WHERE product."categoryId" = category."id"
  AND lower(product."name") = lower(menu.product_name)
  AND product."menuKey" IS NULL;
