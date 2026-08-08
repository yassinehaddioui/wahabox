-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" DROP NOT NULL,
ALTER COLUMN "actor_username" DROP NOT NULL;
