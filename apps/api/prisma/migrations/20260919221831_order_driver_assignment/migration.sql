-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "driverId" TEXT;

-- CreateIndex
CREATE INDEX "Order_driverId_status_idx" ON "Order"("driverId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
