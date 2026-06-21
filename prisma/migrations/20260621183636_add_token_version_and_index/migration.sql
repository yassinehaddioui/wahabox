-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "messages_po_box_id_created_at_idx" ON "messages"("po_box_id", "created_at");
