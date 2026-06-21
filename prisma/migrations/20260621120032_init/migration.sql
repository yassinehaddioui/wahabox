-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "authVerifier" BYTEA NOT NULL,
    "authSalt" BYTEA NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "encPrivPw" BYTEA NOT NULL,
    "pwKdfSalt" BYTEA NOT NULL,
    "pwNonce" BYTEA NOT NULL,
    "encPrivRec" BYTEA NOT NULL,
    "recKdfSalt" BYTEA NOT NULL,
    "recNonce" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "emailEncrypted" BYTEA,
    "emailNonce" BYTEA,
    "emailKeyVersion" INTEGER,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recoveryCodeCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_boxes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "max_messages" INTEGER,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "po_box_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "po_boxes_slug_key" ON "po_boxes"("slug");

-- AddForeignKey
ALTER TABLE "po_boxes" ADD CONSTRAINT "po_boxes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_po_box_id_fkey" FOREIGN KEY ("po_box_id") REFERENCES "po_boxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
