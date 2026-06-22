# Contributing to Wahabox

Thanks for your interest in contributing. This document covers the basics: how to get the project running, the development workflow, testing requirements, and what we expect in a pull request.

Before contributing, please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

```bash
git clone https://github.com/yassinehaddioui/wahabox.git
cd wahabox
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
pnpm prisma migrate deploy
```

Edit `.env` and generate the required secrets:

```bash
openssl rand -base64 32   # SERVER_MASTER_SECRET
openssl rand -hex 32      # SESSION_SECRET
```

The dev stack starts PostgreSQL 17, Redis 7, a Caddy reverse proxy, and the Next.js dev server. The app will be available at `https://localhost`. Use `./dev.sh` for common operations (`./dev.sh up`, `./dev.sh migrate`, `./dev.sh db`, `./dev.sh logs`).

## Development Workflow

1. Pick or create an issue. If you're tackling something new, open an issue first to discuss the approach.
2. Create a branch from `main`. Use a descriptive name: `fix/rate-limit-redis`, `feat/email-templates`.
3. Make your changes. Keep commits small and focused. Write meaningful commit messages.
4. Run the full check suite before pushing (see PR Checklist below).
5. Open a pull request against `main`. Fill out the PR template if one exists.

## Testing

We use Vitest for unit and integration tests, and Playwright for end-to-end tests.

```bash
pnpm test              # Run the full test suite (vitest run)
pnpm test:watch        # Watch mode for development
pnpm test:coverage     # Run with coverage report
pnpm test:e2e          # Run Playwright E2E tests
pnpm test:e2e:ui       # Playwright UI mode for debugging
```

E2E tests require the dev stack to be running. See [docs/TESTING_PLAN.md](docs/TESTING_PLAN.md) for the complete test strategy and coverage expectations.

## PR Checklist

Before opening a pull request, confirm:

- [ ] Tests have been added or updated for your changes
- [ ] `pnpm lint` passes (ESLint)
- [ ] `pnpm typecheck` passes (TypeScript strict mode)
- [ ] `pnpm format:check` passes (Prettier)
- [ ] `CHANGELOG.md` has been updated with a brief note under the Unreleased section
- [ ] Your branch is up to date with `main`

## Code Style

This project enforces a consistent style through tooling. There is no separate style guide to memorize. Run the checks and let the tools do the work.

- **Prettier** (`pnpm format`) handles formatting. The config is in the repo root.
- **ESLint** (`pnpm lint`) enforces lint rules via `eslint-config-next`, with additional project-specific rules.
- **TypeScript strict mode** is enabled. No `any` without justification. Prefer Zod for runtime validation and lean on inferred types where they are accurate.

If a lint or format check fails in CI, fix it before requesting a review.

## Questions

If you have questions about the codebase, architecture, or security model:

- Read [docs/project-overview.md](docs/project-overview.md) for the architecture and data-model details.
- Read [SECURITY.md](SECURITY.md) for the security invariants and threat model.
- Open a discussion or issue on GitHub for anything not covered in the docs.

We are happy to help first-time contributors get oriented.
