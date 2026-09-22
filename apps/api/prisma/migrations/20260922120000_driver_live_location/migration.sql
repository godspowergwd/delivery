-- Live driver location (real device GPS) + delivery coordinates on orders.
--
-- Purely additive: two nullable columns and one new table. No existing row is
-- rewritten, no column is dropped and no data is reset, so this migration is
-- safe to apply on a live database with customers and orders in flight.

-- AlterTable: coordinates captured from the customer's device at checkout
ALTER TABLE "Order" ADD COLUMN     "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN     "deliveryLongitude" DOUBLE PRECISION;

-- CreateTable: latest known position per employed driver
CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverLocation_driverId_key" ON "DriverLocation"("driverId");
CREATE INDEX "DriverLocation_updatedAt_idx" ON "DriverLocation"("updatedAt");
CREATE INDEX "DriverLocation_isOnline_idx" ON "DriverLocation"("isOnline");

-- AddForeignKey
ALTER TABLE "DriverLocation" ADD CONSTRAINT "DriverLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
