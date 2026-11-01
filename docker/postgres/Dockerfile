# ==============================================================================
# Mocter · Imagen personalizada de base de datos PostgreSQL 18 + pgvector + pgBackRest
# Especificación: OPS-001 §4.1, T-05
# Base: pgvector/pgvector:pg18 (Debian bookworm)
# ==============================================================================

FROM pgvector/pgvector:pg18

# Instalar dependencias del sistema y repositorio oficial PGDG para pgBackRest
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    zstd \
    && echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    pgbackrest \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Crear directorios operativos para pgBackRest con permisos de usuario postgres
RUN mkdir -p /etc/pgbackrest /var/log/pgbackrest /var/lib/pgbackrest \
    && chown -R postgres:postgres /etc/pgbackrest /var/log/pgbackrest /var/lib/pgbackrest \
    && chmod 750 /var/log/pgbackrest /var/lib/pgbackrest

# Copiar el wrapper seguro pgbackrest-secure
COPY --chmod=755 pgbackrest-secure /usr/local/bin/pgbackrest-secure

# Etiqueta de versión
LABEL maintainer="Mocter Platform Operations <soporte@mocter.co>" \
      version="18-pgbackrest" \
      description="PostgreSQL 18 con pgvector y soporte de respaldo continuo pgBackRest (OPS-001)"
