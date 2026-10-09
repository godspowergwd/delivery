ALTER TABLE "Order"
  ADD COLUMN "deliveryPricingSnapshot" JSONB;

-- Update only rows equal to the previously shipped defaults; preserve custom origins.
UPDATE "Setting"
SET "value" = '5.5789596'::jsonb
WHERE "key" = 'businessLatitude'
  AND "value" = '5.571264'::jsonb;

UPDATE "Setting"
SET "value" = '-0.295258'::jsonb
WHERE "key" = 'businessLongitude'
  AND "value" = '-0.284093'::jsonb;

UPDATE "Setting"
SET "value" = '"Onyx Lounge, Gbawe, Accra, Ghana"'::jsonb
WHERE "key" = 'businessAddress'
  AND "value" = '"Malam Junction, Gbawe Road, Accra"'::jsonb;
