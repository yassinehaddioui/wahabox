FROM node:26-alpine AS base
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ----- deps-prod (production only, for migrator) -----
FROM base AS deps-prod
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --prefer-offline

# ----- deps (full, for builder — extends deps-prod so store is warm) -----
FROM deps-prod AS deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ----- builder -----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://dummy:dummy@dummy:5432/dummy pnpm prisma generate && pnpm build

# ----- migrator -----
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ----- runner -----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN adapter=$(cd node_modules/.pnpm && ls -d @prisma+adapter-pg@*/node_modules/@prisma/adapter-pg | head -1) \
  && ln -sfn "../.pnpm/${adapter}" node_modules/@prisma/adapter-pg \
  && chown -h nextjs:nodejs node_modules/@prisma/adapter-pg

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
