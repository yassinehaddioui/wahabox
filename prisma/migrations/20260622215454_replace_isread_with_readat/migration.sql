-- AlterTable
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMPTZ(6);

-- Set read_at for already-read messages (best approximation)
UPDATE "messages" SET "read_at" = "created_at" WHERE "is_read" = true;

-- Drop the old column
ALTER TABLE "messages" DROP COLUMN "is_read";
