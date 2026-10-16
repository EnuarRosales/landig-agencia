# Mocter web production image (multi-stage, pnpm + Turborepo monorepo).
# Build: docker build -t ghcr.io/enuarrosales/mocter-web:<tag> .
# Run:   docker run -p 3000:3000 -e DATABASE_URL=... ghcr.io/enuarrosales/mocter-web:<tag>
#
# Standalone layout note (Next.js 16.4.2, pnpm workspace): the traced root is the
# workspace root, so server.js lands at apps/web/.next/standalone/apps/web/server.js
# (verified in next/dist/esm/build/utils.js copyTracedFiles -> outputPath +
# path.relative(tracingRoot, dir)). Static assets and public must be re-copied to
# apps/web/.next/static and apps/web/public inside the standalone tree.
# The container does NOT rebuild anything; DATABASE_URL is injected at runtime.

# --- deps: install the full workspace with frozen lockfile -------------------
FROM node:24-alpine AS deps
WORKDIR /app
# Corepack downloads the pnpm version pinned in root package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Copy workspace manifests first so lockfile importers resolve.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN corepack pnpm install --frozen-lockfile

# --- build: compile domain, then web, with Turborepo -------------------------
FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=development
RUN corepack enable
# Reuse installed dependencies, then layer the source tree on top.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY . .
RUN corepack pnpm turbo run build --filter=@mocter/domain
RUN corepack pnpm turbo run build --filter=@mocter/web

# --- runner: minimal production runtime --------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs mocter
COPY --from=build --chown=mocter:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=mocter:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=mocter:nodejs /app/apps/web/public ./apps/web/public
USER mocter
EXPOSE 3000
# Busybox wget on alpine; no /api/health route exists yet, probe / instead.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-3000}/ || exit 1
CMD ["node", "apps/web/server.js"]
