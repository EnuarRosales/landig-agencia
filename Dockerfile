# Mocter web image (multi-stage, pnpm + Turborepo monorepo). UNA sola imagen:
#   ghcr.io/enuarrosales/mocter-web:<tag>
#
#   Comando por defecto  -> servidor Next.js standalone (apps/web/server.js)
#   Comando de migración -> node migrator/scripts/migrate.mjs
#                           Aplica las migraciones SQL versionadas en packages/domain/drizzle
#                           (generadas con drizzle-kit generate) y registra lo aplicado en
#                           drizzle.__drizzle_migrations. Solo ejecuta lo pendiente.
#
# Build local:
#   docker build -t ghcr.io/enuarrosales/mocter-web:local .
# Migrar local:
#   docker run --rm -e DATABASE_URL=... ghcr.io/enuarrosales/mocter-web:local node migrator/scripts/migrate.mjs
#
# Standalone layout note (Next.js 16.4.2, pnpm workspace): the traced root is the
# workspace root, so server.js lands at apps/web/.next/standalone/apps/web/server.js.
# Static assets and public must be re-copied to apps/web/.next/static and
# apps/web/public inside the standalone tree.
# The container does NOT rebuild anything; DATABASE_URL is injected at runtime.
#
# El árbol standalone solo contiene lo que server.js importa: NO incluye el migrador
# de drizzle-orm ni la carpeta drizzle/. Por eso se agrega un directorio aislado
# /app/migrator con dependencias de producción de @mocter/domain (pnpm deploy).

# --- deps: install the full workspace with frozen lockfile -------------------
FROM node:24-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN corepack pnpm install --frozen-lockfile

# --- build: compile domain, then web, with Turborepo -------------------------
FROM node:24-alpine AS build
WORKDIR /app
# NODE_ENV=production: build estándar de Next.js. Las devDependencies ya están
# instaladas en la etapa deps, por lo que el build dispone de ellas.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY . .
RUN corepack pnpm turbo run build --filter=@mocter/domain
RUN corepack pnpm turbo run build --filter=@mocter/web

# --- migrator-deps: dependencias de producción aisladas de @mocter/domain ----
# pnpm >= 10 requiere --legacy (o inject-workspace-packages=true) para "deploy".
# Si el proyecto usa pnpm 9, establecer PNPM_DEPLOY_FLAGS="" (ver SPEC, D-11).
ARG PNPM_DEPLOY_FLAGS="--legacy"
RUN corepack pnpm --filter @mocter/domain deploy --prod ${PNPM_DEPLOY_FLAGS} /out/migrator

# --- runner: production runtime (app + migrador) -----------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs mocter
# Aplicación
COPY --from=build --chown=mocter:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=mocter:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=mocter:nodejs /app/apps/web/public ./apps/web/public
# Migrador (dependencias de producción + SQL versionado + script)
COPY --from=build --chown=mocter:nodejs /out/migrator/package.json ./migrator/package.json
COPY --from=build --chown=mocter:nodejs /out/migrator/node_modules ./migrator/node_modules
COPY --from=build --chown=mocter:nodejs /app/packages/domain/drizzle ./migrator/drizzle
COPY --from=build --chown=mocter:nodejs /app/packages/domain/scripts/migrate.mjs ./migrator/scripts/migrate.mjs
USER mocter
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-3000}/api/health || exit 1
CMD ["node", "apps/web/server.js"]
