# Review #1 Fix Progress

**Branch:** `main`  
**Started:** 2026-06-21  
**Completed:** 2026-06-21  
**Review:** `docs/review1.md`
**Status:** ALL FIXES IMPLEMENTED

---

## C1 — recovery-complete bypass ✅

**Approach:** recovery-start issues a random 32-byte challenge sealed with `crypto_box_seal` using the user's `publicKey`. The plaintext challenge is stored in Redis (5 min TTL, keyed by opaque `recoveryToken`). recovery-complete requires `recoveryToken` + `decryptedChallenge`; verifies via `crypto.timingSafeEqual` against Redis, then deletes the key (one-time use). Only then overwrites credentials.

**Files:**

- `app/api/auth/recovery-start/route.ts` — generates sealed challenge, stores in Redis, returns `publicKey` + `sealedChallenge` + `recoveryToken`
- `app/api/auth/recovery-complete/route.ts` — verifies challenge proof via `crypto.timingSafeEqual` + Redis `GETDEL`, increments `tokenVersion` on success
- `lib/validation.ts` — added `recoveryToken` + `decryptedChallenge` to `recoveryCompleteSchema`
- `lib/crypto.ts` — added `openSealed()` returning raw bytes (vs `openMessage` which returns string)
- `app/(public)/recover/page.tsx` — uses `publicKey` from recovery-start, unseals challenge with `openSealed`, sends proof to recovery-complete

---

## H1 — Username enumeration ✅

**Files:**

- `app/api/auth/salts/route.ts` — `dummySalt()` now uses `HMAC(SERVER_MASTER_SECRET, username)` for deterministic per-username fake salts
- `app/api/auth/signup/route.ts` — "Username already taken" → "Registration failed" (generic message)
- `app/api/auth/recovery-start/route.ts` — "User not found" → "Not found" (generic message)

---

## H2 — Lockout bypass ✅

**File:** `app/api/auth/recovery-start/route.ts` — removed `clearFailures(body.username)` call. Only auth-success paths (login, recovery-complete) clear failures now.

---

## H3 — Redis fail-open ✅

**Files:**

- `lib/redis.ts` — replaced permanent `enabled = false` with auto-reconnect after 30s timeout. Process lifetime disable removed.
- `lib/csrf.ts` — `verifyAndConsumeCsrfToken` fallback changed from `true` to `false` when Redis is down

---

## H4 — Email rate limit ✅

**File:** `app/api/account/email/route.ts` — added `checkIpRate` + `checkUserRate` + `checkGlobalRate` to both PUT (set email) and POST (resend) handlers. Window: 300s / max 3 requests.

---

## I1 — CSRF token binding ✅

**Files:**

- `lib/csrf.ts` — `generateCsrfToken(tag, bindId?)` and `verifyAndConsumeCsrfToken(tag, token, bindId?)` accept optional `bindId` parameter, included in HMAC payload
- `app/api/csrf/route.ts` — reads session cookie and passes it as `bindId`
- `app/api/account/password/route.ts` — passes session cookie value to CSRF verify
- `app/api/boxes/[id]/route.ts` — passes session cookie value to CSRF verify

---

## I2 — Error message leakage ✅

**File:** `lib/response.ts` — non-`ApiError` exceptions now return generic `"Internal server error"` instead of raw `err.message`. Real error logged via `console.error`.

---

## I3 — timingSafeEqual length guard ✅

**File:** `lib/csrf.ts` — added `signature.length !== expected.length` guard before `crypto.timingSafeEqual`. Also added try/catch around timingSafeEqual (handles `RangeError` on length mismatch).

---

## I4 — stripNulls preserves nullable fields ✅

**File:** `lib/validation.ts` — removed `stripNulls(body)` call from `parseBody`. Removed the `stripNulls` function entirely. Zod schemas handle nullability natively (fields with `.nullable()` accept null, others reject it with validation error).

---

## I5 — Server-bound PoW + Turnstile enforcement ✅

**Files:**

- `lib/pow.ts` — `verifyPow()` now uses hardcoded `DEFAULT_DIFFICULTY = 16`, removed `difficulty` parameter
- `lib/validation.ts` — removed `difficulty` field from `submitMessageSchema`
- `app/api/drop/[slug]/route.ts` — removed `body.difficulty` check from PoW verification
- `lib/turnstile.ts` — in production mode, returns `false` when Turnstile keys are not configured. In dev mode, returns `true` (convenience).

---

## I6 — Body size bound ✅

**File:** `lib/validation.ts` — added `.max(200_000)` to `ciphertext` in `submitMessageSchema`. Validation runs before `ciphertext` value reaches the route handler's `Buffer.from()`.

---

## I7 — Session fixes ✅

**Approach:** `tokenVersion` field added to User model, incremented on password change, recovery, and logout. Session token includes `tokenVersion`. `validateSession()` checks token version against DB on every request.

**Files:**

- `prisma/schema.prisma` — added `tokenVersion Int @default(0)` to User
- `lib/session.ts` — `createSession` now async (fetches tokenVersion from DB), `getSession` uses `crypto.timingSafeEqual` (formerly `!==`), added `validateSession` which checks DB token version, removed dead `validateToken` stub
- `lib/auth.ts` — uses `validateSession` instead of `getSession` for auth checks
- `app/api/auth/login/route.ts` — awaits async `createSession`, removed unused `decryptEmail` import
- `app/api/account/password/route.ts` — increments `tokenVersion` on password change
- `app/api/auth/logout/route.ts` — increments `tokenVersion` on logout (with auth check)
- `app/api/auth/recovery-complete/route.ts` — increments `tokenVersion` on recovery
- `app/api/auth/mfa/recover/route.ts` — awaits async `createSession`
- `app/api/auth/mfa/verify/route.ts` — awaits async `createSession` (2 occurrences)

---

## I8 — CSRF coverage ✅

**Files:**

- `app/api/messages/[id]/route.ts` — added CSRF verification to PATCH ('message-read' tag) and DELETE ('message-delete' tag) with session binding
- `app/api/account/email/route.ts` — added CSRF verification to PUT ('email-set'), POST ('email-resend'), DELETE ('email-delete'), and PATCH ('email-notifications') with session binding

---

## Nitpicks ✅

- **Modulo bias** (`lib/totp.ts`) — rejection sampling for both recovery codes (31-char charset) and MFA codes (0-9 digits)
- **validateEnv** (`lib/env.ts`) — added `SESSION_SECRET` check in production mode (rejects dev default). Called from `instrumentation.ts` at startup.
- **Base32 comment** (`lib/crypto.ts:96`) — "Base32URL" → "Base64URL"
- **Unused import** (`app/api/auth/login/route.ts`) — removed `decryptEmail` import
- **TOCTOU** (`app/api/auth/signup/route.ts`) — replaced findUnique→create with direct create + P2002 catch
- **Index** (`prisma/schema.prisma`) — added `@@index([poBoxId, createdAt])` on Message

---

## Migration

```sql
-- Add tokenVersion to User
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Add index on messages(po_box_id, created_at)
CREATE INDEX "messages_po_box_id_created_at_idx" ON "messages"("po_box_id", "created_at");
```

---

## Verification

- `tsc --noEmit` — **0 errors**
- `pnpm lint` — **0 errors on changed files** (13 pre-existing warnings in unrelated component files)
- `vitest run` — **11 tests passed**
- Prisma migration created and applied
