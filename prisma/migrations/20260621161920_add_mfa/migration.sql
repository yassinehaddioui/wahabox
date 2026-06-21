-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfaEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaPasskey" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaRecoveryCodes" BYTEA,
ADD COLUMN     "mfaRecoveryCodesCreatedAt" TIMESTAMP(3),
ADD COLUMN     "mfaTotp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpCreatedAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" BYTEA;

-- CreateTable
CREATE TABLE "passkey_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" BYTEA NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "device_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credentials_credential_id_key" ON "passkey_credentials"("credential_id");

-- AddForeignKey
ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
