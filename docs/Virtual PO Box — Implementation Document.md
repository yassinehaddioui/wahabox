> **Note:** This is a pre-implementation blueprint from the original build. Several details diverge from the actual implementation. See [`project-overview.md`](./project-overview.md) for the current, accurate specification.

# Virtual PO Box — Implementation Document

This is the complete, build-ready specification. It's broken into small, sequential phases. Each phase has a goal, explicit steps, and a **Definition of Done** you must pass before moving on. Don't skip ahead — later phases assume earlier ones are complete and verified.

**The one rule that governs everything:** the server must never possess anything that can decrypt a _message_ or a _private key_. The single exception, made deliberately and explicitly, is the **optional email address**, which is encrypted at rest with a server-held secret so the server can send offline notifications. That email is _server-readable by design_; everything else is _server-blind_.

---

## A note on `SERVER_MASTER_SECRET`

Email encryption uses a single high-entropy secret loaded from an environment variable, `SERVER_MASTER_SECRET`. This is simpler than a KMS and fine to start with, but understand its limits and treat it accordingly:

- It must be **≥ 32 bytes of CSPRNG output**, base64-encoded, and generated once (e.g. `openssl rand -base64 32`).
- It is loaded **only from the environment**, never committed, never logged, never in the database. A database dump alone must remain useless without it.
- Anyone with both the database **and** this env var can read all stored emails — so the secret's blast radius is total for email PII. Keep it out of source control, CI logs, error trackers, and crash dumps.
- Plan ahead for rotation: store a small `email_key_version` with each encrypted email so you can migrate to a new secret (or a real KMS) later without guesswork.

This only ever protects the optional email. It has nothing to do with messages or private keys, which the server cannot decrypt under any circumstances.

---

## Phase 0 — Project Setup & Ground Rules

**Goal:** A running skeleton with the security baseline wired in before any feature exists.

**Steps:**

1. Pick your stack. Recommended: a backend with first-class libsodium bindings (Node.js + `libsodium-wrappers`, or Python + `pynacl`), PostgreSQL, and Redis for rate-limiting and ephemeral counters.
2. Set up the frontend to load **libsodium in the browser** (`libsodium-wrappers`). All user-facing crypto happens here.
3. Enforce **HTTPS/TLS 1.3 in every environment** from day one (use mkcert locally). Never develop crypto features over plain HTTP.
4. Create `dev`, `staging`, and `prod` environments with separate secrets and databases.
5. Generate `SERVER_MASTER_SECRET` (`openssl rand -base64 32`) and load it from the environment. Confirm it is **not** committed anywhere.

**Definition of Done:**

- [ ] App boots and serves a page over HTTPS.
- [ ] libsodium loads and runs in the browser (test with `sodium.crypto_box_keypair()`, then delete the test code).
- [ ] PostgreSQL and Redis are reachable from the backend.
- [ ] `SERVER_MASTER_SECRET` loads from the environment; no secrets are in version control.

---

## Phase 1 — Database Schema

**Goal:** All tables exist with correct columns and constraints. No logic yet.

**`users`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | server-generated |
| `username` | citext, unique | case-insensitive unique |
| `auth_verifier` | bytea | hash of the client's `auth_key` |
| `auth_salt` | bytea | salt for `auth_verifier` |
| `public_key` | bytea | X25519 public key |
| `enc_priv_pw` | bytea | private key wrapped by `KEK_pw` |
| `pw_kdf_salt` | bytea | Argon2id salt (password path) |
| `pw_nonce` | bytea | secretbox nonce (password path) |
| `enc_priv_rec` | bytea | private key wrapped by `KEK_rec` |
| `rec_kdf_salt` | bytea | Argon2id salt (recovery path) |
| `rec_nonce` | bytea | secretbox nonce (recovery path) |
| `key_version` | int, default 1 | for future client KDF changes |
| `email_encrypted` | bytea, nullable | optional. Encrypted with `SERVER_MASTER_SECRET`-derived key. **Server-readable by design.** |
| `email_nonce` | bytea, nullable | nonce for the email ciphertext |
| `email_key_version` | int, nullable | which server secret version encrypted it |
| `email_verified` | bool, default false | |
| `notifications_enabled` | bool, default true | account-level master toggle |
| `recovery_code_created_at` | timestamptz | |
| `created_at` | timestamptz | |

**`po_boxes`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | internal only, never exposed |
| `owner_id` | uuid FK → users | |
| `slug` | text, unique | the secret link token |
| `label` | text | owner-facing name |
| `is_active` | bool, default true | kill switch |
| `expires_at` | timestamptz, nullable | optional auto-disable |
| `max_messages` | int, nullable | optional quota |
| `notify` | bool, default true | per-box notification toggle |
| `created_at` | timestamptz | |

**`messages`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `po_box_id` | uuid FK → po_boxes | |
| `ciphertext` | bytea | output of `crypto_box_seal` |
| `is_read` | bool, default false | |
| `created_at` | timestamptz | |

**Definition of Done:**

- [ ] All tables migrate cleanly up and down.
- [ ] `username` and `slug` have unique indexes.
- [ ] There is **no** column anywhere for a plaintext private key, plaintext password, or message plaintext. Read the schema line by line to confirm.
- [ ] The only server-decryptable PII is `email_encrypted`, and its key comes from the environment, not the DB.

---

## Phase 2 — Client Crypto Module (the heart of the system)

**Goal:** One audited, well-tested browser-side module that performs all user crypto. Build and test it in isolation **before** any account feature. Everything later calls into it.

**Functions to implement (exact parameters):**

1. **`deriveMasterKey(password, salt)`** → Argon2id (`crypto_pwhash`), opslimit ≥ 3, memlimit ≥ 256 MiB, algorithm = Argon2id. Returns 64 bytes.
2. **`splitMasterKey(masterKey)`** → HKDF-split into `auth_key` (32 B) and `KEK_pw` (32 B) using distinct info labels (`"auth"`, `"kek"`).
3. **`deriveRecoveryKey(recoveryCode, salt)`** → Argon2id over the recovery code → `KEK_rec` (32 B).
4. **`generateKeypair()`** → `crypto_box_keypair()` → `{publicKey, privateKey}` (X25519).
5. **`wrapPrivateKey(privateKey, kek)`** → fresh random nonce + `crypto_secretbox`. Returns `{ciphertext, nonce}`.
6. **`unwrapPrivateKey(ciphertext, nonce, kek)`** → `crypto_secretbox_open`. **Throws** on wrong key/tamper.
7. **`generateRecoveryCode()`** → 16 random bytes → grouped Base32 (`XXXX-XXXX-XXXX-XXXX-...`).
8. **`sealMessage(plaintext, recipientPublicKey)`** → `crypto_box_seal`. Returns ciphertext.
9. **`openMessage(ciphertext, publicKey, privateKey)`** → `crypto_box_seal_open`.
10. **`computeAuthVerifier(authKey, salt)`** → hash `auth_key` for server storage/comparison.

**Definition of Done:**

- [ ] Round-trip tests pass: wrap→unwrap returns the original key; seal→open returns the original message.
- [ ] `unwrapPrivateKey` **throws** with the wrong KEK (no silent garbage).
- [ ] The same private key wraps under both `KEK_pw` and `KEK_rec` and unwraps with **either**.
- [ ] All randomness is from `crypto.getRandomValues` (grep: zero `Math.random`).
- [ ] No function here ever talks to the server. It's pure crypto.

---

## Phase 3 — Account Signup

**Goal:** A user creates an account with username + password and receives a recovery code. The server stores only ciphertext + verifier.

**Steps (all derivation in the browser):**

1. User enters `username` + `password`.
2. Client generates random `pw_kdf_salt`, `auth_salt`, `rec_kdf_salt`.
3. `masterKey = deriveMasterKey(password, pw_kdf_salt)` → split into `auth_key`, `KEK_pw`.
4. `keypair = generateKeypair()`.
5. `recoveryCode = generateRecoveryCode()` → `KEK_rec = deriveRecoveryKey(recoveryCode, rec_kdf_salt)`.
6. `enc_priv_pw = wrapPrivateKey(privateKey, KEK_pw)`; `enc_priv_rec = wrapPrivateKey(privateKey, KEK_rec)`.
7. `auth_verifier = computeAuthVerifier(auth_key, auth_salt)`.
8. **Display the recovery code once**, then force a confirmation step: the user must re-type it correctly before the account is finalized. No skipping.
9. POST to `/auth/signup`: `username`, `auth_verifier`, `auth_salt`, `public_key`, `enc_priv_pw`, `pw_kdf_salt`, `pw_nonce`, `enc_priv_rec`, `rec_kdf_salt`, `rec_nonce`.
10. Server checks username availability (rate-limited), inserts the row, returns success.

**Definition of Done:**

- [ ] The raw password, recovery code, and plaintext private key **never appear in any network request** (verify in dev tools → Network).
- [ ] An account cannot be created without confirming the recovery code.
- [ ] The DB row holds only ciphertext, salts, nonces, verifier, and public key.
- [ ] Duplicate username is rejected cleanly.

---

## Phase 4 — Login

**Goal:** Authenticate by username + password; the client recovers the private key into memory only.

**Steps:**

1. User enters `username` + `password`.
2. Client requests `pw_kdf_salt` + `auth_salt` for that username. **Anti-enumeration:** if the username doesn't exist, return realistic dummy salts and still run the full path so timing is identical.
3. Client derives `masterKey` → `auth_key`, `KEK_pw`; computes `auth_verifier`.
4. POST `auth_verifier` to `/auth/login`. Server compares in **constant time**.
5. On success, server returns `enc_priv_pw` + `pw_nonce` and sets a session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`).
6. Client `unwrapPrivateKey(...)` → holds the private key **in memory only** (a variable, never storage).
7. On logout/timeout, overwrite the variable and drop the session.

**Definition of Done:**

- [ ] Wrong password fails; right password succeeds.
- [ ] Timing for "nonexistent user" vs "wrong password" is indistinguishable (measure it).
- [ ] The private key is never written to `localStorage`/`sessionStorage`/cookies (verify in dev tools).
- [ ] Idle timeout clears the in-memory key and forces re-login.

---

## Phase 5 — Recovery & Recovery-Code Regeneration

**Goal:** A user who forgot their password regains access via the recovery code, keeping all messages. With email optional, this is usually the **only** lifeline.

**Recovery steps:**

1. User enters `username` + `recoveryCode` + a **new password**.
2. Server returns `enc_priv_rec`, `rec_kdf_salt`, `rec_nonce` (rate-limited + PoW — Phase 11).
3. Client `KEK_rec = deriveRecoveryKey(...)` → `unwrapPrivateKey` → recovers the private key.
4. Client derives a **new** `masterKey` from the new password → new `auth_key`, `KEK_pw`.
5. Client re-wraps the private key → new `enc_priv_pw` + `pw_nonce`; computes new `auth_verifier`.
6. POST new verifier + new wrapped blob to `/auth/recovery/complete`.

**Regeneration steps (while logged in):**

1. With the private key in memory, `generateRecoveryCode()` → new `KEK_rec` → re-wrap → upload new `enc_priv_rec`.
2. Show the new code once (with confirm step); the old code is now dead.

**Definition of Done:**

- [ ] After recovery, the **same public key** is unchanged → all old drop links and messages still work.
- [ ] The old password no longer works; the new one does.
- [ ] Regenerating invalidates the old recovery code.
- [ ] Recovery never transmits the recovery code or private key in plaintext.

---

## Phase 6 — PO Box Creation & Management

**Goal:** Authenticated users create and manage boxes.

**Steps:**

1. `POST /boxes` (auth): server generates a **128-bit CSPRNG slug**, Base64URL-encoded, separate from `id`. Stores `label`, `is_active = true`. Returns `https://app/drop/{slug}`.
2. `GET /boxes`: list the owner's boxes.
3. `PATCH /boxes/{id}`: rename, toggle `is_active` (kill switch), rotate slug (new slug, old link dies), set `expires_at` / `max_messages`, toggle per-box `notify`.

**Definition of Done:**

- [ ] The slug is unguessable, ≥128 bits, and never equals the internal `id`.
- [ ] Rotating the slug kills the old link but keeps the box and its messages.
- [ ] Deactivating a box makes its drop link return 404 (Phase 7).
- [ ] A user can only see/manage their own boxes (authorization check).

---

## Phase 7 — Public Drop Form (anonymous submission)

**Goal:** Anyone with the link can drop an encrypted message. (Abuse defenses arrive in Phase 11; here, build the core flow.)

**Steps:**

1. `GET /drop/{slug}` (public): returns **only** the box `label` + `public_key`. If the slug is unknown/inactive/expired/over-quota, return a generic 404 with **identical timing** to a valid one (tarpit).
2. Visitor types a message in the browser.
3. Client `sealMessage(plaintext, public_key)` → ciphertext.
4. `POST /drop/{slug}`: send only the ciphertext. Server enforces a **max size**, stores it, returns a generic success (no echo of input).
5. Trigger the notification check (Phase 10).

**Definition of Done:**

- [ ] The public endpoint exposes nothing but label + public key — no owner identity, no internal IDs.
- [ ] Plaintext is encrypted **in the browser**; only ciphertext hits the network (verify in dev tools).
- [ ] Oversized payloads are rejected before storage.
- [ ] Unknown vs valid slug responses are timing-identical.

---

## Phase 8 — Reading Messages

**Goal:** The owner decrypts and reads messages client-side.

**Steps:**

1. `GET /boxes/{id}/messages` (auth): returns ciphertexts + metadata (read state, timestamp).
2. Client uses the in-memory private key: `openMessage(...)` for each.
3. `PATCH /messages/{id}` to mark read; `DELETE /messages/{id}` to delete.

**Definition of Done:**

- [ ] Decryption happens only in the browser; the server never sees plaintext.
- [ ] A logged-out user (no in-memory key) cannot read anything even with the ciphertext.
- [ ] Owners can only access their own boxes' messages (authorization check).
- [ ] Mark-read and delete work and are owner-scoped.

---

## Phase 9 — Optional Email (server-encrypted at rest, verified before use)

**Goal:** Let users optionally add an email. It's encrypted at rest with a key derived from `SERVER_MASTER_SECRET` (so a database dump alone is useless), verified before it does anything, and — by explicit design — decryptable by the server so it can send offline notifications.

**How the email key works:**

- At startup, derive a 32-byte symmetric key from `SERVER_MASTER_SECRET` (e.g. HKDF with info label `"email-enc"`). This derived key lives **in process memory only**, never in the DB.
- To store an email: generate a fresh nonce, `crypto_secretbox(email, nonce, emailKey)`, store `email_encrypted` + `email_nonce` + `email_key_version`.
- To read it: `crypto_secretbox_open(...)` with the same derived key.

**Steps:**

1. Authenticated user submits an email.
2. Server encrypts it with the derived key + fresh nonce, stores `email_encrypted`, `email_nonce`, `email_key_version`. Sets `email_verified = false`.
3. Server generates a single-use, high-entropy verification token; stores **only its hash**; expires in 15–60 min.
4. Server decrypts the email **once** in memory, sends the verification link, and discards the plaintext immediately.
5. User clicks the link → server hashes the presented token, compares in constant time, sets `email_verified = true`.
6. Until verified, **no email of any kind** is sent except the single verification message.
7. The user can remove the email anytime → hard-delete `email_encrypted`, `email_nonce`, `email_key_version`; notifications stop immediately.

**Hardening:**

- `SERVER_MASTER_SECRET` is loaded only from the environment, never logged, never in error traces or crash dumps.
- The plaintext email exists in memory only transiently during a send and is never logged.
- `email_key_version` lets you rotate the secret later (or migrate to a KMS) by re-encrypting emails under a new key without ambiguity.

**Definition of Done:**

- [ ] Account creation and all core features work **without** an email.
- [ ] The email key is derived from the env var, never stored in the DB — verify rows hold only ciphertext, nonce, and version.
- [ ] A simulated database-only dump yields no readable email (test: try to decrypt a row using only DB contents — must be impossible without the env secret).
- [ ] No notifications are sent to an unverified address.
- [ ] The verification token is stored only as a hash, single-use, and expiring.
- [ ] Re-sending verification is rate-limited (mailbomb protection).
- [ ] Removing an email hard-deletes all stored email fields.

---

## Phase 10 — Notifications (content-free, server-sent)

**Goal:** Tell verified-email owners "you have a message" — nothing more — decrypting the email server-side only at send time.

**Steps:**

1. On a new message, check: does the owner have a **verified** email, `notifications_enabled`, and the box's `notify` flag on? If not, stop silently.
2. If yes, decrypt the email **in memory** (with the env-derived key), send the notification, and **immediately discard** the plaintext.
3. The body says only: _"You have a new message in your PO Box '{label}'."_ + a login link. **No** content, length, sender, or precise count.
4. Offer per-box enable/disable and optionally a batched digest (which also leaks less timing metadata).

**Hardening:**

- The plaintext email is held only for the send and is **never written to logs, queues, or error traces.** On failure, log an opaque user ID + error code — never the address.
- If sends go through a background queue, the payload carries only the **user ID**; the worker decrypts at send time, so the address never sits in the queue.
- Rate-limit outbound mail per account so a flood of messages can't be weaponized to mailbomb the owner. A digest or "max one notification per X minutes" cap handles this.

**Definition of Done:**

- [ ] No plaintext or message metadata beyond the box label leaves via email.
- [ ] The email address never appears in any queue payload, log, or error trace (grep them).
- [ ] Disabling notifications (account-level or per-box) stops them immediately.
- [ ] Owners with no verified email get nothing, silently.
- [ ] Outbound mail is rate-limited per account.

---

## Phase 11 — Brute-Force & Bot Defenses

**Goal:** Harden every sensitive endpoint, applied as consistent middleware.

**Authentication endpoints (`/auth/login`, `/auth/recovery/start`):**

1. **Layered rate limits** in Redis: per-username, per-IP, and a global circuit breaker (token bucket / sliding window).
2. **Exponential backoff + temporary lockout** after consecutive failures on a username.
3. **Proof-of-work** that escalates with suspicion (cheap when clean, heavy after failures).
4. **CAPTCHA escalation** (Turnstile/hCaptcha) after N failures or from flagged ASNs. **Do not block Tor** — use PoW/CAPTCHA instead, to preserve anonymity.
5. High-cost **Argon2id** as the baseline brute-force tax.

**Public drop endpoint (`/drop/{slug}`):**

1. **Mandatory CAPTCHA + client-side PoW** before submission.
2. **Layered rate limits** (per-IP, per-box, global), with a stricter limit on invalid submissions.
3. **Per-box quotas** (messages/hour/day, max unread backlog).
4. **Honeypot field** as a cheap bot filter.
5. **Strict ciphertext size cap**, server-enforced.

**Definition of Done:**

- [ ] Scripted rapid logins get throttled, then locked, then PoW/CAPTCHA-gated.
- [ ] Flooding a drop link hits rate limits and quotas and is blocked.
- [ ] Tor users can still use the system (with challenges).
- [ ] PoW difficulty is a tunable dial you can raise during an attack.

---

## Phase 12 — Transport, App & Metadata Hardening

**Goal:** Lock down the surrounding application.

**Steps:**

1. **TLS 1.3 only**, HSTS with preload, OCSP stapling.
2. **Strict CSP** — no inline scripts (nonce/hash-based `script-src`), locked `connect-src`, `frame-ancestors 'none'`. This protects the in-memory private key from XSS exfiltration.
3. **Subresource Integrity** on all scripts; pin the libsodium version and review every update.
4. Cookies: `HttpOnly`, `Secure`, `SameSite=Strict`; short sessions with rotation.
5. **CSRF protection** on all authenticated state-changing routes.
6. Full header set: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
7. **Metadata minimization:** keep sender IPs only in a short-TTL Redis store for rate-limiting — **never in durable logs**. Scrub slugs, tokens, verifiers, and `SERVER_MASTER_SECRET` from all logs.
8. **Zeroize** the in-memory private key on logout/timeout.

**Definition of Done:**

- [ ] CSP blocks an injected inline `<script>` (test it).
- [ ] No sender IP, slug, token, or server secret appears in persistent logs (grep them).
- [ ] Security headers score well on an external scanner (e.g. securityheaders.com on staging).
- [ ] Sessions expire and rotate; CSRF tokens are enforced.

---

## Phase 13 — Final Review & Verification

**Goal:** Prove the security claims before launch.

**Steps:**

1. **Server-blindness audit:** with full DB + server-log access (but **without** `SERVER_MASTER_SECRET`), confirm you cannot decrypt a single message or private key — and cannot read any email. Then confirm that even _with_ the secret, messages and private keys remain undecryptable (only emails open up).
2. **Network audit:** replay every flow with dev tools open; confirm no plaintext password, recovery code, private key, or message ever transits.
3. **Brute-force drill:** script attacks against login, recovery, and drop; confirm all defenses fire.
4. **Recovery drill:** forget password, recover via code, confirm old messages decrypt.
5. **Two-tier disclosure** (shown at the point of adding an email, not buried in a ToS):

   > **Message contents: end-to-end encrypted, server-blind.** We cannot read your messages under any circumstances.
   >
   > **Optional email: encrypted at rest, server-readable.** If you provide an email for notifications, it's encrypted in our database with a separate server-held secret, so a database breach alone can't expose it. But our service **can** decrypt it to send you mail, so a full server compromise or a malicious operator could read it. Want zero server-readable contact info? **Don't provide an email** — every feature works without one, and you'll see your unread count on next login.

6. **Loss-path disclosure:** state plainly that losing **both** the password and the recovery code (with no verified email) means permanent, unrecoverable data loss. No back door exists.
7. Commission an **independent review / pen-test** before production.

**Definition of Done:**

- [ ] You personally tried and failed to read a message from the server side (even holding `SERVER_MASTER_SECRET`).
- [ ] A simulated DB-only breach exposes no message contents **and** no readable emails.
- [ ] All network audits show ciphertext-only for passwords, recovery codes, keys, and messages.
- [ ] All Phase 11 defenses verified firing.
- [ ] Recovery round-trip works end to end.
- [ ] Both disclosures are surfaced to users at the right moments.
- [ ] Independent review passed.

---

## The Rules to Re-read Whenever You're Unsure

1. **If the server can read a message or a private key, you've made a mistake.** These exist decrypted only in the user's browser memory. The _only_ server-readable user data is the optional email.
2. **Randomness is always from a CSPRNG** — every key, nonce, salt, slug, and token.
3. **`SERVER_MASTER_SECRET` lives only in the environment** — never in the DB, logs, traces, or source control. It protects emails against a DB-only breach and nothing more.
4. **Confirm-before-finish on the recovery code is non-negotiable.** With email optional, it's often the only lifeline.

---

This is the clean, complete, build-ready document. The most useful next step is making one phase concrete in code — I'd suggest either the **Phase 2 crypto module** fully implemented in JavaScript, or the **Phase 9/10 email encrypt/decrypt + notification** path against `SERVER_MASTER_SECRET`. Which should I write first?
