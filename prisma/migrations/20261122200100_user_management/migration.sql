-- User management (as in florae): forced password change, last login.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- The first active admin becomes the owner ("главный админ"), who manages users.
UPDATE "users" SET "role" = 'OWNER'
WHERE "id" = (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' AND "active" ORDER BY "createdAt" LIMIT 1);
