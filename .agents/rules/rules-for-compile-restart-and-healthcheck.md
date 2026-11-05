# Regla de Recompilación, Reinicio de Servicios y Verificación de Salud Obligatoria

> **Estado:** Permanente y no negociable para cualquier desarrollo, refactorización o agente de IA.  
> **Alcance:** Todo el monorepo (`apps/web`, `apps/admin`, `packages/domain`, contenedores Docker de desarrollo).  
> **Directiva:** Ante cualquier cambio de código en aplicaciones o paquetes compartidos, es estrictamente obligatorio compilar, reiniciar el contenedor del servicio afectado y validar la respuesta HTTP 200 en caliente antes de dar por finalizada la tarea.

---

## 1. Principio Fundamental

Queda **estrictamente prohibido** dar por finalizada una tarea o intervención de código confiando ciegamente en el refresco en caliente (*Hot Module Replacement / Fast Refresh*) sin reiniciar el contenedor Docker del servicio involucrado.

En entornos gobernados por contenedores y monorepos con paquetes compartidos (`@mocter/domain` enlazado como workspace en Next.js):
1. **Persistencia de estados o artefactos en memoria:** El servidor de desarrollo de Next.js o Turbopack dentro del contenedor puede conservar cachés desincronizadas de TypeScript o bundles previos de paquetes del monorepo.
2. **Falsos positivos de entrega:** Informar al usuario que una funcionalidad o corrección está lista sin haber reiniciado el contenedor y sin haber recibido una respuesta HTTP 200 real introduce errores de runtime invisibles hasta que el usuario interactúa con la interfaz.
3. **Garantía de paridad operativa:** Reiniciar el contenedor expone de inmediato cualquier error fatal de arranque, importación circular, fallas de variables de entorno o dependencias faltantes.

---

## 2. Matriz de Servicios y Contenedores Afectados

| Componente Modificado | Contenedor(es) a Reiniciar | Puerto / URL de Verificación |
| --------------------- | -------------------------- | ---------------------------- |
| `apps/admin` | `mocter-core-admin-portal-1` | `http://localhost:3003/admin/billing?tab=plans` |
| `apps/web` | `mocter-core-web-portal-1` | `http://localhost:3001/es` y `http://localhost:3001/en` |
| `packages/domain` | `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` | Ambos puertos (`3003` y `3001`) |
| `docker-compose*.yml` | Contenedores específicos reconfigurados | Health check de Docker o endpoint del servicio |

---

## 3. Protocolo Obligatorio de 3 Pasos

Ante cada modificación de código, el agente debe ejecutar obligatoriamente la siguiente secuencia antes de reportar la solución al usuario:

### Paso 1: Verificación de Tipado y Pruebas
Validar que la sintaxis TypeScript sea correcta y que las suites de pruebas unitarias relevantes del módulo afectado pasen al 100%:
```bash
# Para la aplicación web:
npx pnpm --filter @mocter/web test <ruta-del-test>

# Para el paquete de dominio:
npx pnpm --filter @mocter/domain test <ruta-del-test>
```

### Paso 2: Reinicio del Contenedor del Servicio Afectado
Reiniciar de manera explícita el o los contenedores correspondientes mediante Docker CLI:
```bash
# Ejemplo: si se modificó apps/admin
docker restart mocter-core-admin-portal-1

# Ejemplo: si se modificó packages/domain (afecta ambos portales)
docker restart mocter-core-admin-portal-1 mocter-core-web-portal-1
```

### Paso 3: Verificación de Salud en Caliente (Health Check)
Consultar directamente el endpoint del servicio reiniciado y constatar que retorne código de estado HTTP `200`:
```powershell
# En PowerShell:
Start-Sleep -Seconds 3
Invoke-WebRequest -Uri "http://localhost:3003/admin/billing?tab=plans" -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest -Uri "http://localhost:3001/es" -UseBasicParsing | Select-Object StatusCode
```
Adicionalmente, comprobar los logs del contenedor para descartar excepciones no capturadas durante el bootstrap:
```bash
docker logs --tail 20 <nombre-del-contenedor>
```

---

## 4. Prohibiciones Explícitas

1. **Prohibido asumir éxito sin comprobación HTTP en caliente:** Ningún agente puede reportar *"quedó listo"* o *"está funcionando"* sin haber ejecutado la verificación del código de respuesta HTTP.
2. **Prohibido omitir el reinicio cuando se altere `@mocter/domain`:** Todo cambio en contratos, esquemas, servicios o repositorios del dominio exige reiniciar inmediatamente tanto el portal administrativo como la landing web.
3. **Prohibido ignorar errores en logs post-reinicio:** Si tras el reinicio el contenedor emite trazas de error o códigos HTTP 4xx/5xx imprevistos, el agente debe detenerse, investigar la causa raíz técnica y subsanarla antes de entregar la respuesta.

