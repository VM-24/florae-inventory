-- Several photos per item: "items"."photoUrl" moves to "item_photos" (first by sortOrder = cover).

-- CreateTable
CREATE TABLE "item_photos" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_photos_itemId_sortOrder_idx" ON "item_photos"("itemId", "sortOrder");

-- AddForeignKey
ALTER TABLE "item_photos" ADD CONSTRAINT "item_photos_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move existing photos (id built from md5: gen_random_uuid() is missing on PostgreSQL < 13).
INSERT INTO "item_photos" ("id", "itemId", "url", "sortOrder")
SELECT (SELECT substr(h,1,8) || '-' || substr(h,9,4) || '-4' || substr(h,14,3) || '-a' || substr(h,18,3) || '-' || substr(h,21,12)
        FROM md5("id" || ':photo') AS h),
       "id", "photoUrl", 0
FROM "items"
WHERE "photoUrl" IS NOT NULL;

-- AlterTable
ALTER TABLE "items" DROP COLUMN "photoUrl";
