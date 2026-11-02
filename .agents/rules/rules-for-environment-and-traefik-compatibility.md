# Regla del Agente: Compatibilidad de Entorno, Resolución DNS y Producción con Traefik (Zero Hardcoded Ports)

> **Estado:** Permanente y no negociable para desarrolladores y agentes de IA.  
> **Alcance:** Todo el monorepo (`apps/*`, `packages/*`, `docker-compose*.yml`).  
> **Propósito:** Garantizar que toda solución, enrutamiento, proxy, hook o componente sea arquitectónicamente agnóstico de infraestructura y 100% compatible con el ambiente de producción gobernado por Docker y Traefik v2.11. Queda estrictamente prohibida la introducción de parches, heurísticas o manipulaciones de cadenas acopladas a puertos del entorno de desarrollo local.

---

## 1. Directiva Principal

En el proyecto Mocter, el ambiente de producción opera bajo **Traefik v2.11** como reverse proxy exclusivo (`R-03`, `R-10`). En dicho ambiente:
1. Ningún servicio publica puertos en el host (`R-10`).
2. Todo el tráfico externo entra por TLS estándar en puerto `443` hacia nombres DNS canónicos (`mocter.co`, `admin.mocter.co`, `*.mocter.co`).
3. La comunicación interna entre contenedores ocurre a través de redes Docker (`traefik_network`, `backend`) donde Traefik y los servicios resuelven destinos exclusivamente por nombre de servicio y puerto interno estándar de contenedor (`3000`).

**Queda terminantemente prohibido:**
- Escribir en código de aplicación o proxies lógica que busque, reemplace o asuma números de puerto locales (como `.replace(":3000", ":3003")`, expresiones regulares sobre puertos o interpolaciones de puertos fijos).
- Condicionar la lógica de enrutamiento o seguridad a puertos de escucha locales en lugar de nombres de dominio o variables de entorno canónicas.
- Asumir que una URL en el navegador contiene o debe contener un puerto específico.

---

## 2. Principio de Paridad de Puertos en Desarrollo Local

Para evitar asimetrías donde el servidor de desarrollo corra internamente en un puerto y Docker lo exponga en otro (provocando desfasajes en `request.nextUrl`):

1. **Paridad Interno-Externo en Compose Local:**
   Todo servicio publicado en el `docker-compose.yml` de desarrollo DEBE escuchar internamente en el mismo puerto que publica en el host.
   - `web-portal`: `3001:3001` con `PORT=3001` y `next dev -p 3001`.
   - `admin-portal`: `3003:3003` con `PORT=3003` y `next dev -p 3003`.
2. **Producción Intacta:**
   En `docker-compose.prod.yml`, los contenedores corren en modo `standalone` en su puerto interno estándar (`3000`) sin publicar puertos en el host, dejando que Traefik gestione el balanceo y la terminación TLS vía labels `loadbalancer.server.port=3000`.

---

## 3. Contrato de Enrutamiento y Construcción de URLs

Toda resolución de URL de navegación, redirección post-login (`return_to`), proxy de control de acceso y llamadas inter-servicio DEBE ceñirse a las siguientes fuentes autoritativas:

1. **Variables de Entorno Tipadas (`@t3-oss/env-nextjs`):**
   - `NEXT_PUBLIC_APP_URL` (`https://mocter.co` en prod, `http://localhost:3001` en dev).
   - `NEXT_PUBLIC_ADMIN_URL` (`https://admin.mocter.co` en prod, `http://localhost:3003` en dev).
   - `NEXT_PUBLIC_API_URL` (`https://mocter.co/api` en prod, `http://localhost:3001/api` en dev).
2. **Encabezados Estándar de Reverse Proxy:**
   En middlewares o proxies (`proxy.ts`), la reconstrucción del origen entrante DEBE basarse estrictamente en:
   ```typescript
   const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
   const protoHeader = request.headers.get("x-forwarded-proto") || (isProduction ? "https" : "http");
   const origin = hostHeader ? `${protoHeader}://${hostHeader}` : defaultCanonicalUrl;
   ```
   **Prohibido** mutar `hostHeader` buscando puertos específicos.

---

## 4. Validación de Orígenes (CORS y API Guards)

La validación de encabezados `Origin` (en `isAdminOrigin`, `isValidOrigin`, endpoints CSRF y webhooks):
1. **En Producción:** Valida estrictamente contra los dominios oficiales de Mocter (`admin.mocter.co`, `mocter.co`, `*.mocter.co`) o la lista autorizada en `ALLOWED_ORIGINS`.
2. **En Desarrollo:** Acepta `localhost`, `127.0.0.1` o subredes LAN privadas (`192.168.*`, `10.*`, `172.*`) basándose en el origen solicitado o en `ALLOWED_ORIGINS`, sin forzar ni hardcodear puertos en el núcleo de la lógica.

---

## 5. Lista de Verificación para el Agente (Auto-Check)

Antes de dar por concluida cualquier tarea de conectividad, proxy o autenticación:
- [ ] ¿Hay alguna llamada a `.replace(...)` manipulando puertos en URLs? (Si existe, ELIMINARLA).
- [ ] ¿Hay puertos quemados (`3000`, `3001`, `3003`) fuera de las variables de entorno de fallback local? (Si existen, EXTRAERLOS a `env.ts`).
- [ ] ¿El archivo `docker-compose.prod.yml` mantiene la política de cero puertos publicados (`R-10`) y labels de Traefik vigentes?
- [ ] ¿Las redirecciones funcionan fluidamente tanto bajo un subdominio DNS en producción como en loopback/LAN en desarrollo?

