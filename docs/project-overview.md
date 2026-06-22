# Project Overview — Wahabox

> **Purpose:** Give agents instant context without exploring the codebase every time.

---

## What Is Wahabox

A **zero-knowledge, end-to-end encrypted Virtual PO Box** web app. Users create PO boxes with secret shareable links. Anyone with the link can submit an encrypted message (sealed with the box owner's X25519 public key). Only the owner can decrypt messages — the server never has access to plaintext messages or private keys.

**Core invariant:** The server must never possess anything that can decrypt a message or a private key. The only exception is the optional email address (server-encrypted at rest for notifications, by explicit design).

---

## Tech Stack

| Layer            | Technology                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Framework        | Next.js 16.2.9 (App Router)                                                               |
| UI               | React 19.2.4, Tailwind CSS v4, shadcn/ui (`base-nova` style on `@base-ui/react`)          |
| Language         | TypeScript 5 (strict)                                                                     |
| Database         | PostgreSQL 17 via Prisma 7 (with `@prisma/adapter-pg`)                                    |
| Cache/Rate-limit | Redis 7 via `ioredis`                                                                     |
| Email            | AWS SESv2 (`@aws-sdk/client-sesv2`)                                                       |
| Client crypto    | `libsodium-wrappers-sumo` (Argon2id, X25519, secretbox, sealed box)                       |
| Server crypto    | Node `crypto` (HKDF-SHA256, ChaCha20-Poly1305 for email-at-rest)                          |
| Auth             | HMAC-signed sessions, WebAuthn/passkeys (`@simplewebauthn`), TOTP (`otplib`), CSRF tokens |
| Password hashing | `bcryptjs` (cost 12) for box passwords; Argon2id for user master keys (client-side)       |
| Validation       | Zod v4                                                                                    |
| Deployment       | Docker (multi-stage standalone build) + nginx + CloudFlare (TLS termination)              |
| Package manager  | pnpm (single-package repo, not a monorepo)                                                |
| Testing          | Vitest 4 (minimal coverage; see `docs/TESTING_PLAN.md`)                                   |

---

## Project Structure

```
wahabox/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout (fonts, Toaster, TooltipProvider)
│   ├── globals.css           # Tailwind v4 theme tokens (amber primary)
│   ├── (public)/             # Unauthenticated surface
│   │   ├── layout.tsx        # Header with Sign In / Get Started
│   │   ├── page.tsx          # Landing page (static)
│   │   ├── signup/           # Multi-step signup with client-side keygen
│   │   ├── login/            # Login + full MFA flow
│   │   ├── recover/          # Account recovery via recovery code
│   │   ├── verify-email/     # Email verification landing
│   │   └── drop/[slug]/      # Public drop form (anonymous encrypted submission)
│   ├── (auth)/               # Authenticated surface (session-gated)
│   │   ├── layout.tsx        # Session gate → redirect to /login if invalid
│   │   ├── dashboard/        # Box list + create/edit (+ [id]/messages viewer)
│   │   └── settings/         # Email, password change, MFA, passkeys
│   └── api/                  # 23 route handlers (see API Reference below)
├── components/               # 3 custom + 17 shadcn/ui primitives
│   ├── app-sidebar.tsx       # Authenticated nav sidebar + logout
│   ├── turnstile-widget.tsx  # Cloudflare Turnstile CAPTCHA widget
│   ├── session-key-sync.tsx  # Syncs private key across tabs/refreshes
│   └── ui/                   # shadcn primitives + custom editors (markdown, md-editor)
├── hooks/
│   └── use-mobile.ts         # Viewport <768px detection (shadcn standard)
├── lib/                      # 23 source files (server utils, client hooks, crypto)
│   ├── __tests__/            # Only 2 test files (crypto.test.ts, session-keys.test.ts)
│   └── ...                   # See Lib Module Reference below
├── prisma/
│   └── schema.prisma         # 4 models: User, PoBox, Message, PasskeyCredential
├── docs/                     # This file + TESTING_PLAN + implementation spec + reviews
├── middleware.ts             # Security headers (CSP in prod, HSTS, etc.)
├── instrumentation.ts        # Boot-time env validation
├── Dockerfile / Dockerfile.dev
├── docker-compose.yml / docker-compose.dev.yml
├── Caddyfile.dev (dev only)
└── Config: package.json, tsconfig.json, next.config.ts, vitest.config.ts,
            eslint.config.mjs, postcss.config.mjs, components.json, prisma.config.ts
```

---

## Architecture

```
User ←→ CloudFlare (HTTPS termination)
              ↓
     VPS Reverse Proxy (apache2/nginx)
              ↓
         Next.js (app server)
          ↙            ↘
    PostgreSQL        Redis
    (persistent)    (rate limits,
                     CSRF tokens,
                     MFA sessions,
                     verification tokens,
                     notification cooldown,
                     PoW challenges,
                     passkey challenges)
```

### Data flow

1. **Signup:** Browser generates X25519 keypair, derives master key from password (Argon2id), splits into auth key + KEK, wraps private key under password KEK and recovery-code KEK, computes auth verifier. Server stores only: public key, wrapped private keys, salts, auth verifier. Password never sent to server.

2. **Login:** Client requests salts → derives master key → computes auth verifier → server compares with `timingSafeEqual` → returns wrapped private key + nonce (client unwraps in browser). If MFA enabled, returns `MFA_REQUIRED` with an MFA session token instead.

3. **Messaging:** Sender gets box public key → seals message with `crypto_box_seal` → POSTs ciphertext → server stores ciphertext bytes (never decrypts) → owner decrypts with private key in browser via `crypto_box_seal_open`.

4. **Recovery:** Server seals a random challenge with the user's public key → client must decrypt it with the recovery-code-derived KEK → proves key possession → server accepts new password.

### Session model

- Cookie `session` (httpOnly, secure in prod, sameSite strict, 24h maxAge)
- Format: `<base64(json)>.<HMAC-SHA256 signature>` signed with `SESSION_SECRET`
- Payload: `{ userId, username, tokenVersion, createdAt }`
- `tokenVersion` is bumped on logout, password change, and recovery → invalidates all existing sessions
- `(auth)/layout.tsx` uses `getSession()` (signature + expiry only, no DB hit)
- API route handlers use `getAuthUser()` → `validateSession()` (signature + expiry + DB `tokenVersion` check)

### Client key storage

- Unwrapped private key stored in **both** `sessionStorage` and `localStorage` (`session:privateKey`, `session:publicKey`)
- `SessionKeySync` component re-hydrates `sessionStorage` from `localStorage` on mount
- `storage` event listener redirects to `/login` if keys are cleared in another tab
- Keys are cleared on logout and password change

---

## Database Schema (Prisma)

```
User (users)
├── id              UUID @id @default(uuid())
├── username        String @unique
├── authVerifier    Bytes        — BLAKE2b hash of auth key (server-side comparison)
├── authSalt        Bytes        — salt for auth verifier
├── publicKey       Bytes        — X25519 public key
├── encPrivPw       Bytes        — private key wrapped by password KEK
├── pwKdfSalt       Bytes        — Argon2id salt (password path)
├── pwNonce         Bytes        — secretbox nonce (password path)
├── encPrivRec      Bytes        — private key wrapped by recovery-code KEK
├── recKdfSalt      Bytes        — Argon2id salt (recovery path)
├── recNonce        Bytes        — secretbox nonce (recovery path)
├── keyVersion      Int @default(1)
├── tokenVersion    Int @default(0)  — session revocation counter
├── emailEncrypted  Bytes?       — ChaCha20-Poly1305 ciphertext
├── emailNonce      Bytes?
├── emailKeyVersion Int?
├── emailVerified   Boolean @default(false)
├── notificationsEnabled Boolean @default(true)
├── mfaEmail        Boolean @default(false)
├── mfaTotp         Boolean @default(false)
├── mfaPasskey      Boolean @default(false)
├── totpSecret      Bytes?
├── totpCreatedAt   DateTime?
├── mfaRecoveryCodes Bytes?      — JSON array of SHA-256 hashes
├── mfaRecoveryCodesCreatedAt DateTime?
├── recoveryCodeCreatedAt DateTime?
├── createdAt       DateTime @default(now())
├── poBoxes         PoBox[]          ──┐
└── passkeyCredentials PasskeyCredential[] ──┐
                                              │
PoBox (po_boxes)                              │
├── id              UUID @id                   │
├── ownerId         UUID @map("owner_id") ─────┘
├── slug            String @unique    — secret drop-link token (16 random bytes base64url)
├── label           String
├── greeting        String?
├── isActive        Boolean @default(true)
├── expiresAt       DateTime?
├── maxMessages     Int?
├── notify          Boolean @default(true)
├── passwordHash    String?           — bcrypt cost 12 (box-level password, not user password)
├── createdAt       DateTime @default(now())
└── messages        Message[] ──┐
                                 │
Message (messages)               │
├── id              UUID @id     │
├── poBoxId         UUID ────────┘
├── ciphertext      Bytes        — output of crypto_box_seal (server never decrypts)
├── isRead          Boolean @default(false)
├── createdAt       DateTime @default(now())
└── @@index([poBoxId, createdAt])

PasskeyCredential (passkey_credentials)
├── id              UUID @id
├── userId          UUID
├── credentialId    Bytes @unique
├── publicKey       Bytes
├── counter         Int @default(0)
├── transports      String?
├── deviceName      String?
├── createdAt       DateTime @default(now())
└── lastUsedAt      DateTime?
```

All cross-user relations are `onDelete: Cascade`. All PKs are UUIDs. No column anywhere stores plaintext passwords, plaintext private keys, or message plaintext.

---

## Lib Module Reference

### Crypto & security primitives

| File              | Exports                                                                                                            | Purpose                                                                                                                                    | Side   | Key details                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `crypto.ts`       | `crypto` object, `KeyPair`, `WrappedKey`                                                                           | Client-side libsodium crypto: Argon2id KDF, X25519 keypairs, secretbox wrap/unwrap, sealed box seal/open, auth verifier, recovery code gen | Client | Argon2id (opslimit=3, memlimit=256MiB), 64B master key → 32B auth + 32B KEK via BLAKE2b                                   |
| `email-crypto.ts` | `encryptEmail`, `decryptEmail`, `clearEmailKey`                                                                    | Server-side email encryption (ChaCha20-Poly1305)                                                                                           | Server | HKDF-SHA256 from `SERVER_MASTER_SECRET`, 12B nonce, 16B auth tag, `KEY_VERSION=1`, key cached in module scope             |
| `csrf.ts`         | `generateCsrfToken`, `storeCsrfToken`, `verifyAndConsumeCsrfToken`                                                 | HMAC-signed single-use CSRF tokens stored in Redis                                                                                         | Server | TTL 180min, `timingSafeEqual` signature check, Redis key `csrf:<sha256(token)>`, optionally bound to session via `bindId` |
| `session.ts`      | `createSession`, `getSession`, `validateSession`, `destroySession`, `setSessionCookie`, `clearSessionCookie`       | HMAC-signed stateless sessions with DB `tokenVersion` revocation                                                                           | Server | Cookie `session` (httpOnly, secure prod, sameSite strict, 24h), `destroySession` is a no-op                               |
| `auth.ts`         | `getAuthUser`, `AuthUser`                                                                                          | Thin request gate — reads cookie → validates session → returns user or throws `UnauthorizedError`                                          | Server | Used by all protected API routes                                                                                          |
| `pow.ts`          | `generateChallenge`, `storeChallenge`, `verifyPow`, `consumeChallenge`                                             | Proof-of-work challenges (SHA-256, 16-bit difficulty)                                                                                      | Server | Redis key `pow:<challenge>`, TTL 120s, single-use, `consumeChallenge` fails open                                          |
| `totp.ts`         | `generateTotpSecret`, `getTotpUri`, `verifyTotp`, `generateRecoveryCodes`, `verifyRecoveryCode`, `generateMfaCode` | TOTP 2FA + recovery codes + email MFA codes                                                                                                | Server | 8 recovery codes (16 chars, ambiguity-stripped charset), SHA-256 hashed, rejection sampling for modulo bias               |
| `webauthn.ts`     | `generateRegOptions`, `verifyRegResponse`, `generateAuthOptions`, `verifyAuthResponse`, `getRpId`                  | Passkey registration/authentication via SimpleWebAuthn                                                                                     | Server | Redis key `passkey:challenge:<userId>`, TTL 120s, RP_ID from `APP_URL` hostname                                           |
| `turnstile.ts`    | `verifyTurnstile`                                                                                                  | Cloudflare Turnstile CAPTCHA verification                                                                                                  | Server | Auto-passes in non-prod without keys, fails closed in prod without keys                                                   |

### Infrastructure

| File               | Exports                                                                                                                                                                | Purpose                                                  | Key details                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `prisma.ts`        | `prisma`                                                                                                                                                               | Singleton PrismaClient with `PrismaPg` adapter           | Cached on `globalThis` in dev for HMR survival                                                          |
| `redis.ts`         | `getRedis`, `withRedis`, `closeRedis`                                                                                                                                  | Singleton ioredis client with circuit breaker            | 3 retries, 30s disable on error then auto-reconnect, `withRedis(fn, fallback)` for graceful degradation |
| `env.ts`           | `ENV`, `validateEnv`                                                                                                                                                   | Centralized env accessors + boot validation              | Required: `DATABASE_URL`, `SERVER_MASTER_SECRET`. Prod rejects default `SESSION_SECRET`                 |
| `rate-limit.ts`    | `checkIpRate`, `checkUserRate`, `checkGlobalRate`, `checkAuthRateLimit`, `recordAuthFailure`, `clearFailures`, `checkDropRateLimit`, `getDropIpCounts`, `recordDropIp` | Redis sliding-window rate limiting + exponential lockout | Auth: 30s/5, Drop: 60s/10, Global: 1s/50. Lockout: 30s \* 2^(failures-3) capped 15min. Fails open       |
| `email.ts`         | `sendVerificationEmail`, `sendNewMessageNotification`, `sendMfaCodeEmail`, `checkNotificationRateLimit`                                                                | AWS SES email sending                                    | Singleton SESv2 client, dev mode logs to console, notification cooldown 5min (Redis `notif:<userId>`)   |
| `notifications.ts` | `notifyNewMessage`                                                                                                                                                     | Orchestrates new-message email notification              | Checks notify flags + email verified + rate limit, decrypts email, sends. Errors swallowed              |

### API helpers

| File            | Exports                                                                                                                                            | Purpose                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `errors.ts`     | `ApiError`, `BadRequestError`, `UnauthorizedError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `MfaRequiredError`, `InvalidPasswordError` | Typed error hierarchy with HTTP status codes                                                     |
| `response.ts`   | `success`, `error`                                                                                                                                 | Uniform JSON response envelope: `{success, data}` or `{success, error, code}`                    |
| `validation.ts` | 12 Zod schemas + `parseBody`                                                                                                                       | Input validation for all API routes. Honeypot field for bot detection. Ciphertext max 200K chars |

### Client hooks & utilities

| File                      | Exports                                                | Purpose                                                                     |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `utils.ts`                | `cn`                                                   | Tailwind class merge helper (`twMerge(clsx(...))`)                          |
| `session-provider.tsx`    | `SessionProvider`, `useSession`                        | React context for `{ username }` session state                              |
| `use-csrf.ts`             | `useCsrfToken`                                         | Hook fetching CSRF tokens from `/api/csrf?tag=`                             |
| `session-keys.ts`         | `setSessionKeys`, `getSessionKeys`, `clearSessionKeys` | Private key storage in `sessionStorage` + `localStorage`                    |
| `use-session-key-sync.ts` | `useSessionKeySync`                                    | Cross-tab key sync via `storage` events; redirects to `/login` on key clear |

---

## API Reference

All routes use the response envelope: `{ success: true, data }` or `{ success: false, error, code? }`. MFA-required responses include `mfaToken` and `methods[]`.

### Auth (public)

| Method | Route                         | What                                                               | Auth        | Security                                                                                            |
| ------ | ----------------------------- | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/api/csrf?tag=`              | Issues single-use CSRF token                                       | None        | HMAC-signed, stored hashed in Redis                                                                 |
| POST   | `/api/auth/salts`             | Returns KDF salts for username (dummy salts for unknown users)     | None        | IP rate-limit, anti-enumeration                                                                     |
| POST   | `/api/auth/signup`            | Creates user with client-generated crypto material                 | None        | CSRF + Turnstile + rate-limit                                                                       |
| POST   | `/api/auth/login`             | Verifies credentials, returns wrapped private key or MFA challenge | None        | CSRF + rate-limit + lockout + Turnstile (after 2 fails) + constant-time compare + dummy timing path |
| POST   | `/api/auth/logout`            | Bumps `tokenVersion`, clears cookie                                | Best-effort | No CSRF                                                                                             |
| POST   | `/api/auth/recovery-start`    | Returns recovery-wrapped key + sealed challenge                    | None        | CSRF + rate-limit + dummy timing path                                                               |
| POST   | `/api/auth/recovery-complete` | Verifies decrypted challenge, sets new password                    | None        | CSRF + rate-limit + `timingSafeEqual` + `tokenVersion` bump                                         |
| PUT    | `/api/auth/regen-recovery`    | Replaces account-recovery wrapped key                              | Required    | CSRF, no rate-limit                                                                                 |

### MFA (mfaToken-gated)

| Method | Route                      | What                                                   | Security                                      |
| ------ | -------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| POST   | `/api/auth/mfa/send-email` | Generates + emails 6-digit MFA code                    | 60s cooldown, code stored as SHA-256 hash     |
| POST   | `/api/auth/mfa/verify`     | Verifies email/totp code; passkey returns auth options | Per-method attempt caps, 10 total attempt cap |
| PUT    | `/api/auth/mfa/verify`     | Completes passkey assertion                            | Updates counter + lastUsedAt                  |
| POST   | `/api/auth/mfa/recover`    | Bypass MFA with recovery code                          | 3-attempt cap, SHA-256 hash compare           |

### Account (auth required)

| Method | Route                            | What                                                  | Security                                                       |
| ------ | -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/account/password`          | Returns salts + wrapped private key for re-derivation | —                                                              |
| POST   | `/api/account/password`          | Changes password (constant-time verifier check)       | CSRF + rate-limit + `tokenVersion` bump                        |
| GET    | `/api/account/email`             | Returns masked email + verified/notifications flags   | Email decrypted only for masking                               |
| PUT    | `/api/account/email`             | Sets new email, sends verification                    | CSRF + rate-limit + 30s cooldown                               |
| POST   | `/api/account/email`             | Resends verification email                            | CSRF + rate-limit + 30s cooldown                               |
| DELETE | `/api/account/email`             | Removes email                                         | CSRF                                                           |
| PATCH  | `/api/account/email`             | Toggles notifications                                 | CSRF                                                           |
| POST   | `/api/account/email/verify`      | Verifies email by token                               | Token-gated (Redis hash, single-use)                           |
| GET    | `/api/account/mfa`               | Returns MFA status flags                              | —                                                              |
| POST   | `/api/account/mfa`               | Enable/disable/setup/confirm email/totp/passkey MFA   | TOTP setup secret in Redis 10min, recovery codes returned once |
| POST   | `/api/account/mfa/recovery`      | Regenerates MFA recovery codes                        | Requires TOTP enabled                                          |
| GET    | `/api/account/mfa/passkeys`      | Lists registered passkeys                             | —                                                              |
| POST   | `/api/account/mfa/passkeys`      | Register passkey (setup → confirm two-phase)          | Challenge single-use                                           |
| DELETE | `/api/account/mfa/passkeys/[id]` | Remove passkey (auto-disables flag if last one)       | Ownership check                                                |

### Boxes & messages (auth required, ownership enforced)

| Method | Route                      | What                                                   | Security                      |
| ------ | -------------------------- | ------------------------------------------------------ | ----------------------------- |
| GET    | `/api/boxes`               | Lists owner's boxes with message count + unread flag   | `passwordHash` never returned |
| POST   | `/api/boxes`               | Creates box with random slug; optional bcrypt password | CSRF (`create-box`)           |
| PATCH  | `/api/boxes/[id]`          | Updates fields, rotates slug, sets/removes password    | CSRF (`edit-box`) + ownership |
| GET    | `/api/boxes/[id]/messages` | Lists messages (ciphertext base64)                     | Ownership                     |
| PATCH  | `/api/messages/[id]`       | Marks message read                                     | Ownership                     |
| DELETE | `/api/messages/[id]`       | Deletes message                                        | Ownership                     |

### Drop (public)

| Method | Route              | What                                             | Security                                                                                                                                                                                                         |
| ------ | ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/drop/[slug]` | Returns box label/greeting/publicKey/hasPassword | 404 if missing/inactive/expired/full                                                                                                                                                                             |
| POST   | `/api/drop/[slug]` | Anonymous encrypted message submission           | Rate-limit → box validity → password → CSRF (bound to slug) → Turnstile → PoW (optional) → quotas (box: 20/hr 100/day; IP: 30/hr 200/day) → size cap 100KB → insert. Fire-and-forget notification + IP recording |

---

## Pages

| Route             | Type   | What                                                                    |
| ----------------- | ------ | ----------------------------------------------------------------------- |
| `/                | Server | Landing page (static marketing)                                         |
| `/signup`         | Client | Multi-step: form → keygen → recovery code → confirm → done              |
| `/login`          | Client | Login + MFA flow (email/totp/passkey) + recovery fallback               |
| `/recover`        | Client | Account recovery via recovery code + sealed challenge                   |
| `/verify-email`   | Client | Token verification from URL param                                       |
| `/drop/[slug]`    | Client | Anonymous encrypted message submission form                             |
| `/dashboard`      | Client | Box list (polls 30s), create/edit/rotate/delete, auto-decrypt toggle    |
| `/dashboard/[id]` | Client | Message viewer, decrypt on click, auto-decrypt, mark read, delete       |
| `/settings`       | Client | Email management, password change (crypto re-wrap), MFA setup, passkeys |

---

## Components

### Custom (worth testing)

| Component                | What                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `app-sidebar.tsx`        | Nav sidebar with logout (clears keys, POSTs logout, redirects)   |
| `turnstile-widget.tsx`   | Cloudflare Turnstile script injection + widget lifecycle         |
| `session-key-sync.tsx`   | Invisible component syncing private key across tabs              |
| `ui/markdown-editor.tsx` | Lightweight MD editor with toolbar (insertAtCursor)              |
| `ui/md-editor.tsx`       | Rich MD editor wrapping `@uiw/react-md-editor` with char counter |
| `ui/markdown.tsx`        | Server-side MD renderer (`react-markdown` + `remark-gfm`)        |

### shadcn/ui primitives (no testing needed)

`button`, `input`, `card`, `dialog`, `label`, `badge`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `switch`, `table`, `textarea`, `tooltip`, `dropdown-menu`, `select` — all built on `@base-ui/react` with Tailwind v4.

---

## Environment Variables

| Variable               | Required  | Default                                   | Used in                                           |
| ---------------------- | --------- | ----------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL`         | Yes       | —                                         | Prisma                                            |
| `SERVER_MASTER_SECRET` | Yes       | —                                         | Email encryption (base64, min 32 bytes)           |
| `SESSION_SECRET`       | Prod: yes | `dev-session-secret-change-in-production` | Session/CSRF HMAC signing                         |
| `REDIS_URL`            | No        | `redis://localhost:6379`                  | ioredis                                           |
| `APP_URL`              | No        | `http://localhost:3000`                   | WebAuthn RP ID, email links                       |
| `APP_MODE`             | No        | `development`                             | Dev mode bypasses SES sending                     |
| `NODE_ENV`             | —         | —                                         | CSP enforcement, standalone build                 |
| `AWS_REGION`           | No        | `us-east-1`                               | SES client                                        |
| `SES_FROM_ADDRESS`     | Prod: yes | —                                         | SES sender address                                |
| `TURNSTILE_SITE_KEY`   | No        | —                                         | Turnstile (both keys required together)           |
| `TURNSTILE_SECRET_KEY` | No        | —                                         | Turnstile (both keys required together)           |
| `HOST_PORT`            | No        | `3000`                                    | Docker host port (override if port 3000 is taken) |
| `POSTGRES_PASSWORD`    | No        | `postgres`                                | Docker Compose                                    |

Env validation runs at boot via `instrumentation.ts` → `validateEnv()`.

---

## Redis Key Reference

| Pattern                                            | TTL            | Purpose                                                      |
| -------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `csrf:<sha256(token)>`                             | 180min         | Single-use CSRF tokens                                       |
| `rl:ip:<key>` / `rl:user:<username>` / `rl:global` | sliding        | Rate-limit sorted sets                                       |
| `fail:user:<username>` / `fail:ip:<ip>`            | 900s           | Auth failure counters                                        |
| `fail:last:<username>`                             | 900s           | Lockout timestamp                                            |
| `drop:count:hour:<ip>` / `drop:count:day:<ip>`     | 3660s / 86460s | Drop IP quotas                                               |
| `pow:<challenge>`                                  | 120s           | Proof-of-work challenges                                     |
| `passkey:challenge:<userId>`                       | 120s           | WebAuthn challenges                                          |
| `mfa:<mfaToken>`                                   | 300s           | MFA sessions (userId, methods, verified[], attempt counters) |
| `recovery:challenge:<token>`                       | 300s           | Account recovery challenges                                  |
| `mfa:setup:<userId>`                               | 600s           | TOTP setup secrets                                           |
| `verify:<sha256(token)>`                           | 3600s          | Email verification tokens                                    |
| `email-resend-cooldown:<userId>`                   | 30s            | Email resend cooldown                                        |
| `notif:<userId>`                                   | 300s           | Notification rate limit                                      |

---

## Security Architecture

### Defense in depth

1. **Boot-time env validation** (`instrumentation.ts`) — fails fast on missing/invalid config
2. **Security headers** (`middleware.ts`) — CSP (prod only), HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
3. **Authentication** — HMAC-signed sessions with `tokenVersion` revocation
4. **CSRF** — single-use HMAC-signed tokens bound to action tag (+ optionally session)
5. **Rate limiting** — sliding-window Redis ZSETs with exponential lockout for auth failures
6. **CAPTCHA** — Cloudflare Turnstile on signup, drop, and login (after 2 failures)
7. **Proof-of-Work** — SHA-256 16-bit difficulty (wired but dormant in current drop page)
8. **Anti-enumeration** — deterministic dummy salts, dummy timing paths, generic error messages
9. **Constant-time comparisons** — `crypto.timingSafeEqual` for auth verifier, CSRF, recovery challenge
10. **Ownership enforcement** — all box/message/passkey operations scoped by `ownerId`/`userId`
11. **E2E encryption** — messages sealed with X25519, server never decrypts
12. **Email-at-rest encryption** — ChaCha20-Poly1305 with HKDF-derived key, key versioning
13. **Recovery codes** — rejection sampling (no modulo bias), SHA-256 hashed, ambiguity-stripped charset

### Fail-open vs fail-closed

| System                    | Redis down behavior                                               |
| ------------------------- | ----------------------------------------------------------------- |
| Rate limiting             | **Fails open** (requests allowed) — via `withRedis(fn, fallback)` |
| CSRF verification         | **Fails closed** (verification returns false)                     |
| PoW challenge consumption | **Fails open** (challenge accepted)                               |
| Notifications             | **Fails open** (notification skipped)                             |

### Known security gaps (post-review1 fixes)

These were identified in `docs/review1.md` and fixed in `docs/review1-progress.md` (2026-06-21):

- **CSRF coverage is uneven** — some endpoints (MFA management, message delete, logout) lack CSRF, relying on `sameSite=strict` cookies
- **MFA recovery codes are not single-use** — `verifyRecoveryCode` does membership testing without removing used codes
- **PoW is dormant** — drop page never sends `challenge`/`nonce`; server only checks if present
- **Turnstile test key hardcoded** — drop page uses Cloudflare's always-pass test site key

---

## Deployment

### Development

```bash
docker compose -f docker-compose.dev.yml up -d
# PostgreSQL on 5432, Redis on 6379, Caddy on 443 (tls internal), app on 3000
# App available at https://wahabox.localhost
pnpm prisma migrate deploy
pnpm vitest run
```

Bind-mounts source for HMR. Dev defaults for secrets provided. Postgres/Redis ports exposed to host.

### Production

```bash
docker compose up -d --build
# Multi-stage standalone build, non-root user, prisma migrate deploy at startup
# App exposed on ${HOST_PORT:-3000}, proxied via CloudFlare + VPS reverse proxy
```

`Dockerfile` uses `output: 'standalone'` from `next.config.ts`. Runs as `nextjs:nodejs` (UID/GID 1001). Migrations run automatically on container start.

---

## Testing

**Current state:** 2 test files (`crypto.test.ts`, `session-keys.test.ts`) out of ~40+ source files. No coverage tooling, no test script in `package.json`.

**Plan:** See `docs/TESTING_PLAN.md` for a 7-phase, ~453-test improvement plan (infrastructure → pure unit → light mock → API routes → components → pages → Playwright E2E).

Run existing tests: `pnpm vitest run`

---

## Existing Documentation

| File                                               | Content                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/TESTING_PLAN.md`                             | 7-phase test coverage improvement plan (~453 tests + E2E)               |
| `docs/Virtual PO Box — Implementation Document.md` | Complete build spec (14 phases, crypto algorithms, security invariants) |
| `docs/review1.md`                                  | Security audit (2026-06-21) — found 1 critical, 4 high, 8 improvements  |
| `docs/review1-progress.md`                         | Fix log for review1 — all items implemented                             |
| `DEPLOYMENT.md`                                    | Dev + production deployment guide                                       |
| `README.md`                                        | Default create-next-app readme (not customized)                         |

---

## Key Conventions

- **Path alias:** `@/` → project root (configured in `tsconfig.json`, `vitest.config.ts`, `components.json`)
- **API pattern:** Route handlers export `GET`/`POST`/`PATCH`/`DELETE`, use `getAuthUser()` for auth, `parseBody()` for validation, `success()`/`error()` for responses, throw typed errors from `lib/errors.ts`
- **Client crypto:** Dynamic import `await import('@/lib/crypto')` then `await crypto.ready` before use
- **CSRF pattern:** Client calls `useCsrfToken('tag')` → includes token in request body → server calls `verifyAndConsumeCsrfToken('tag', token)`
- **Session keys:** After login, `setSessionKeys(privateKey, publicKey)` stores in both `sessionStorage` + `localStorage`
- **No server actions:** All mutations via `fetch()` to API routes (no `"use server"` directives)
- **Styling:** Tailwind v4 CSS-based config in `app/globals.css`, shadcn `base-nova` style, amber primary color, `cn()` for class merging
- **Prisma:** All crypto material stored as `Bytes` (PostgreSQL `bytea`), `globalThis` singleton in dev
- **Fonts:** Inter (sans), Source Serif 4 (serif), JetBrains Mono (mono) via `next/font/google`
