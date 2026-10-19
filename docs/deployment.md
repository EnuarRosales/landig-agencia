# Manual Operativo de Despliegue y Runbooks · Mocter

Este documento contiene la guía operativa completa para aprovisionar, operar, diagnosticar y recuperar los entornos de producción y pruebas de Mocter bajo la especificación **CD-001**.

---

## 1. Arquitectura General de Despliegue

* **Servidor de Producción:** VPS Hostinger KVM 4 (`amd64`).
* **Enrutamiento y TLS:** Traefik v2.11 conectado a la red externa `traefik_network`.
* **Red Interna:** Red Docker interna `backend` (sin mapeo de puertos hacia el host; PostgreSQL inaccesible desde el exterior).
* **Contenedor Único:** `ghcr.io/enuarrosales/mocter-web` sirve tanto la aplicación Next.js standalone como el migrador desacoplado (`migrator/scripts/migrate.mjs`).
* **Pipeline:** GitHub Actions (`ci.yml`, `cd.yml`, `deploy.yml`).

---

## 2. Preparación Inicial del VPS (Solo la primera vez)

### 2.1 Crear el usuario de despliegue
En el VPS como usuario `root`:

```bash
# Crear usuario deploy sin password de login interactivo
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Crear estructura de carpetas de la aplicación
mkdir -p /opt/mocter-admin/{bin,backups,logs}
chown -R deploy:deploy /opt/mocter-admin
chmod 750 /opt/mocter-admin
```

### 2.2 Instalar el script de despliegue
Copiar el script `deploy/server/deploy.sh` del repositorio hacia el servidor:

```bash
cp deploy.sh /opt/mocter-admin/bin/deploy.sh
chown root:root /opt/mocter-admin/bin/deploy.sh
chmod 755 /opt/mocter-admin/bin/deploy.sh
```

### 2.3 Restringir la Llave SSH en `authorized_keys`
Generar un par de llaves SSH dedicado para el pipeline (ej. `ssh-keygen -t ed25519 -C "github-actions-mocter"`):
* La clave privada se configura en GitHub como secreto `SSH_KEY`.
* La clave pública se agrega en `/home/deploy/.ssh/authorized_keys` con restricción de comando forzado:

```text
command="/opt/mocter-admin/bin/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... github-actions-mocter
```

Esto garantiza que la llave SSH **no pueda abrir shells interactivas ni ejecutar comandos arbitrarios**, sino únicamente ejecutar `deploy.sh`.

### 2.4 Configurar `.env` y `deploy.conf`
En `/opt/mocter-admin/`:

```bash
# 1. Configuración del orquestador
cp deploy.conf.example /opt/mocter-admin/deploy.conf
# Ajustar ENVIRONMENT="production"

# 2. Variables de entorno productivas
cp env.prod.example /opt/mocter-admin/.env
# Configurar contraseñas reales y seguras para POSTGRES_PASSWORD

chown deploy:deploy /opt/mocter-admin/deploy.conf /opt/mocter-admin/.env
chmod 600 /opt/mocter-admin/deploy.conf /opt/mocter-admin/.env
```

---

## 3. Procedimiento del Primer Despliegue (Línea Base / Baseline)

### Escenario A: Base de datos nueva y limpia
1. Al disparar el primer release con tag `v1.0.0`, `deploy.sh` descarga `compose.yml` y levanta `pg-portal`.
2. El contenedor efímero `migrate` aplica `0000_cheerful_rictor.sql` y crea automáticamente la tabla de control `drizzle.__drizzle_migrations`.
3. El servicio `web-portal` inicia y Traefik enlaza `mocter.co`.

### Escenario B: Base de datos existente que ya contenía la tabla `leads`
Si PostgreSQL ya contenía datos o tablas previas creadas sin Drizzle:
1. Conectar a PostgreSQL localmente:
   ```bash
   docker exec -it pg-portal psql -U mocter_admin -d mocter_prod
   ```
2. Crear el esquema y la tabla de control de Drizzle manualmente:
   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
     id SERIAL PRIMARY KEY,
     hash text NOT NULL,
     created_at bigint
   );
   -- Registrar la migración 0000 como ya aplicada:
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('0000_cheerful_rictor', EXTRACT(EPOCH FROM NOW()) * 1000);
   ```
3. A partir de ese momento, `migrate.mjs` reconocerá la migración `0000` como aplicada y no intentará recrear la tabla.

---

## 4. Configuración en GitHub Actions

### 4.1 Variables y Secretos del Repositorio
* **Settings > Actions > General > Workflow permissions:** Seleccionar *Read repository contents and packages permissions*.
* **Settings > Secrets and variables > Actions > Variables:**
  * `STAGING_ENABLED`: `"false"` (hasta que se aprovisione el VPS de pruebas).

### 4.2 GitHub Environments (`production`)
Crear el environment `production` en **Settings > Environments**:
1. **Required reviewers:** Agregar al responsable de liberaciones para aprobación manual.
2. **Deployment branches and tags:** Seleccionar *Selected tags* y definir la regla `v*.*.*`.
3. **Secrets:**
   * `SSH_HOST`: Dirección IP del VPS Hostinger (`2.25.172.227`).
   * `SSH_USER`: `deploy`.
   * `SSH_KEY`: Clave privada SSH (formato OpenSSH).
   * `SSH_KNOWN_HOSTS`: Salida de `ssh-keyscan -H 2.25.172.227`.
4. **Variables:**
   * `APP_URL`: `https://mocter.co`.

### 4.3 Visibilidad del paquete en GitHub Container Registry (GHCR)
* Tras la primera publicación exitosa de la imagen:
  1. Ir al perfil de GitHub > **Packages** > `mocter-web`.
  2. En **Package settings**, cambiar la visibilidad a **Public** (permite descargas sin token en el VPS).
  3. Alternativamente, si se requiere mantener el paquete privado, configurar `GHCR_USER` y `GHCR_READ_TOKEN` en `/opt/mocter-admin/deploy.conf`.

---

## 5. Runbooks Operativos

### 5.1 Consultar Estado y Releases
Ejecutar desde local vía SSH:
```bash
ssh deploy@2.25.172.227 status
```
O directamente en el VPS:
```bash
docker compose -f /opt/mocter-admin/compose.yml --env-file /opt/mocter-admin/.env ps
tail -n 20 /opt/mocter-admin/releases.log
```

### 5.2 Restauración Manual de Base de Datos ante Desastres
Si una migración o actualización requiere restaurar un respaldo:
```bash
# 1. Identificar el archivo de respaldo deseado
ls -lh /opt/mocter-admin/backups/

# 2. Detener temporalmente el portal web
docker compose -f /opt/mocter-admin/compose.yml stop web-portal

# 3. Restaurar el volcado con pg_restore
docker exec -i $(docker compose -f /opt/mocter-admin/compose.yml ps -q pg-portal) \
  pg_restore -U mocter_admin -d mocter_prod --clean --if-exists < /opt/mocter-admin/backups/backup_YYYYMMDD_HHMMSS_vX.Y.Z.dump

# 4. Volver a iniciar el servicio
docker compose -f /opt/mocter-admin/compose.yml start web-portal
```

### 5.3 Rollback Inmediato de Versión desde GitHub
Si la versión desplegada presenta incidencias operativas:
1. Ir a **Actions > CD > Run workflow**.
2. En *"Use workflow from"*, seleccionar el tag de la versión anterior estable (ej. `v1.0.0`).
3. El workflow desplegará inmediatamente esa versión sin necesidad de reconstruir la imagen.
