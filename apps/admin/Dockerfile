# Mocter admin image (multi-stage, pnpm + Turborepo monorepo). Imagen independiente
# de la web: ghcr.io/enuarrosales/mocter-admin:<tag>
#
#   Comando por defecto -> servidor Next.js standalone (apps/admin/server.js)
#
# Build local (desde la raíz del repositorio; el contexto es la raíz por el workspace):
#   docker build -f apps/admin/Dockerfile -t ghcr.io/enuarrosales/mocter-admin:local .
#
# Standalone layout note (Next.js 16.4.2, pnpm workspace): the traced root is the
# workspace root, so server.js lands at apps/admin/.next/standalone/apps/admin/server.js.
# Static assets must be re-copied to apps/admin/.next/static inside the standalone tree.
# The container does NOT rebuild anything.

# --- deps: install the full workspace with frozen lockfile -------------------
FROM node:24-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN corepack pnpm install --frozen-lockfile

# --- build: compile admin with Turborepo -------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
# NODE_ENV=production: build estándar de Next.js. Las devDependencies ya están
# instaladas en la etapa deps, por lo que el build dispone de ellas.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY . .
RUN corepack pnpm turbo run build --filter=@mocter/admin

# --- runner: production runtime ----------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs mocter
COPY --from=build --chown=mocter:nodejs /app/apps/admin/.next/standalone ./
COPY --from=build --chown=mocter:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER mocter
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-3000}/api/health || exit 1
CMD ["node", "apps/admin/server.js"]
