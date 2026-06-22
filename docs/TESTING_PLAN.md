# Testing Plan — Wahabox

## Current State

- **1 test file** (`lib/__tests__/crypto.test.ts`) out of ~40+ source files
- No coverage tooling, no test script, no DOM environment, no mock infrastructure
- Vitest config scoped to `lib/__tests__/**/*.test.ts` only
- No Playwright or E2E setup

## Decisions

- **Prisma:** Mock entirely with `vi.mock` + typed stubs (no real DB)
- **E2E:** Add Playwright suite for critical end-to-end flows
- **Coverage:** 80% overall enforced threshold (90% lib, 85% API, 70% components, 60% pages)
- **Scope:** All 6 phases + Playwright E2E (Phase 7)

## Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| `lib/` functions | 90%+ | Security-critical, mostly pure |
| `app/api/` routes | 85%+ | Core business logic |
| `components/` (custom) | 70%+ | UI behavior |
| `app/` pages | 60%+ | Heavy mock setup, lower ROI |
| Overall | 80%+ | Enforced via vitest coverage thresholds |

## Total Estimate: ~453 unit/integration tests + 5 E2E specs

---

## Phase 1: Infrastructure Setup

### Install dev dependencies

```
@vitest/coverage-v8
happy-dom
@testing-library/react @testing-library/jest-dom @testing-library/user-event
@playwright/test
```

### Update `vitest.config.ts`

- `coverage`: v8 provider, thresholds (80% overall), include `lib/**`, `app/api/**`, `components/**`, `app/**/page.tsx`, `app/**/layout.tsx`, `middleware.ts`; exclude shadcn `components/ui/**` primitives (except custom ones: `markdown-editor`, `md-editor`)
- `environment`: `happy-dom` for component/page tests via per-file comment `// @vitest-environment happy-dom` or workspace projects; default Node for lib/api
- `setupFiles`: `test/setup.ts`
- `include`: `['lib/__tests__/**/*.test.ts', 'app/api/**/*.test.ts', 'components/**/*.test.ts', 'app/**/*.test.ts', 'test/**/*.test.ts']`
- `globals: true`

### Add `package.json` scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

### Create test support files

- `test/setup.ts` — load env with test-safe defaults (`SERVER_MASTER_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, `APP_URL`, `APP_MODE=development`), import `@testing-library/jest-dom`
- `test/helpers/prisma-mock.ts` — `vi.mock('@/lib/prisma')` factory with typed stubs (`user.findUnique`, `user.create`, `user.update`, `poBox.findMany`, `poBox.create`, etc.), with a `resetPrismaMock()` helper
- `test/helpers/redis-mock.ts` — in-memory Map-based Redis mock implementing `get`, `set`, `del`, `getdel`, `exists`, `ttl`, `expire`, `incr`, `zadd`, `zcard`, `zcount`, `zremrangebyscore`, `multi`/`exec`, with `resetRedisMock()`
- `test/helpers/request.ts` — `createNextRequest(url, { method, body, cookies, headers })` builder
- `test/helpers/fixtures.ts` — data factories: `createUser()`, `createPoBox()`, `createMessage()`, `createPasskeyCredential()` with sensible defaults
- `test/helpers/mock-fetch.ts` — `mockFetch()` helper returning typed response mocks

### Create `playwright.config.ts`

- Base URL `http://localhost:3000`
- `webServer` config to start `next dev` automatically
- Projects: chromium (primary), firefox + webkit (optional)
- Test dir: `test/e2e/`

---

## Phase 2: Pure Unit Tests (~89 tests)

No mocks needed. Highest ROI.

| File | Tests | Priority |
|------|-------|----------|
| `lib/__tests__/errors.test.ts` | ~10 | High |
| `lib/__tests__/utils.test.ts` | ~5 | High |
| `lib/__tests__/validation.test.ts` | ~30 | High |
| `lib/__tests__/env.test.ts` | ~5 | Medium |
| `lib/__tests__/pow.test.ts` | ~8 | High |
| `lib/__tests__/totp.test.ts` | ~15 | High |
| `lib/__tests__/email-crypto.test.ts` | ~8 | High |
| `lib/__tests__/session-pure.test.ts` | ~8 | High |

### What each file covers

- **errors.ts** — Class hierarchy, status codes, default messages, `MfaRequiredError` payload
- **utils.ts** — `cn()` class merging, conditional classes, dedup
- **validation.ts** — All 12 zod schemas (valid/invalid fixtures), `parseBody` with mocked Request
- **env.ts** — `validateEnv` — missing required vars throw, prod with default secret throws, dev defaults
- **pow.ts** — `verifyPow` — known challenge/nonce pairs, wrong nonce, insufficient bits; `generateChallenge` format
- **totp.ts** — `generateRecoveryCodes` shape/count/charset, `verifyRecoveryCode`, `generateMfaCode` (6 digits), `getTotpUri` format, `verifyTotp` with fake timers
- **email-crypto.ts** — Encrypt→decrypt round-trip, wrong key version, tamper detection, `clearEmailKey` reset
- **session.ts (pure half)** — `getSession` — valid signature, expired token, malformed token, wrong secret

---

## Phase 3: Light Mock Unit Tests (~68 tests)

| File | Tests | Key mocks |
|------|-------|-----------|
| `lib/__tests__/response.test.ts` | ~10 | NextResponse |
| `lib/__tests__/csrf.test.ts` | ~12 | Redis mock |
| `lib/__tests__/auth.test.ts` | ~6 | `vi.mock('@/lib/session')` |
| `lib/__tests__/turnstile.test.ts` | ~8 | `vi.stubGlobal('fetch')` |
| `lib/__tests__/session-db.test.ts` | ~8 | Prisma mock |
| `lib/__tests__/notifications.test.ts` | ~8 | Prisma + email + email-crypto mock |
| `lib/__tests__/use-csrf.test.ts` | ~6 | fetch + happy-dom |
| `lib/__tests__/session-provider.test.tsx` | ~4 | RTL |
| `lib/__tests__/middleware.test.ts` | ~6 | NextRequest/NextResponse |

### What each file covers

- **response.ts** — `success` shape, `error` with each `ApiError` subclass, unknown error → 500 + console.error
- **csrf.ts** — `generateCsrfToken` format, `storeCsrfToken` writes hash, `verifyAndConsumeCsrfToken` — valid/invalid/wrong tag/consume-once
- **auth.ts** — `getAuthUser` — valid cookie → returns user, invalid → throws `UnauthorizedError`, no cookie → throws
- **turnstile.ts** — Disabled in dev returns true, enabled + valid token, enabled + invalid token, network error → false
- **session.ts (DB half)** — `createSession` — writes tokenVersion, `validateSession` — revoked token (version mismatch)
- **notifications.ts** — `notifyNewMessage` — notify disabled → no SES call, email unverified → skip, rate limit → skip, happy path
- **use-csrf.ts** — Token fetch on mount, error swallowing, refetch on tag change
- **session-provider.tsx** — Provider renders children, `useSession` returns context value
- **middleware.ts** — Security headers set, CSP only in production, matcher excludes `_next`

---

## Phase 4: API Route Handler Tests (~182 tests)

### Mock pattern for all routes

Mock `@/lib/prisma`, `@/lib/redis` (or `@/lib/rate-limit`, `@/lib/csrf`), `@/lib/auth`, `@/lib/turnstile`, `@/lib/email`, `@/lib/pow`, `@/lib/notifications`, `@/lib/totp`, `@/lib/webauthn`, `@/lib/session`, `@/lib/email-crypto` as needed per route.

### Test structure

`app/api/<route>/route.test.ts` — import `GET`/`POST`/`PATCH`/`DELETE` directly, pass `createNextRequest()`, assert response JSON + status + mocked call sequences.

### Security-critical assertions across all routes

- `passwordHash` never in any response
- Email never returned unencrypted (only `maskedEmail`)
- CSRF tokens are consume-once
- `getAuthUser` enforced on protected routes
- Ownership checks prevent cross-user access
- `tokenVersion` bumped on logout/password change/recovery

### Implementation order (security-critical first)

1. **Auth routes:** signup, login, salts, logout, recovery-start, recovery-complete
2. **MFA routes:** send-email, verify, recover
3. **Account routes:** password, email (+ verify), mfa (+ recovery + passkeys)
4. **Box/message routes:** boxes CRUD, messages, drop (most complex — 20 tests)

### Per-route test estimates

| Route | Key test cases | Est. tests |
|-------|---------------|------------|
| `/api/auth/signup` | Happy path, duplicate user (P2002), CSRF fail, Turnstile fail, rate-limit | ~10 |
| `/api/auth/login` | Success, wrong verifier, unknown user (dummy timing), MFA gate, lockout, Turnstile after 2 fails | ~15 |
| `/api/auth/salts` | Known user returns salts, unknown user returns dummy salt, rate-limit | ~6 |
| `/api/auth/logout` | Best-effort even when unauthed, increments tokenVersion | ~4 |
| `/api/auth/recovery-start` | Known user → sealed challenge, unknown user → dummy path, Redis store | ~8 |
| `/api/auth/recovery-complete` | Challenge match, mismatch, expired token, tokenVersion bump | ~8 |
| `/api/auth/mfa/send-email` | 60s cooldown, dev-mode tolerance, missing email | ~6 |
| `/api/auth/mfa/verify` | POST email/totp/passkey, attempt caps, all-verified → session; PUT passkey assertion | ~15 |
| `/api/auth/mfa/recover` | Valid recovery code, invalid, 3-attempt cap | ~6 |
| `/api/auth/regen-recovery` | Auth required, CSRF, updates fields | ~4 |
| `/api/boxes` | GET never returns passwordHash, POST creates with slug, CSRF | ~10 |
| `/api/boxes/[id]` | Ownership check, rotate slug, password null, redacted response | ~8 |
| `/api/boxes/[id]/messages` | Ownership check, ordering, ciphertext format | ~5 |
| `/api/messages/[id]` | PATCH marks read, DELETE with ownership, cross-user → 404 | ~6 |
| `/api/drop/[slug]` | GET redacts, expired/inactive → 404; POST check ordering (rate-limit → box → password → CSRF → Turnstile → PoW → quotas), honeypot | ~20 |
| `/api/account/password` | GET requires auth, POST verifier check, tokenVersion bump, cookie clear | ~8 |
| `/api/account/email` | GET masks, PUT encrypts + sends verify, POST cooldown, DELETE clears, PATCH toggle | ~15 |
| `/api/account/email/verify` | Valid token, expired token, replay (consume-once) | ~5 |
| `/api/account/mfa` | GET flags, POST TOTP setup/confirm/disable, email requires verified email | ~12 |
| `/api/account/mfa/recovery` | Requires TOTP, returns plain codes once | ~4 |
| `/api/account/mfa/passkeys` | GET list, POST setup/confirm, DELETE with ownership | ~8 |
| `/api/csrf` | Allow-list tags, regex fallback, missing tag | ~5 |

---

## Phase 5: Component Tests (~20 tests)

| File | Tests |
|------|-------|
| `components/__tests__/app-sidebar.test.tsx` | ~5 |
| `components/__tests__/turnstile-widget.test.tsx` | ~6 |
| `components/__tests__/md-editor.test.tsx` | ~4 |
| `components/__tests__/markdown-editor.test.tsx` | ~5 |

### What each file covers

- **app-sidebar.tsx** — Logout clears sessionStorage + POSTs + redirects, active link from pathname
- **turnstile-widget.tsx** — Script injection lifecycle, callback stability
- **md-editor.tsx** — maxLength enforcement, char counter color
- **markdown-editor.tsx** — `insertAtCursor` toolbar actions

---

## Phase 6: Page Integration Tests (~94 tests)

### Mock pattern

`vi.mock('@/lib/crypto')` (return fixed base64 stubs), `vi.stubGlobal('fetch')` per-route, mock `sessionStorage`, mock `@simplewebauthn/browser`, mock `next/navigation` (`useRouter`, `useSearchParams`), mock `sonner` `toast`.

### Implementation order (simplest first)

| Page | Est. tests |
|------|------------|
| `(public)/page.tsx` (smoke) | ~2 |
| `(auth)/layout.tsx` (auth gate) | ~3 |
| `verify-email/page.tsx` | ~4 |
| `signup/page.tsx` | ~10 |
| `recover/page.tsx` | ~8 |
| `drop/[slug]/page.tsx` | ~12 |
| `dashboard/page.tsx` | ~12 |
| `dashboard/[id]/page.tsx` | ~8 |
| `login/page.tsx` | ~15 |
| `settings/page.tsx` | ~20 |

### What each page covers

- **(public)/page.tsx** — Smoke test: render, verify hero text + Links
- **(auth)/layout.tsx** — Auth gate: redirect to `/login` on missing/invalid cookie, `SessionProvider` rendered with username otherwise
- **verify-email/page.tsx** — Token-from-URL → fetch verify → state machine (loading/success/error) + redirect
- **signup/page.tsx** — Multi-step state machine, CSRF fetch, payload shape to `/api/auth/signup`, recovery-code confirmation mismatch
- **recover/page.tsx** — Recovery flow: invalid recovery code, challenge mismatch, success → redirect
- **drop/[slug]/page.tsx** — `solvePow()` pure PoW hasher, `cachedPayloadRef` reuse, honeypot short-circuit, password-error branch
- **dashboard/page.tsx** — `autoDecryptMap` localStorage sync, edit-dialog diff-based PATCH body, polling setup/cleanup
- **dashboard/[id]/page.tsx** — Auto-decrypt effect, decrypt marks message read, delete confirmation
- **login/page.tsx** — MFA step transitions, `finishLogin` sessionStorage write, Turnstile gating after failed attempts, email cooldown
- **settings/page.tsx** — Password-change crypto re-wrap flow, cooldown timer parsing, MFA enable/disable/setup/confirm, recovery-code regen + copy

---

## Phase 7: Playwright E2E Tests

### Setup

`playwright.config.ts` with `webServer` pointing to `pnpm dev`, requires running Postgres + Redis (via `docker-compose.dev.yml`).

### Critical E2E flows

| Test file | Flow | Steps |
|-----------|------|-------|
| `test/e2e/auth.spec.ts` | Signup → Login → Logout | Sign up with new user, verify redirect to dashboard, logout, verify redirect to login |
| `test/e2e/messaging.spec.ts` | Create box → Drop message → Decrypt | Login, create PO box, open drop URL in incognito context, submit encrypted message, verify message appears in dashboard, decrypt with private key |
| `test/e2e/mfa.spec.ts` | MFA enrollment + recovery | Login, enable TOTP MFA, save recovery codes, logout, login with MFA, use recovery code fallback |
| `test/e2e/password-change.spec.ts` | Password change invalidation | Login, change password, verify old session cookie is rejected, login with new password |
| `test/e2e/recovery.spec.ts` | Account recovery | Signup with recovery code, logout, use recovery flow to regain access, verify new password works |

---

## Execution Strategy

| Step | What | Est. tests | Depends on |
|------|------|-----------|------------|
| 1 | Phase 1: Infrastructure | 0 | — |
| 2 | Phase 2: Pure unit tests | ~89 | Phase 1 |
| 3 | Phase 3: Light mock tests | ~68 | Phase 1 |
| 4 | Phase 4: API route tests | ~182 | Phase 1 + helpers |
| 5 | Phase 5: Component tests | ~20 | Phase 1 |
| 6 | Phase 6: Page tests | ~94 | Phase 1 + 5 (RTL patterns) |
| 7 | Phase 7: Playwright E2E | ~5 specs | App running + Docker services |

Phases 2-6 can be parallelized after Phase 1 is complete. Phase 4 (API routes) is the highest-value work — it covers the security-critical server logic. Implement in the order above, verifying each phase passes before moving to the next.

---

## Testability Tier Reference

| Tier | Files | Approach |
|------|-------|----------|
| **A — pure unit, no mocks** | `crypto.ts` (done), `errors.ts`, `utils.ts`, `validation.ts`, `pow.ts` (`verifyPow`), `totp.ts`, `email-crypto.ts`, `env.ts` | Vitest only, real primitives |
| **B — unit with light mocks** | `response.ts`, `session-provider.tsx`, `use-csrf.ts`, `turnstile.ts`, `auth.ts`, `session.ts`, `csrf.ts`, `middleware.ts` | `vi.mock`, `vi.stubGlobal`, `vi.useFakeTimers` |
| **C — needs Redis mock** | `redis.ts`, `rate-limit.ts`, `pow.ts` (store/consume), `webauthn.ts` | In-memory Redis mock |
| **D — integration only** | `prisma.ts`, `email.ts` (SES), `notifications.ts` | Mocked libraries |

---

## Latent Issues to Flag During Testing

- `session.ts::destroySession` is an empty no-op — sessions can only be revoked via `tokenVersion` bumps
- `csrf.ts::storeCsrfToken` swallows all Redis errors silently
- `turnstile.ts::isEnabled` caches state into a module-level variable on first call — tests must import fresh or overwrite
- `webauthn.ts::RP_ID` is computed at module load from `ENV.APP_URL` — env must be set before import
- `email-crypto.ts::emailKey` is module-level cache; use `clearEmailKey()` between tests
- `email.ts::getSes` lazy-inits a module singleton; mock via `vi.mock('@aws-sdk/client-sesv2')`

---

## Security Assertions to Enforce Across All Tests

1. **Unencrypted PII never leaks.** Email addresses are stored encrypted and only returned masked
2. **`passwordHash` is never serialized** in any response — only boolean `hasPassword` flag
3. **CSRF tokens are consume-once** — replay attacks must fail
4. **Rate-limit enforcement ordering** in `drop POST` is correct (rate-limit before body parse)
5. **`timingSafeEqual`** is used for `authVerifier` and recovery challenge
6. **`tokenVersion`** is bumped on logout, password change, recovery — stale cookies rejected
7. **Ownership checks** prevent cross-user access to boxes and messages
8. **`getAuthUser`** enforced on all protected routes
9. **Middleware matcher** excludes `_next`, `__nextjs`, `favicon.ico`
10. **CSP whitelist** tightly couples to QR rendering in settings page
