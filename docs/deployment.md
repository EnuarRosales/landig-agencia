# Manual Operativo de Despliegue y Runbooks · Mocter

Este documento contiene la guía operativa completa para aprovisionar, operar, diagnosticar y recuperar los entornos de producción y pruebas de Mocter bajo la especificación **CD-001**.

> **Alcance de esta versión:** despliegue de producción en `mocter.co` / `www.mocter.co`. El entorno de staging permanece desactivado (`STAGING_ENABLED=false`) hasta que exista un VPS alterno. El stack legado en `/opt/landig-agencia` continúa sirviendo `agencialatam.co` y `agencia.identechnology.co`; **no se modifica ni se retira** en este despliegue.

---

## 1. Arquitectura General de Despliegue

* **Servidor de Producción:** VPS Hostinger KVM 4 (`amd64`).
* **Enrutamiento y TLS:** Traefik v2.11 conectado a la red externa `traefik_network`.
* **Red Interna:** Red Docker interna `backend` (sin mapeo de puertos hacia el host; PostgreSQL inaccesible desde el exterior).
* **Contenedor Único:** `ghcr.io/enuarrosales/mocter-web` sirve tanto la aplicación Next.js standalone como el migrador desacoplado (`migrator/scripts/migrate.mjs`).
* **Dominios:** `https://mocter.co` (apex) y `https://www.mocter.co` (redirección 301 al apex).
* **Pipeline:** GitHub Actions (`ci.yml`, `cd.yml`, `deploy.yml`).

### 1.1 Restricción de diseño: repositorio público

`deploy.sh` descarga `docker-compose.prod.yml` desde `raw.githubusercontent.com` **sin autenticación** para la ref exacta que se despliega. Por lo tanto:

* **El repositorio debe permanecer público.** Si se privatiza, la descarga devuelve HTTP 404 y el despliegue aborta antes de pullear la imagen.
* Si en el futuro se requiere un repositorio privado, hay que modificar el mecanismo de distribución del compose (por ejemplo, pre-subirlo desde el workflow o usar un token con permiso `contents:read`).

---

## 2. Permisos Requeridos (Handoff)

| Acción | Permiso mínimo | Quién |
| --- | --- | --- |
| Aprovisionar el VPS (sección 3) | `root` en el VPS | Operador con acceso SSH root |
| Crear el environment `production`, secrets y variables (sección 4.2) | **Admin u Owner del repositorio** | Owner del repositorio |
| Configurar required reviewers y reglas de tags | **Admin u Owner del repositorio** | Owner del repositorio |
| Merge `develop → main` | Write | Colaborador |
| Crear y pushear el tag `v*.*.*` | Write | Colaborador |
| Aprobar un despliegue pendiente | Reviewer del environment | Persona asignada como reviewer |

> **Bloqueo frecuente:** un colaborador con rol **Write** puede hacer merge, push y crear tags, pero **no puede crear environments, secrets ni variables de environment**. Esas acciones requieren rol **Admin/Owner**. Si el operador no es owner, debe solicitar al owner que ejecute la sección 4.2 completa (o que le otorgue rol Admin). Sin ese paso, el job `deploy-production` falla en el step *Validar configuración del environment* indicando el secreto faltante.

---

## 3. Preparación Inicial del VPS (Solo la primera vez)

> Si el VPS ya fue aprovisionado, ejecutar el bloque de verificación 3.7 y continuar en la sección 4.

### 3.1 Preflight (solo lectura)

Ejecutar como `root`. No modifica nada; confirma las precondiciones:

```bash
echo "--- HOST ---"; hostnamectl --static; grep PRETTY_NAME /etc/os-release
echo "--- IPV4 ---"; curl -4 -s ifconfig.me; echo
echo "--- DOCKER ---"; docker --version; docker compose version
echo "--- HERRAMIENTAS ---"; command -v curl flock git
echo "--- USUARIO DEPLOY ---"; id deploy 2>/dev/null || echo "deploy: NO EXISTE"
echo "--- /opt ---"; ls -d /opt/mocter-admin 2>/dev/null || echo "mocter-admin: no existe"
echo "--- DISCO ---"; df -h / | tail -1
```

Valores esperados y por qué importan:

* **IPv4:** usar siempre `curl -4`. Sin `-4`, el servidor puede devolver una dirección IPv6 y desalinear el secreto `SSH_HOST` con el registro DNS.
* **Docker / Compose:** `deploy.sh` requiere Docker Engine y el plugin `docker compose` v2 (`--wait`, `--env-file`).
* **`curl`, `flock`, `git`:** `curl` descarga el compose; `flock` evita despliegues concurrentes.
* **`/opt/mocter-admin`:** si ya existe, revisar su contenido antes de continuar; no sobrescribir a ciegas.

### 3.2 Crear el usuario de despliegue y la estructura

```bash
useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy

mkdir -p /opt/mocter-admin/bin /opt/mocter-admin/backups /opt/mocter-admin/logs
chown deploy:deploy /opt/mocter-admin /opt/mocter-admin/backups /opt/mocter-admin/logs
chmod 750 /opt/mocter-admin
```

`bin/` queda propiedad de `root` (ver 3.3). El usuario `deploy` necesita ejecutar el script, no modificarlo.

### 3.3 Instalar el script de despliegue (fijado a un commit)

Descargar el script desde la ref exacta que se va a desplegar, no desde una rama móvil:

```bash
SHA=<commit_sha_de_la_ref>
curl -fsSL "https://raw.githubusercontent.com/EnuarRosales/landig-agencia/${SHA}/deploy/server/deploy.sh" \
  -o /opt/mocter-admin/bin/deploy.sh
chown root:root /opt/mocter-admin/bin/deploy.sh
chmod 755 /opt/mocter-admin/bin/deploy.sh
bash -n /opt/mocter-admin/bin/deploy.sh && echo "sintaxis deploy.sh: OK"
```

`root:root 755` es deliberado: el script se ejecuta como `deploy` mediante el comando forzado de SSH, pero `deploy` no puede alterarlo.

### 3.4 Variables de entorno (`.env`)

Generar una contraseña **hexadecimal** (URL-safe):

```bash
openssl rand -hex 24
```

Escribir el archivo con el valor generado:

```bash
cat > /opt/mocter-admin/.env <<'EOF'
POSTGRES_USER=mocter_admin
POSTGRES_PASSWORD=<PEGAR_AQUI_EL_HEX>
POSTGRES_DB=mocter_prod
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pg-portal:5432/${POSTGRES_DB}
TAG=v1.0.0
EOF
chown deploy:deploy /opt/mocter-admin/.env
chmod 600 /opt/mocter-admin/.env
```

Tres reglas que evitan fallos silenciosos:

1. **Las comillas de `<<'EOF'` son obligatorias.** Sin ellas, el shell expande `${POSTGRES_USER}` a vacío al escribir el archivo y `DATABASE_URL` queda rota.
2. **Usar hex, no base64.** Base64 puede generar `+`, `/` y `=`, que rompen la URL de conexión.
3. **La interpolación dentro del `.env` funciona** en Docker Compose v2 (verificado con `docker compose config`). No hace falta repetir el password dentro de `DATABASE_URL`.

### 3.5 Configuración del orquestador (`deploy.conf`)

```bash
cat > /opt/mocter-admin/deploy.conf <<'EOF'
ENVIRONMENT="production"
APP_DIR="/opt/mocter-admin"
BACKUP_RETENTION=10
IMAGE="ghcr.io/enuarrosales/mocter-web"
GHCR_USER=""
GHCR_READ_TOKEN=""
EOF
chown deploy:deploy /opt/mocter-admin/deploy.conf
chmod 600 /opt/mocter-admin/deploy.conf
```

* `GHCR_USER` y `GHCR_READ_TOKEN` se dejan vacíos mientras el paquete sea público (ver 4.3).
* **`IMAGE` es informativo:** `deploy.sh` lo usa únicamente en el mensaje de log. El nombre real de la imagen lo define `docker-compose.prod.yml` (`image: ghcr.io/enuarrosales/mocter-web:${TAG}`). No cambiar `IMAGE` esperando redirigir el pull.

### 3.6 Llave SSH restringida

Generar el par en la máquina del operador (no en el VPS). Sin passphrase: GitHub Actions no puede introducirla.

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -C "github-actions-mocter" -f "$env:USERPROFILE\.ssh\mocter_deploy"
Get-Content "$env:USERPROFILE\.ssh\mocter_deploy.pub"
```

**Linux/macOS:**

```bash
ssh-keygen -t ed25519 -C "github-actions-mocter" -f ~/.ssh/mocter_deploy
cat ~/.ssh/mocter_deploy.pub
```

En el VPS, instalar la clave **pública** con comando forzado:

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys
```

Contenido (una sola línea):

```text
command="/opt/mocter-admin/bin/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... github-actions-mocter
```

```bash
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Verificación desde la máquina del operador (ambas pruebas son obligatorias):**

```bash
# 1) Debe ejecutar el comando forzado
ssh -i ~/.ssh/mocter_deploy deploy@2.25.172.227 status

# 2) Debe RECHAZAR comandos arbitrarios
ssh -i ~/.ssh/mocter_deploy deploy@2.25.172.227 "cat /etc/passwd"
```

Resultado esperado de la prueba 2:

```text
[ERROR] Acción no permitida: 'cat'. Solo se permite 'deploy' o 'status'.
```

Si la prueba 2 devuelve el contenido de `/etc/passwd`, la restricción no se aplicó: detener el despliegue y corregir `authorized_keys`.

**Obtener la host key para `SSH_KNOWN_HOSTS`:**

```bash
ssh-keyscan -H 2.25.172.227
```

Si `ssh-keyscan` falla con `Connection aborted` (rate limit o firewall), usar la entrada que el propio cliente SSH ya validó y guardó:

```bash
ssh-keygen -F 2.25.172.227
```

La línea que comienza con `2.25.172.227` (o `|1|...` si está hasheada) es el valor del secreto. La entrada debe corresponder al **mismo host** configurado en `SSH_HOST` (usar la IP, no el dominio, para evitar desalineaciones).

### 3.7 Verificación del aprovisionamiento

```bash
id deploy
getent group docker | grep -q deploy && echo "deploy en grupo docker: OK"
sudo -u deploy docker ps >/dev/null 2>&1 && echo "deploy usa docker: OK"
sudo -u deploy test -r /opt/mocter-admin/.env && echo "deploy lee .env: OK"
ls -la /opt/mocter-admin /opt/mocter-admin/bin
sudo -u deploy /opt/mocter-admin/bin/deploy.sh status
```

Salida esperada del `status`:

```text
[<fecha> UTC] Consultando estado de Mocter (production)...
No existe compose.yml activo.
```

Eso confirma usuario, grupo `docker`, permisos, logging y ejecución del script **sin crear contenedores**.

---

## 4. Configuración en GitHub Actions

### 4.0 Requisito de permisos

La sección 4.2 requiere rol **Admin/Owner** del repositorio. Un colaborador con Write no verá la opción de crear environments ni podrá cargar secrets de environment. Ver sección 2.

### 4.1 Variable de repositorio

En **Settings > Secrets and variables > Actions > Variables** (nivel repositorio):

* `STAGING_ENABLED`: `false`.

El workflow evalúa `vars.STAGING_ENABLED == 'true'`; declararlo explícitamente documenta la intención y evita activaciones accidentales. El entorno `staging` no se configura en esta fase.

### 4.2 Environment `production`

En **Settings > Environments > New environment**, crear `production` y configurar:

1. **Required reviewers:** agregar al responsable de liberaciones. **Este es el gate de aprobación manual.** Sin reviewers, el tag despliega automáticamente.
2. **Deployment branches and tags:** seleccionar *Selected branches and tags* y agregar una regla de tipo **Tag** con patrón `v*.*.*`.
3. **Environment secrets:**

| Secret | Valor |
| --- | --- |
| `SSH_HOST` | `2.25.172.227` (IP del VPS Hostinger) |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | Contenido completo de la llave privada OpenSSH |
| `SSH_KNOWN_HOSTS` | Línea obtenida en 3.6 (`ssh-keyscan -H` o `ssh-keygen -F`) |

4. **Environment variable:**

| Variable | Valor |
| --- | --- |
| `APP_URL` | `https://mocter.co` |

`APP_URL` es **variable**, no secret. Es la URL que usa la prueba de humo final: el job hace `curl -L` y exige HTTP 2xx/3xx. Si el dominio no responde, el deploy falla aunque el contenedor esté sano.

**Carga de `SSH_KEY` sin truncar saltos de línea:**

* Windows: `Get-Content "$env:USERPROFILE\.ssh\mocter_deploy" -Raw | Set-Clipboard`
* Linux/macOS: `cat ~/.ssh/mocter_deploy` y copiar la salida completa.

Debe incluir `-----BEGIN OPENSSH PRIVATE KEY-----` y `-----END OPENSSH PRIVATE KEY-----`.

### 4.3 Visibilidad del paquete en GHCR

El paquete `ghcr.io/enuarrosales/mocter-web` es **público** y se puede pullear anónimamente (verificado desde el VPS). Por eso `GHCR_USER` y `GHCR_READ_TOKEN` quedan vacíos.

> **Advertencia:** según la documentación oficial de GitHub, *"once you make a package public, you cannot make it private again"*. La visibilidad del paquete es independiente de la visibilidad del repositorio; privatizar el repositorio **no** vuelve privado el paquete. Si en el futuro se requiere un registro privado, usar un nombre de paquete nuevo o configurar un PAT con permiso `read:packages` en `GHCR_USER` / `GHCR_READ_TOKEN`.

### 4.4 Pre-vuelo antes de taggear

Ejecutar en el VPS. Valida red, GHCR y el compose real **sin crear contenedores**:

```bash
# 1) Pull anónimo de la imagen candidata
docker pull ghcr.io/enuarrosales/mocter-web:sha-<7_primeros_del_commit>

# 2) Parseo del compose con el .env real
curl -fsSL "https://raw.githubusercontent.com/EnuarRosales/landig-agencia/<commit_sha>/docker-compose.prod.yml" \
  -o /tmp/compose.pretest.yml
docker compose -f /tmp/compose.pretest.yml --env-file /opt/mocter-admin/.env config >/dev/null \
  && echo "compose + .env: OK"
rm -f /tmp/compose.pretest.yml
```

Si el pull falla con `unauthorized` o `manifest unknown`, no taggear: revisar visibilidad del paquete o la existencia del tag de imagen.

---

## 5. Secuencia de Go-Live

### 5.1 Checklist

- [ ] Sección 3 completada y verificada (3.7).
- [ ] Environment `production` creado con reviewers, secrets y `APP_URL` (4.2).
- [ ] Pre-vuelo 4.4 exitoso.
- [ ] `develop` con CI en verde (lint, test, migrations, e2e).
- [ ] `main` fusionado y con el compose, el Dockerfile y el migrador.
- [ ] Tag `v1.0.0` creado sobre un commit contenido en `main`.
- [ ] Deploy aprobado en el environment.
- [ ] Verificación post-deploy 5.5 completa.

### 5.2 Merge `develop → main`

Recomendado vía Pull Request (revisión + CI). Alternativa por consola:

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
```

Antes de taggear, confirmar que `main` contiene los artefactos:

```bash
git ls-tree --name-only main | grep -E 'Dockerfile|docker-compose.prod.yml'
```

### 5.3 Crear y pushear el tag

```bash
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Primer release de producción"
git push origin v1.0.0
```

Reglas que valida el workflow:

* Formato SemVer `vX.Y.Z` (o `vX.Y.Z-prerelease`).
* En producción, `git_ref` debe ser idéntico al tag.
* El commit del tag debe ser **ancestro de `main`** (`git merge-base --is-ancestor`).
* Solo los tags **estables** (sin `-`) disparan `deploy-production`. Un tag `v1.0.0-rc.1` construye imagen pero no despliega.

### 5.4 Flujo del pipeline y aprobación

Secuencia esperada en **Actions > CD**:

1. `ci` (lint, test, migrations, e2e).
2. `verify-tag` (formato + pertenencia a `main`).
3. `build-and-push` (publica `v1.0.0`, `latest` y `sha-xxxxxxx` en GHCR).
4. `deploy-production` → queda en **Waiting for approval**.

Aprobar en **Review deployments > production > Approve and deploy**. El job de deploy:

* descarga el compose desde el tag,
* hace `docker compose pull`,
* ejecuta `migrate` (levanta `pg-portal` y espera `service_healthy`),
* hace `up -d --remove-orphans --wait`,
* ejecuta la prueba de humo contra `APP_URL`,
* registra el release en `releases.log`.

En el primer despliegue no existe compose previo: el respaldo `pg_dump` se omite automáticamente (`No existe compose.yml previo`).

### 5.5 Verificación post-deploy

```bash
# Estado de los servicios
ssh deploy@2.25.172.227 status
docker compose -f /opt/mocter-admin/compose.yml --env-file /opt/mocter-admin/.env ps

# Último release registrado
tail -n 5 /opt/mocter-admin/releases.log

# Respuesta HTTP y TLS
curl -sI https://mocter.co | head -1
curl -sI https://www.mocter.co | head -1
curl -sSI https://mocter.co | grep -i strict-transport-security
```

Resultados esperados:

* `pg-portal` y `web-portal` en estado `healthy`.
* `releases.log` con una línea `... | production | v1.0.0 | v1.0.0 | SUCCESS`.
* `https://mocter.co` responde `HTTP/2 200`.
* `https://www.mocter.co` responde `301` hacia `https://mocter.co/`.
* Certificado TLS emitido por el certresolver `mytlschallenge`.

### 5.6 Rollback

**Automático:** si `web-portal` no alcanza `healthy`, `deploy.sh` restaura `compose.yml.prev` y vuelve a levantar la versión anterior.

**Manual (sin reconstruir):** **Actions > CD > Run workflow**, seleccionar el tag estable anterior en *"Use workflow from"* y aprobar el environment.

### 5.7 Caso especial: base de datos preexistente con la tabla `leads`

Si el volumen de PostgreSQL ya contiene una tabla `leads` creada fuera de Drizzle, la migración `0000_cheerful_rictor` intentará crearla de nuevo y fallará. En ese caso, registrar la migración como aplicada **antes** de reintentar el despliegue.

1. Ubicar el contenedor de PostgreSQL (el servicio `migrate` lo deja en ejecución al fallar):
   ```bash
   docker ps --filter name=pg-portal --format '{{.Names}}'
   ```
2. Conectar con `psql`:
   ```bash
   docker exec -it <nombre_del_contenedor> psql -U mocter_admin -d mocter_prod
   ```
3. Crear el esquema de control y registrar la migración:
   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
     id SERIAL PRIMARY KEY,
     hash text NOT NULL,
     created_at bigint
   );

   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('0000_cheerful_rictor', 1792165577639);
   ```
4. Reintentar el despliegue (nuevo tag o `workflow_dispatch`).

> El migrador de `drizzle-orm 0.44.7` decide qué aplicar comparando `created_at` con el `when` del journal (`1792165577639` para `0000`), no el `hash`. Usar exactamente ese valor garantiza que la migración se omita. Si se actualiza `drizzle-orm` y el migrador comienza a validar el hash, reemplazar `'0000_cheerful_rictor'` por el SHA-256 real del archivo SQL.

---

## 6. Runbooks Operativos

### 6.1 Consultar estado y releases

Desde local:

```bash
ssh -i ~/.ssh/mocter_deploy deploy@2.25.172.227 status
```

En el VPS:

```bash
docker compose -f /opt/mocter-admin/compose.yml --env-file /opt/mocter-admin/.env ps
tail -n 20 /opt/mocter-admin/releases.log
```

### 6.2 Restauración manual de base de datos

```bash
# 1. Identificar el respaldo
ls -lh /opt/mocter-admin/backups/

# 2. Detener el portal web
docker compose -f /opt/mocter-admin/compose.yml stop web-portal

# 3. Restaurar
docker exec -i $(docker compose -f /opt/mocter-admin/compose.yml ps -q pg-portal) \
  pg_restore -U mocter_admin -d mocter_prod --clean --if-exists \
  < /opt/mocter-admin/backups/backup_YYYYMMDD_HHMMSS_vX.Y.Z.dump

# 4. Volver a iniciar
docker compose -f /opt/mocter-admin/compose.yml start web-portal
```

### 6.3 Rollback inmediato desde GitHub

1. **Actions > CD > Run workflow**.
2. En *"Use workflow from"*, seleccionar el tag estable anterior (por ejemplo `v1.0.0`).
3. Aprobar el environment. El workflow despliega esa versión sin reconstruir la imagen.

### 6.4 Logs y diagnóstico

```bash
# Log del orquestador
tail -n 100 /opt/mocter-admin/logs/deploy.log

# Logs de la aplicación
docker compose -f /opt/mocter-admin/compose.yml logs --tail=100 web-portal

# Logs de PostgreSQL
docker compose -f /opt/mocter-admin/compose.yml logs --tail=50 pg-portal

# Logs de Traefik (contenedor del stack legado)
docker ps --filter name=traefik --format '{{.Names}}'
docker logs --tail=100 <nombre_del_contenedor_traefik>
```

### 6.5 Troubleshooting

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `::error::Falta SSH_HOST` (u otro) | El environment no tiene el secret o el job no está asociado a `production` | Revisar 4.2; el job debe declarar `environment: production` |
| `Permission denied (publickey)` | `SSH_KEY` no coincide con `authorized_keys`, tiene passphrase o `SSH_USER` es incorrecto | Regenerar la llave sin passphrase y reinstalar la pública |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` no corresponde a `SSH_HOST` (IP vs dominio) o la host key cambió | Extraer la host key del mismo host usado en `SSH_HOST` |
| `curl: (22) ... 404` al descargar el compose | Repositorio privado o tag sin `docker-compose.prod.yml` | Mantener el repo público o ajustar la distribución del compose |
| `manifest unknown` en el pull | El tag de imagen no existe o el build no terminó | Verificar el job `build-and-push` y el nombre del tag |
| `unauthorized` en el pull | Paquete privado sin credenciales | Configurar `GHCR_USER` y `GHCR_READ_TOKEN` (PAT `read:packages`) |
| `network traefik_network not found` | La red externa no existe o cambió de nombre | Verificar `docker network ls` y los labels del compose |
| Traefik responde 404 para `mocter.co` | Contenedor fuera de `traefik_network` o labels ausentes | Revisar `docker inspect` y los labels de `web-portal` |
| Error TLS / `SEC_E_UNTRUSTED_ROOT` | DNS no apunta al VPS o el router aún no existe | Verificar registros A y los logs de Traefik |
| `www.mocter.co` no redirige | Middleware `mocter-prod-www` no aplicado | Revisar labels del compose y reiniciar el servicio |
| `pg_isready` unhealthy | Credenciales o volumen incompatibles | Revisar `.env` y el volumen `pgdata-portal` |
| La migración falla | `DATABASE_URL` mal interpolada o Postgres no disponible | Ejecutar `docker compose config` y revisar `pg-portal` |
| Prueba de humo con HTTP 000/5xx | La app no está sana o Traefik no enruta | Revisar `docker compose ps` y logs de `web-portal` |
| `Acción no permitida: '...'` al probar SSH | Comportamiento esperado del comando forzado | No es un error; la restricción funciona |

---

## Apéndice A. Estado Verificado del Aprovisionamiento

Registro de lo comprobado empíricamente. Actualizar al completar cada fase.

**VPS**

* [x] Ubuntu 24.04.4 LTS, Docker 29.5.3, Compose v5.1.4, `curl`/`flock`/`git` presentes.
* [x] Usuario `deploy` (uid 1000) en el grupo `docker`; puede ejecutar `docker ps`.
* [x] `/opt/mocter-admin` con `bin/`, `backups/`, `logs/`; `deploy.sh` en `root:root 755`.
* [x] `.env` y `deploy.conf` en `deploy:deploy 600`; `deploy` los lee.
* [x] Llave SSH restringida: `status` funciona y `cat /etc/passwd` es rechazado.
* [x] Host key capturada para `SSH_KNOWN_HOSTS`.
* [x] `docker pull ghcr.io/enuarrosales/mocter-web:sha-753be9c` exitoso sin credenciales.
* [x] `docker compose config` del compose de producción con el `.env` real: OK.

**GitHub**

* [x] Imagen publicada en GHCR: `develop`, `sha-753be9c`.
* [x] Paquete público y pull anónimo verificado.
* [ ] Environment `production` con reviewers, secrets y `APP_URL` (requiere Admin/Owner).
* [ ] `main` fusionado con `develop`.
* [ ] Tag `v1.0.0` y aprobación del deploy.
