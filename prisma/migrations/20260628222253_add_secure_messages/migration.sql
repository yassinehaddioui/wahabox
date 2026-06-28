-- CreateTable
CREATE TABLE "secure_messages" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "ciphertext" BYTEA,
    "msg_nonce" BYTEA NOT NULL,
    "password_hash" TEXT,
    "password_salt" BYTEA,
    "receiver_email" BYTEA,
    "email_nonce" BYTEA,
    "email_key_version" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "auto_destruct" BOOLEAN NOT NULL DEFAULT false,
    "is_destroyed" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secure_messages_sender_id_created_at_idx" ON "secure_messages"("sender_id", "created_at");

-- AddForeignKey
ALTER TABLE "secure_messages" ADD CONSTRAINT "secure_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
