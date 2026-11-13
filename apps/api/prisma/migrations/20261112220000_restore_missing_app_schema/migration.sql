DO $$
BEGIN
  CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'MEAL_PACK', 'INGREDIENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliveryPricingSnapshot" JSONB;

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "isDemoPrice" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "menuKey" TEXT,
  ADD COLUMN IF NOT EXISTS "isDemoPrice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "productType" "ProductType" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "isBaseIngredient" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customizationOptions" JSONB;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushAlert" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuCatalogBackup" (
  "id" TEXT NOT NULL,
  "categories" JSONB NOT NULL,
  "products" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuCatalogBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_menuKey_key"
  ON "Product"("menuKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PushAlert_orderId_userId_key"
  ON "PushAlert"("orderId", "userId");
CREATE INDEX IF NOT EXISTS "PushAlert_active_nextAttemptAt_idx"
  ON "PushAlert"("active", "nextAttemptAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PushSubscription_userId_fkey'
      AND conrelid = '"PushSubscription"'::regclass
  ) THEN
    ALTER TABLE "PushSubscription"
      ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PushAlert_orderId_fkey'
      AND conrelid = '"PushAlert"'::regclass
  ) THEN
    ALTER TABLE "PushAlert"
      ADD CONSTRAINT "PushAlert_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PushAlert_userId_fkey'
      AND conrelid = '"PushAlert"'::regclass
  ) THEN
    ALTER TABLE "PushAlert"
      ADD CONSTRAINT "PushAlert_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuCatalogBackup" ENABLE ROW LEVEL SECURITY;
