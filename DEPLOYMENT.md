# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org/) 20.9+ (26+ recommended)
- [pnpm](https://pnpm.io/) (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for dev and production compose stacks)
- [AWS CLI](https://aws.amazon.com/cli/) configured with SES credentials (for email)
- [OpenSSL](https://www.openssl.org/) (for generating secrets)

---

## Quick Start (Development)

### 1. Clone and install

```bash
git clone <repo-url> wahabox
cd wahabox
pnpm install
```

### 2. Generate secrets

```bash
openssl rand -base64 32   # → SERVER_MASTER_SECRET
openssl rand -hex 32      # → SESSION_SECRET
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the secrets you generated:

```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wahabox?schema=public"
REDIS_URL="redis://localhost:6379"
SERVER_MASTER_SECRET="<paste base64 secret>"
SESSION_SECRET="<paste hex secret>"
SES_FROM_ADDRESS="noreply@yourdomain.com"
AWS_REGION="us-east-1"
APP_URL="https://wahabox.localhost"
```

> AWS credentials are resolved through the [default credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials.html) — env vars, `~/.aws/credentials`, or IAM role. No explicit config file needed.

### 4. Start the dev stack

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL 17** on port 5432
- **Redis 7** on port 6379
- **Caddy** reverse proxy with auto-TLS on port 443 (self-signed cert via `tls internal`)
- **Next.js dev server** (compiled inside Docker) on port 3000

The app is available at **https://wahabox.localhost**.

Apply the database migration:

```bash
pnpm prisma migrate deploy
```

> **Note on Docker volumes:** The dev compose uses named volumes (`node_modules_dev`, `next_build_dev`) to persist dependencies and build cache between container restarts. Run `docker compose -f docker-compose.dev.yml down -v` to reset them.

### 5. Run tests

```bash
pnpm vitest run
```

---

## Local Development (without Docker)

Run dependencies natively, then start the dev server:

```bash
# Start Postgres + Redis however you prefer (Homebrew, etc.)
brew services start postgresql
brew services start redis

# Apply migrations
pnpm prisma migrate deploy

# Start dev server
pnpm dev
```

App is available at **http://localhost:3000** (no HTTPS — runs on plain HTTP locally without Caddy).

---

## Production Deployment

### 1. Set up production environment variables

Create a `.env` file (or your hosting platform's secret manager) with:

```ini
NODE_ENV=production
DATABASE_URL="postgresql://postgres:<password>@postgres:5432/wahabox?schema=public"
REDIS_URL="redis://redis:6379"
SERVER_MASTER_SECRET="<base64 secret>"
SESSION_SECRET="<hex secret>"
SES_FROM_ADDRESS="noreply@yourdomain.com"
AWS_REGION="us-east-1"
APP_URL="https://yourdomain.com"
POSTGRES_PASSWORD="<postgres password>"
```

> **Important:** The `.env` file is gitignored by default. Never commit secrets.

### 2. Build and deploy with Docker Compose

```bash
docker compose up -d --build
```

This starts the production stack:
- **PostgreSQL 17** with persistent volume
- **Redis 7** with persistent volume
- **Next.js standalone server** built from the multi-stage `Dockerfile`, listening internally on port **3000**

> The production `Dockerfile` builds with `output: 'standalone'` for a minimal runtime image (~150 MB). The migration runs automatically at startup via `prisma migrate deploy`.

### 3. Set up AWS SES

1. Verify your domain or sender email in the [SES Console](https://console.aws.amazon.com/ses/).
2. If you're in the SES sandbox, verify each recipient email, or request production access.
3. Configure IAM credentials with `ses:SendEmail` permission.

AWS credentials are resolved through the [default credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials.html).

### 4. Verify email flow

After deployment, sign up, add an email in account settings, and confirm the verification email arrives. Check `/api/account/email/verify` accepts the token from the link.

---

## Architecture Overview

```
User ←→ CloudFlare (HTTPS termination)
              ↓
     VPS Reverse Proxy (apache2/nginx)
              ↓
         Next.js (app server)
          ↙            ↘
    PostgreSQL        Redis
    (persistent)    (rate limits,
                     verification tokens,
                     notification cooldown)
```

- **CloudFlare** terminates HTTPS at the edge. Your domain's DNS points to CloudFlare, which proxies traffic to your VPS.
- **VPS Reverse Proxy** (apache2 or nginx) forwards incoming HTTP requests to the Next.js app on `localhost:${HOST_PORT:-3000}`.
- **PostgreSQL** stores all persistent data (users, PO boxes, encrypted messages).
- **Redis** holds ephemeral state: rate-limit counters, email verification tokens (1-hour TTL), notification cooldowns, and PoW challenges.
- **Email** is sent through Amazon SES. The plaintext email is decrypted in-memory only at send time.

---

## Reverse Proxy Configuration

The Docker Compose stack only runs the app server internally on port 3000, mapped to `${HOST_PORT:-3000}` on the host. You need a reverse proxy on your VPS to route external traffic to it. CloudFlare handles HTTPS termination upstream, so your proxy only needs to listen on port 80.

> **Port note:** If you set `HOST_PORT=3001` (or any other value), replace `3000` with that port in the examples below.

### nginx

Install nginx, then create a server block:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### apache2

Enable the proxy modules, then create a virtual host:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

Enable the site and reload:

```bash
sudo a2enmod proxy proxy_http
sudo a2ensite yourdomain.com.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
```

---

## Key Commands

| Action | Command |
|---|---|
| Start dev stack | `docker compose -f docker-compose.dev.yml up -d` |
| Stop dev stack | `docker compose -f docker-compose.dev.yml down` |
| Reset dev volumes | `docker compose -f docker-compose.dev.yml down -v` |
| View dev logs | `docker compose -f docker-compose.dev.yml logs -f app` |
| Run migrations | `pnpm prisma migrate deploy` |
| Create migration | `pnpm prisma migrate dev --name <name>` |
| Run tests | `pnpm vitest run` |
| Start production | `docker compose up -d --build` |
| Stop production | `docker compose down` |

## Security Notes

- The server **never** holds anything that can decrypt a message or private key.
- The optional email address is encrypted at rest with `SERVER_MASTER_SECRET` — server-readable by design so it can send notifications.
- All user-facing crypto (Argon2id key derivation, X25519 keypairs, secretbox encryption) runs in the browser via libsodium.
- Rate limiting uses Redis sliding windows with per-IP, per-username, and global tiers.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Strict`.
