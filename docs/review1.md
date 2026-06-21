# Code Review 1 — Wahabox (Virtual PO Box)

**Scope:** Whole-codebase security and correctness audit.
**Date:** 2026-06-21
**Reviewer:** OpenCode (code-reviewer)
**Recommendation:** Request Changes

---

## Summary

Wahabox is a zero-knowledge, E2E-encrypted PO box app. The client-side crypto
(`lib/crypto.ts`), the server-blind message model, the authorization scoping on
box/message routes, and the email-at-rest encryption are all implemented
correctly and faithfully to the spec. The core promise — *the server never sees
message plaintext or private keys* — holds.

However, the **account recovery flow has a critical authentication bypass**, and
several brute-force / anti-enumeration defenses described in the implementation
document are weaker than intended or fail open.

---

## CRITICAL

### C1 — `recovery-complete` overwrites credentials with zero proof of recovery-code knowledge

**File:** `app/api/auth/recovery-complete/route.ts:34-52`

The endpoint accepts a `username` plus attacker-suppliable `newAuthVerifier` /
`newEncPrivPw` / salts and **blindly overwrites** the user's password
credentials. The recovery code is only ever checked *client-side*
(`app/(public)/recover/page.tsx:51` unwraps `encPrivRec`); the server receives no
proof. Compare with `app/api/account/password/route.ts:90`, which correctly
verifies `currentAuthVerifier` before mutating.

**Impact:** Any unauthenticated attacker who knows a username can:

- Reset the victim's password verifier → log in and obtain a valid session.
- With that session: delete all boxes/messages, rotate slugs, set a notification
  email, read metadata.
- Permanently lock the legitimate owner out of the password path (DoS).

They *cannot* read existing message plaintext (the X25519 public key is untouched
and they cannot produce the real private key), so message confidentiality holds —
but this is a full takeover of the management surface plus data destruction.

**Fix:** Require server-verifiable proof of recovery-code possession. Cleanest
given the existing data model: `recovery-start` issues a random challenge sealed
to the user's stored `public_key` (`crypto_box_seal`); `recovery-complete` must
return the decrypted challenge, proving the client recovered the private key.
Bind that proof to a short-lived server-issued token.

---

## HIGH

### H1 — Username enumeration via the salts endpoint

**File:** `app/api/auth/salts/route.ts:12-14,33,44`

`dummySalt()` returns fresh `crypto.randomBytes` on every call. An existing user
returns the *same* `pwKdfSalt`/`authSalt` on repeated requests; a nonexistent
user returns *different* salts each time. Requesting twice and diffing reliably
enumerates usernames — directly defeating the Phase 4 anti-enumeration goal.

Dummy salts must be deterministic per-username (e.g.
`HMAC(SERVER_SECRET, username)`). Note `recovery-start:56` (404 "User not found")
and `signup:43` (409 "Username already taken") also leak existence via distinct
status/messages.

### H2 — Brute-force lockout bypass through `recovery-start`

**File:** `app/api/auth/recovery-start/route.ts:59`

`recovery-start` calls `clearFailures(username)` for any *existing* user without
proving recovery-code knowledge. Since the exponential-backoff lockout triggers
only at `failCount >= 3` (`lib/rate-limit.ts:94`), an attacker can interleave
2 failed logins → `recovery-start` (resets counter) → repeat, so lockout/backoff
never fires. The strongest auth defense is neutralized (sliding-window limits
still apply, but those are the weaker layer). `clearFailures` should only run on
genuine authentication success.

### H3 — Redis is permanently disabled after one transient error → defenses fail open

**File:** `lib/redis.ts:20-23`

The `error` handler sets `enabled = false` permanently with no re-enable path. A
single network blip disables Redis for the process lifetime, and every consumer
fails open:

- `slidingWindow` returns "not limited" (`lib/rate-limit.ts:37`)
- `verifyAndConsumeCsrfToken` returns `true` (`lib/csrf.ts:60`)
- `consumeChallenge` returns `true` (`lib/pow.ts:46`)

Net effect: rate limiting, CSRF single-use, and PoW silently switch off until
restart. Add reconnection / half-open recovery, and reconsider fail-open for CSRF.

### H4 — No rate limit on email verification sends (mailbomb)

**File:** `app/api/account/email/route.ts:48-94`

`PUT` (set email) and `POST` (resend) call `sendVerificationEmail` with no rate
limiting. An authenticated user can spam verification mail to an arbitrary
address. Phase 9 explicitly requires "Re-sending verification is rate-limited."

---

## IMPROVEMENTS

### I1 — CSRF tokens are not bound to the session/user

**Files:** `app/api/csrf/route.ts:19`, `lib/csrf.ts:16`

Tokens are unauthenticated and unbound — any party can
`GET /api/csrf?tag=login` and obtain a valid token. The token therefore provides
no independent CSRF protection; the app relies entirely on `SameSite=Strict`.
Bind tokens to the session id in the HMAC payload.

### I2 — Internal error messages leaked to clients

**File:** `lib/response.ts:35-38`

Returns raw `err.message` with HTTP 500 (DB errors,
`"SESSION_SECRET is not set"`, etc.). Return a generic message and log details
server-side. Phase 12 calls for metadata minimization.

### I3 — `timingSafeEqual` can throw on length mismatch

**File:** `lib/csrf.ts:50`

Not guarded; a forged signature of different length throws `RangeError`
(uncaught here). Compare lengths first, like `app/api/auth/login/route.ts:21`.

### I4 — `stripNulls` makes nullable PATCH fields impossible to clear

**File:** `lib/validation.ts:120-130`

Strips nulls before validation, so `expiresAt: null` / `maxMessages: null` /
`greeting: null` become `undefined` and are dropped in
`app/api/boxes/[id]/route.ts:33-36`. Users can never reset an expiry/quota/
greeting. Functional bug.

### I5 — PoW is optional and client-controlled; Turnstile silently disabled without keys

**Files:** `app/api/drop/[slug]/route.ts:92`, `lib/pow.ts:25`, `lib/turnstile.ts:13`

`drop` only runs PoW if the client sends the fields, and `pow.ts` trusts
client-supplied `difficulty`. `turnstile.ts` returns `true` when keys are absent.
With a misconfigured prod env, both Phase 11 defenses vanish. Make difficulty
server-bound and require Turnstile config in production.

### I6 — No request body size cap before parsing

**File:** `lib/validation.ts:66`

`ciphertext` has no max length; the 100 KB check
(`app/api/drop/[slug]/route.ts:148`) runs *after* `request.json()` buffers the
whole body → memory DoS. Add a string-length bound in the schema.

### I7 — Session weaknesses

**File:** `lib/session.ts:35,105`

`getSession` compares the HMAC signature with `!==` (non-constant-time). Sessions
are stateless with no server-side revocation or rotation — logout
(`app/api/account/password/route.ts:105`) only clears the cookie, so a captured
token stays valid for 24h. Consider a server-side session store / token version
for revocation.

### I8 — Inconsistent CSRF coverage

`app/api/messages/[id]/route.ts` (PATCH/DELETE) and all `app/api/account/email`
mutating methods lack CSRF checks while `boxes` routes have them. Acceptable
under `SameSite=Strict`, but the inconsistency should be resolved deliberately.

---

## NITPICKS

- `lib/totp.ts:82,103` — modulo bias in MFA recovery codes (`%31`) and 6-digit
  codes (`%10`). Use rejection sampling.
- `lib/env.ts:19` — `validateEnv()` is never called; `SESSION_SECRET` isn't in
  the required list (runtime throws keep it fail-closed, but boot-time validation
  is cleaner).
- `lib/crypto.ts:96-100` — doc/comment says "Base32" but implementation is
  Base64URL.
- `prisma/schema.prisma:11` — `username` is a plain unique `String` with
  app-layer lowercasing rather than `citext`; correct today but fragile if a
  future query forgets to normalize.
- `app/api/auth/login/route.ts:11` — `decryptEmail` imported but unused.
- `app/api/auth/signup/route.ts:39-46` — findUnique→create TOCTOU; concurrent
  duplicate usernames 500 instead of a clean 409 (unique constraint preserves
  integrity).
- No index on `messages(poBoxId, createdAt)` for the per-box quota counts in
  `drop`.

---

## Conclusion

The cryptographic core and server-blindness guarantees are sound and
well-executed. But **C1 is a blocking account-takeover / data-destruction bug**
and must be fixed before any deployment, along with the anti-enumeration (H1),
lockout-bypass (H2), and fail-open (H3) issues that undermine the spec's stated
Phase 11 defenses. Once C1–H4 are addressed and the fail-open behaviors are
reconsidered, this is a strong, well-structured codebase.
