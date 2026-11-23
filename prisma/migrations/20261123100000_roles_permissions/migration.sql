-- Roles become data: a role is a named set of permissions (catalog in src/auth/permissions.ts).
-- Existing users keep their abilities: OWNER → "Владелец", ADMIN → "Администратор", STAFF → "Сотрудник".

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preset roles (fixed ids so this migration can map users to them).
INSERT INTO "roles" ("id", "name", "isOwner") VALUES
  ('00000000-0000-4000-a000-000000000001', 'Владелец', true),
  ('00000000-0000-4000-a000-000000000002', 'Администратор', false),
  ('00000000-0000-4000-a000-000000000003', 'Сотрудник', false);

INSERT INTO "role_permissions" ("roleId", "permission")
SELECT '00000000-0000-4000-a000-000000000002', p FROM unnest(ARRAY[
  'inventory.view', 'inventory.count', 'inventory.photos',
  'items.create', 'items.edit', 'items.edit_price', 'items.archive', 'items.delete', 'counts.delete',
  'categories.manage', 'audit.view'
]) AS p
UNION ALL
SELECT '00000000-0000-4000-a000-000000000003', p FROM unnest(ARRAY[
  'inventory.view', 'inventory.count', 'inventory.photos'
]) AS p;

-- Users: enum column → role reference.
ALTER TABLE "users" ADD COLUMN "roleId" TEXT;
UPDATE "users" SET "roleId" = CASE "role"
  WHEN 'OWNER' THEN '00000000-0000-4000-a000-000000000001'
  WHEN 'ADMIN' THEN '00000000-0000-4000-a000-000000000002'
  ELSE '00000000-0000-4000-a000-000000000003'
END;
ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";
