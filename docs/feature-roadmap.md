# Feature Roadmap — Wahabox

> Suggested features and improvements identified during codebase audit (July 2026).
> Status indicators: ❌ not started, 🟡 planned/wired but not active, ✅ implemented.

---

## High-Impact Features

### 1. Reply / Reverse Communication
**Priority:** High | **Effort:** Large | **Status:** ❌

Box owners cannot respond to message submitters. The current flow is strictly one-way: a submitter drops an encrypted message into a black hole with no way to receive a response. This is the single biggest UX gap for a product positioned as a "Virtual PO Box."

**Design considerations:**
- Replies must preserve E2E encryption — server never sees reply plaintext
- Could use the submitter's ephemeral keypair (generated in-browser during submission) to seal a reply back
- Submitters would need a way to check for replies (anonymous read link with reply decryption key in URL fragment)
- Alternative: box owner generates a one-time reply link and shares it out-of-band

### 2. File / Attachment Support
**Priority:** High | **Effort:** Large | **Status:** ❌

Messages are text-only. For whistleblowing, tip lines, or confidential contact forms, file support (images, PDFs, documents) is essential.

**Design considerations:**
- Files must be encrypted client-side with the same X25519 sealed box scheme
- Chunking strategy for large files (libsodium sealed box has message size limits)
- Streaming encryption vs. in-memory (browser memory constraints)
- Storage considerations: PostgreSQL bytea vs. object storage (S3/MinIO)
- Max file size limits, per-box storage quotas
- Progress indicators for upload/download

### 3. Message Search ✅
**Priority:** High | **Effort:** Small | **Status:** ✅ Implemented (2026-07-05)

Client-side search across decrypted message content. Case-insensitive substring matching on `plaintext`. Undecrypted messages excluded from results.

### 4. Bulk Operations
**Priority:** High | **Effort:** Medium | **Status:** ❌

No way to select multiple messages for batch actions. Users with 50+ submissions must delete or mark-read one at a time.

**Scope:**
- Checkbox selection on message cards (with select-all)
- Batch mark-as-read
- Batch delete (with confirmation)
- Batch export/download

### 5. Export / Backup
**Priority:** High | **Effort:** Medium | **Status:** ❌

No way to export decrypted messages. Users relying on wahabox for important communication need a backup path.

**Scope:**
- Export single message as Markdown ✅ (already implemented — download button)
- Export all messages in a box as a zip/tarball
- Export as JSON with metadata (timestamps, read status)
- Export vault items
- Scheduled/automatic backup reminders

### 6. API Keys / Programmatic Access
**Priority:** High | **Effort:** Medium | **Status:** ❌

No way for power users to integrate wahabox with their own systems. Adding API key authentication would enable:

- Fetch messages programmatically (CI pipelines, monitoring systems)
- Webhook-like integrations without polling
- Third-party tool integrations
- API key management UI (create, revoke, rotate, scope permissions)

---

## Medium-Impact Features

### 7. Real-Time Notifications
**Priority:** Medium | **Effort:** Medium | **Status:** ❌

Dashboard polls every 30 seconds. No push-based notification for new messages.

**Options:**
- Server-Sent Events (SSE) — simpler than WebSocket, sufficient for one-way notifications
- WebSocket — bidirectional, overkill for this use case
- Consider: encrypted notification payloads (server knows a message arrived but not its content)

### 8. Webhook Notifications
**Priority:** Medium | **Effort:** Small | **Status:** ❌

Only email notifications are supported. Adding webhook support would enable:

- Slack/Discord incoming webhooks for new message alerts
- Custom HTTP webhooks for integration with other services
- Per-box webhook URL configuration
- HMAC signature verification for webhook security

### 9. Custom Submission Forms
**Priority:** Medium | **Effort:** Medium | **Status:** ❌

The drop page has a fixed textarea. No custom fields per box.

**Scope:**
- Box owner defines custom fields: text, select, checkbox, email
- Fields rendered on the drop form
- Custom fields submitted alongside the encrypted message (server sees field metadata, not encrypted content)
- Form preview and validation

### 10. Read Receipts / Delivery Confirmation
**Priority:** Medium | **Effort:** Small | **Status:** ❌

Submitters get zero feedback. The `readAt` timestamp exists server-side but is never exposed to the submitter.

**Design considerations:**
- Anonymous confirmation token returned after submission (stored in URL fragment, never sent to server)
- Submitter can check token against a public endpoint to see if message was read
- Optional: read receipt page at a secret URL

### 11. PWA / Offline Support
**Priority:** Medium | **Effort:** Medium | **Status:** ❌

No service worker, no offline capability. A PWA could cache encrypted messages for offline reading.

**Scope:**
- Service worker with cache-first strategy for app shell
- Offline decryption (all crypto is client-side already)
- Install prompt (Add to Home Screen)
- Push notifications for new messages (requires service worker)
- Offline indicator in UI

### 12. Internationalization (i18n)
**Priority:** Medium | **Effort:** Large | **Status:** ❌

English-only UI. Limits adoption outside English-speaking markets.

**Scope:**
- Internationalization framework (next-intl or similar)
- Extract all user-facing strings
- RTL support (Arabic, Hebrew)
- At minimum: French, Spanish, German, Arabic translations
- Language detection from browser preferences

---

## Lower-Priority Features

### 13. Box Sharing / Team Access
**Priority:** Low | **Effort:** Large | **Status:** ❌

Single owner per box. No way to share a box with a partner or team.

**Design considerations:**
- Each co-owner has their own keypair
- Messages must be encryptable to multiple recipients (sender encrypts once, each owner can decrypt)
- libsodium `crypto_box_seal` is single-recipient — would need `crypto_box` with pre-shared keys or a key-wrapping scheme
- Access control: read-only vs. read-write vs. admin

### 14. Message Threading
**Priority:** Low | **Effort:** Medium | **Status:** ❌

Flat message list with no conversation threading. If replies are implemented (feature #1), threading becomes natural.

### 15. Message Templates
**Priority:** Low | **Effort:** Small | **Status:** ❌

Box owners cannot define a template or structure for submissions.

**Scope:**
- Per-box submission template (Markdown)
- Template rendered as placeholder in the drop form textarea
- Optional: structured template with labeled sections

### 16. Dark Mode Toggle
**Priority:** Low | **Effort:** Small | **Status:** ❌

`next-themes` is installed and the theme system is wired (via Tailwind `dark:` variants), but there may be no user-facing toggle.

**Scope:**
- Add theme toggle to the authenticated sidebar and public header
- Respect system preference by default
- Persist choice in localStorage

### 17. Analytics Dashboard
**Priority:** Low | **Effort:** Medium | **Status:** ❌

No submission trends, peak times, or geographic distribution for box owners.

**Scope:**
- Per-box: submission count over time, unread ratio, average message size
- Global admin: platform-wide stats (already partially in admin dashboard)
- Charts and visualizations

### 18. CI/CD Pipeline
**Priority:** Low | **Effort:** Small | **Status:** ❌

README badge says "Not Yet Configured." No automated test runs on push/PR.

**Scope:**
- GitHub Actions: typecheck → lint → test → build on push/PR
- Coverage reporting
- Automated Docker image builds
- Staging deployments

### 19. Message Auto-Destruct for PO Boxes
**Priority:** Low | **Effort:** Small | **Status:** ❌

The `SecureMessage` model has `autoDestruct` and date-windowing support. Regular PO Box messages lack auto-deletion. For sensitive whistleblower submissions, auto-destruction after reading (or after a time window) would be valuable.

**Design considerations:**
- Per-box auto-destruct setting (after N days, after reading, never)
- Background job to purge expired messages
- Warning UI before enabling (irreversible)

---

## Infrastructure / Resilience

### 20. Test Coverage
**Priority:** High | **Effort:** Large | **Status:** 🟡 Partial

Current: ~68 test files, 1216 passing tests. The `TESTING_PLAN.md` called for ~453 unit/integration + 5 E2E specs. Test infrastructure is in place but coverage across API routes, pages, and components remains uneven.

**Priorities:**
- API route integration tests (highest ROI)
- E2E tests for critical flows (signup → create box → submit → decrypt)
- Increase lib/ coverage to 90%+
- Enforce coverage thresholds in CI

### 21. Proof-of-Work Activation
**Priority:** Medium | **Effort:** Small | **Status:** 🟡 Dormant

Server-side PoW (`lib/pow.ts`) is fully implemented but never triggered. The drop page never generates or sends challenge/nonce fields. Turnstile CAPTCHA is the only anti-bot defense currently active.

**Scope:**
- Implement `solvePow()` in the drop page
- Show progress indicator during PoW computation
- Consider Web Worker for non-blocking PoW solving
- Server-side difficulty adjustment based on load

### 22. Honeypot Field
**Priority:** Low | **Effort:** Trivial | **Status:** ✅ Implemented

The `submitMessageSchema` defines a `honeypot` field (rejects if non-empty), but the drop form never renders a hidden honeypot input. Trivial to add — renders a visually hidden field that bots will fill but humans won't.

---

## Summary by Effort

| Effort | Features |
|--------|----------|
| **Trivial** | ~~Honeypot field~~ ✅, Dark mode toggle |
| **Small** | Read receipts, Webhook notifications, Message templates, CI/CD, Message auto-destruct, PoW activation |
| **Medium** | Bulk operations, Export/backup, API keys, Real-time notifications, Custom forms, PWA, Analytics, Message threading |
| **Large** | Reply system, File attachments, Box sharing, i18n |

## Summary by Priority

| Priority | Features |
|----------|----------|
| **High** | Reply system, File attachments, Bulk operations, Export/backup, API keys, Test coverage |
| **Medium** | Real-time notifications, Webhook notifications, Custom forms, Read receipts, PWA, i18n, PoW activation |
| **Low** | Box sharing, Message threading, Message templates, Dark mode, Analytics, CI/CD, Auto-destruct, Honeypot |
