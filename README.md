# Wahabox

[![License: MIT](https://img.shields.io/github/license/yassinehaddioui/wahabox)](LICENSE)
[![Version](https://img.shields.io/github/v/release/yassinehaddioui/wahabox)](https://github.com/yassinehaddioui/wahabox/releases)
[![CI](https://img.shields.io/badge/CI-Not%20Yet%20Configured-lightgrey)](#)

A zero-knowledge, end-to-end encrypted Virtual PO Box. Create PO boxes with secret shareable links. Anyone with the link can submit an encrypted message (sealed with the box owner's X25519 public key). Only the owner can decrypt messages — the server never has access to plaintext messages or private keys.

For a full overview, see [docs/project-overview.md](docs/project-overview.md).

## Features

- Zero-knowledge architecture — private keys never leave the browser
- End-to-end encryption via X25519 sealed boxes (libsodium)
- Password-protected PO boxes with Argon2id key derivation
- Secret shareable submission links (HMAC-signed URLs)
- WebAuthn/passkeys and TOTP for account authentication
- Cloudflare Turnstile CAPTCHA on submission forms
- Optional email notifications (server-encrypted at rest)
- Rate limiting via Redis
- Self-hostable with Docker

## Architecture

```
User -- Cloudflare (TLS) -- Reverse Proxy -- Next.js -- PostgreSQL
                                            |            Redis
```

The browser performs all cryptographic operations (key generation, encryption, decryption) using `libsodium-wrappers-sumo`. The Next.js server handles routing, sessions, and persistence but never touches plaintext messages or private keys. PostgreSQL stores encrypted payloads and metadata; Redis handles rate limiting, session caching, and CSRF tokens.

For the full architecture diagram and data-flow details, see [docs/project-overview.md](docs/project-overview.md#architecture).

## Tech Stack

| Layer              | Technology                            |
| ------------------ | ------------------------------------- |
| Framework          | Next.js 16 (App Router)               |
| UI                 | React 19, Tailwind CSS v4, shadcn/ui  |
| Language           | TypeScript 5 (strict)                 |
| Database           | PostgreSQL 17 with Prisma 7           |
| Cache / Rate-limit | Redis 7                               |
| Client crypto      | libsodium-wrappers-sumo               |
| Server crypto      | Node crypto (HKDF, ChaCha20-Poly1305) |
| Email              | AWS SES                               |
| CAPTCHA            | Cloudflare Turnstile                  |
| Validation         | Zod v4                                |
| Testing            | Vitest 4                              |
| Deployment         | Docker + nginx                        |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- pnpm (v9+)

## Quick Start

### Self-hosting (one command)

```bash
git clone https://github.com/yassinehaddioui/wahabox.git
cd wahabox
./setup.sh
```

This generates secrets, starts the production Docker stack (PostgreSQL 17, Redis 7, Next.js), and runs database migrations. The app is available at `http://localhost:3000`.

### Development

For local development with hot reload and debug tooling:

```bash
git clone https://github.com/yassinehaddioui/wahabox.git
cd wahabox
cp .env.example .env
./dev.sh up
```

The dev stack adds Caddy with auto-TLS and bind-mounts for HMR. Available at `https://wahabox.localhost`.

## Self-Hosting

For production deployment instructions — including multi-stage Docker builds, nginx reverse proxy configuration, DNS setup, and Cloudflare TLS termination — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation

- [Project Overview](docs/project-overview.md) — architecture, data model, security invariants
- [Deployment Guide](DEPLOYMENT.md) — self-hosting and production setup
- [Security Policy](SECURITY.md) — responsible disclosure and security practices
- [Changelog](CHANGELOG.md) — release history and version notes

## Contributing

Contributions are welcome. Before submitting a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on development workflow, testing requirements, and the code of conduct.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
