-- AlterTable
ALTER TABLE "secure_messages" ADD COLUMN     "sender_public_key_sign" BYTEA,
ADD COLUMN     "signature" BYTEA;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enc_priv_sign_pw" BYTEA,
ADD COLUMN     "public_key_sign" BYTEA,
ADD COLUMN     "sign_nonce_pw" BYTEA;
