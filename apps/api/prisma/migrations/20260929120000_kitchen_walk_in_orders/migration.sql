CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'KITCHEN_WALK_IN');
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

ALTER TABLE "Order"
  ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "createdById" TEXT,
  ALTER COLUMN "customerId" DROP NOT NULL;

CREATE INDEX "Order_source_fulfillmentType_createdAt_idx"
  ON "Order"("source", "fulfillmentType", "createdAt");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;