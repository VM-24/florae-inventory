-- Kept as the only statement in this migration: PostgreSQL < 12 cannot add an enum value
-- inside a transaction block, nor use it in the same transaction.
ALTER TYPE "Role" ADD VALUE 'OWNER';
