-- Preserve confirmed destination provenance and support safe offline retries.
-- All new order fields are nullable so existing production rows remain intact.
CREATE TYPE "DeliveryLocationSource" AS ENUM ('gps', 'search');

ALTER TABLE "Order"
  ADD COLUMN "deliveryOriginalLatitude" DOUBLE PRECISION,
  ADD COLUMN "deliveryOriginalLongitude" DOUBLE PRECISION,
  ADD COLUMN "deliveryLocationSource" "DeliveryLocationSource",
  ADD COLUMN "deliveryLocationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");