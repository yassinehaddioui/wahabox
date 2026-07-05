# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- End-to-end encrypted Virtual PO Box system with X25519 sealed boxes (libsodium)
- Zero-knowledge architecture — private keys generated in-browser and never transmitted
- Anonymous message submission via secret shareable links (HMAC-signed URLs)
- Encrypted vaults for storing passwords, notes, and secrets with Markdown support
- Password protection for both PO boxes and vaults (Argon2id + bcrypt)
- Multi-step signup with client-side key derivation (Argon2id)
- Multi-factor authentication: WebAuthn/passkeys, TOTP codes, and email verification
- Account recovery via backup recovery codes
- Box management dashboard with expiration dates, message caps, and read/unread tracking
- Auto-decrypt and auto-expand for vault items
- Admin dashboard with user and box statistics
- Cloudflare Turnstile CAPTCHA on submission forms
- Rate limiting and CSRF protection via Redis
- Optional email notifications (server-encrypted at rest via ChaCha20-Poly1305)
- Structured error reporting with Discord webhook transport
- Client-side error boundaries with /api/report-error relay
- Middleware-injected request context for tracing and logging
- SEO: JSON-LD structured data, OpenGraph metadata, sitemap, robots.txt, canonical URLs
- Landing page with hero illustration, How It Works flow, feature cards, comparison table, social proof bar, and footer
- Scroll-triggered animations on landing page sections
- Self-hosted deployment with Docker Compose, multi-stage Docker build, and nginx
- Development environment with Caddy auto-TLS and hot reload

### Security

- All crypto operations client-side — server never handles plaintext or private keys
- Secure session management with HMAC-signed cookies
- CSP headers in production with strict source policies
- Input validation via Zod v4 across all API routes
- Password hashing with argon2id (client) and bcrypt cost 12 (server)

[0.1.0]: https://github.com/yassinehaddioui/wahabox/releases/tag/v0.1.0
