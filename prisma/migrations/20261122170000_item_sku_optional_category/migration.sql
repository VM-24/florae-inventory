-- AlterTable
ALTER TABLE "items" ADD COLUMN     "sku" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_key" ON "items"("sku");

