# Security Policy

## Reporting a Vulnerability

Wahabox takes security seriously. If you discover a vulnerability, please report it privately through GitHub's advisory system. Do **not** open a public issue.

**Preferred method:** Use the ["Report a vulnerability"](https://github.com/yassinehaddioui/wahabox/security/advisories/new) page to submit a private advisory. This keeps the report confidential while we investigate and prepare a fix.

**What to include:**
- A clear description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept
- The version of Wahabox affected
- Any suggested mitigations, if you have them

### Response Timeline

We will acknowledge your report within 48 hours. Our goal is to ship a patch within 7 days of confirmation. We'll coordinate disclosure with you and credit your contribution in the release notes (unless you prefer to remain anonymous).

### Scope

The following are in scope for our security program:
- Breaks in the zero-knowledge guarantee (server-accessible plaintext)
- Cryptographic weaknesses in key derivation, encryption, or sealing
- Authentication or session bypass
- CSRF, injection, or privilege escalation
- Information disclosure that leaks metadata about users or messages

## Supported Versions

Only the latest minor release receives security patches.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

We follow semantic versioning. When 1.0.0 is released, the 0.x line will enter a deprecation window before end-of-life.

## Security Model

Wahabox is built on a zero-knowledge architecture. All cryptographic operations, key generation, encryption, and decryption, happen client-side in the browser using `libsodium-wrappers-sumo`. The server handles routing, sessions, and persistence but never accesses plaintext messages or private keys.

Messages are end-to-end encrypted and sealed with the recipient's X25519 public key before they leave the sender's browser. The server stores only opaque ciphertexts. Even with full database access, a server operator cannot read message contents. Password-protected boxes derive encryption keys via Argon2id, making offline brute force impractical.

Defense-in-depth measures include HMAC-signed sessions with token-version revocation, single-use HMAC-signed CSRF tokens, sliding-window rate limiting backed by Redis, Cloudflare Turnstile CAPTCHA on submission and auth forms, constant-time comparisons for all cryptographic verifiers, and deterministic anti-enumeration protections. Email notifications, when enabled, are encrypted at rest with ChaCha20-Poly1305 using HKDF-derived keys with versioning support.

For a full walkthrough of the security architecture, see [docs/project-overview.md#security-architecture](docs/project-overview.md#security-architecture).
