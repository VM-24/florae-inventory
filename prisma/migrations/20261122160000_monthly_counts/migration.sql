-- Monthly counts: the per-month columns of the sheet move from "items" to "monthly_counts",
-- so past months are kept instead of being overwritten.

-- CreateTable
CREATE TABLE "monthly_counts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "currentQty" INTEGER,
    "shortageQty" INTEGER NOT NULL DEFAULT 0,
    "brokenQty" INTEGER NOT NULL DEFAULT 0,
    "endOfMonthQty" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_counts_month_idx" ON "monthly_counts"("month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_counts_itemId_month_key" ON "monthly_counts"("itemId", "month");

-- AddForeignKey
ALTER TABLE "monthly_counts" ADD CONSTRAINT "monthly_counts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move existing data: each item's single count becomes the count for the month of "countedAt"
-- (current month when no date was recorded).
INSERT INTO "monthly_counts" ("id", "itemId", "month", "currentQty", "shortageQty", "brokenQty", "endOfMonthQty", "note", "updatedAt")
SELECT (SELECT substr(h,1,8) || '-' || substr(h,9,4) || '-4' || substr(h,14,3) || '-a' || substr(h,18,3) || '-' || substr(h,21,12) FROM md5("id" || ':monthly') AS h), "id", date_trunc('month', COALESCE("countedAt", CURRENT_DATE))::date,
       "currentQty", "shortageQty", "brokenQty", "endOfMonthQty", "note", CURRENT_TIMESTAMP
FROM "items";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "brokenQty",
DROP COLUMN "countedAt",
DROP COLUMN "currentQty",
DROP COLUMN "endOfMonthQty",
DROP COLUMN "note",
DROP COLUMN "shortageQty";
