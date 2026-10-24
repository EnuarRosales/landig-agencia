# Directiva · Internacionalización (i18n)

> Regla permanente para toda interfaz y texto visible al usuario de Mocter:
> `mocter-admin`, `apps/web` (landing), correos y notificaciones de cualquier
> aplicación derivada. No aplica a la interfaz de Chatwoot, que se rige por su
> propio sistema de idiomas.

## 1. Idiomas soportados

1. El sistema soporta **Español** e **Inglés** desde el inicio.
2. **Español es el idioma por defecto** de todo el sistema (`es`).
3. El conjunto soportado (`es`, `en`) se valida por la aplicación, sin `CHECK` en la base; agregar un idioma no exige reestructurar componentes ni migrar el esquema.

## 2. Textos

1. Ningún texto visible se escribe incrustado en un componente: vive en diccionarios por idioma (`es`, `en`).
2. Aplica a la interfaz, mensajes de error, correos, notificaciones y textos accesibles (`aria-label`, `alt`).
3. Identificadores, comentarios y artefactos técnicos siguen las convenciones propias del proyecto (TSDoc en español); esta directiva gobierna el texto que el usuario ve.

## 3. Resolución del idioma activo

1. Con inquilino: preferencia del usuario → `clients.locale` → configuración regional del navegador → defecto `es`.
2. Sin inquilino (landing, login, registro): preferencia del usuario → configuración regional del navegador → defecto `es`.
3. Formatos de fecha, número y moneda según el locale activo.

## 4. Verificación

1. Un texto sin traducción al otro idioma es un defecto, no una mejora futura.
2. Cada string nuevo ingresa en ambos diccionarios en la misma entrega.
3. Las pruebas recorren las vistas clave en `es` y en `en`.
