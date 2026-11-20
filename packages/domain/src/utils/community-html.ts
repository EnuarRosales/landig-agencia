const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);

const BLOCK_ALIGN_TAGS = new Set(["p", "div", "h2", "h3", "h4", "blockquote", "li"]);
const SELF_CLOSING_TAGS = new Set(["br"]);

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeSafeLinkHref(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function extractSafeAlignment(attrsRaw: string): "left" | "center" | "right" | null {
  const styleMatch = attrsRaw.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const styleVal = styleMatch?.[1] ?? styleMatch?.[2] ?? "";
  if (styleVal) {
    const alignMatch = styleVal.match(/text-align\s*:\s*(left|center|right)/i);
    if (alignMatch?.[1]) {
      return alignMatch[1].toLowerCase() as "left" | "center" | "right";
    }
  }
  const alignAttrMatch = attrsRaw.match(/\balign\s*=\s*(?:"(left|center|right)"|'(left|center|right)'|(left|center|right))/i);
  const attrAlign = alignAttrMatch?.[1] ?? alignAttrMatch?.[2] ?? alignAttrMatch?.[3];
  return attrAlign ? (attrAlign.toLowerCase() as "left" | "center" | "right") : null;
}

/**
 * Sanitiza el fragmento HTML de una publicación del muro comunitario (`SPEC-15-D11`, `RN-SPEC-15-10`).
 *
 * Elimina etiquetas ejecutables o arbitrarias (`<script>`, `<style>`, `<iframe>`, `<img>`, eventos `on*`),
 * conserva únicamente marcado tipográfico seguro (`p`, `br`, `strong`, `em`, `u`, `h3`, `ul`, `ol`, `li`,
 * `blockquote`, `a[href^=https?://]`) y preserva únicamente alineación `text-align: left|center|right`.
 *
 * @param rawHtml - HTML crudo ingresado por el editor visual del compositor.
 * @returns HTML sanitizado listo para persistir o renderizar en cliente.
 */
export function sanitizeCommunityPostHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  // 1. Eliminar bloques peligrosos completos con su contenido interno y comentarios HTML
  const withoutDangerousBlocks = rawHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|form|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|form|input|textarea|button|meta|link|base|img)\b[^>]*\/?>/gi, "");

  // 2. Filtrar y reconstruir etiqueta por etiqueta según whitelist estricta
  const sanitizedTags = withoutDangerousBlocks
    .replace(
      /<\s*(\/?)\s*([a-zA-Z0-9]+)(\s[^>]*)?\s*(\/?)>/g,
      (_full, closingSlash: string, rawTagName: string, rawAttrs: string | undefined) => {
        const tag = rawTagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          return "";
        }

        if (closingSlash === "/") {
          return SELF_CLOSING_TAGS.has(tag) ? "" : `</${tag}>`;
        }

        if (tag === "br") {
          return "<br />";
        }

        const attrs = rawAttrs ?? "";
        if (tag === "a") {
          const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const rawHref = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "";
          const safeHref = normalizeSafeLinkHref(rawHref);
          if (!safeHref) {
            return "<a>";
          }
          return `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noopener noreferrer nofollow">`;
        }

        if (BLOCK_ALIGN_TAGS.has(tag)) {
          const align = extractSafeAlignment(attrs);
          if (align) {
            return `<${tag} style="text-align: ${align};">`;
          }
        }

        return `<${tag}>`;
      },
    )
    .trim();

  // 3. Auto-enlazar URLs crudas http(s):// en nodos de texto fuera de etiquetas <a> existentes
  return linkifyPlainUrlsOutsideAnchors(sanitizedTags);
}

function linkifyPlainUrlsInSegment(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"']+/gi, (rawMatch) => {
    let urlCandidate = rawMatch;
    let trailing = "";
    while (/[.,;:!?)]$/.test(urlCandidate)) {
      if (urlCandidate.endsWith(")") && (urlCandidate.match(/\(/g)?.length ?? 0) >= (urlCandidate.match(/\)/g)?.length ?? 0)) {
        break;
      }
      trailing = `${urlCandidate.slice(-1)}${trailing}`;
      urlCandidate = urlCandidate.slice(0, -1);
    }
    const safe = normalizeSafeLinkHref(urlCandidate);
    if (!safe) return rawMatch;
    return `<a href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer nofollow">${urlCandidate}</a>${trailing}`;
  });
}

function linkifyPlainUrlsOutsideAnchors(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  let anchorDepth = 0;
  return parts
    .map((part) => {
      if (!part) return part;
      if (part.startsWith("<")) {
        if (/^<\s*a\b/i.test(part)) anchorDepth += 1;
        else if (/^<\s*\/\s*a\b/i.test(part) && anchorDepth > 0) anchorDepth -= 1;
        return part;
      }
      return anchorDepth === 0 ? linkifyPlainUrlsInSegment(part) : part;
    })
    .join("");
}

/**
 * Convierte texto plano de una publicación heredada en HTML seguro con auto-enlace de URLs `http(s)://`.
 */
export function formatPlainPostHtmlWithLinks(plainText: string): string {
  if (!plainText) return "";
  const escaped = plainText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return linkifyPlainUrlsInSegment(escaped).replaceAll("\n", "<br />");
}

/**
 * Extrae el texto visible plano de una publicación HTML sanitizada para validaciones de longitud mínima/máxima.
 */
export function extractPlainTextFromCommunityHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h2|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SafeVideoEmbedResult =
  | { ok: true; embedUrl: string; provider: "youtube" | "vimeo" }
  | { ok: false; error: string };

/**
 * Valida y normaliza un enlace externo de video hacia una URL `embed` segura de YouTube o Vimeo
 * (`SPEC-15-D11`, `RN-SPEC-15-10`). Rechaza cualquier otro proveedor o esquema.
 *
 * @param rawUrl - URL pegada por el autor (ej. `https://www.youtube.com/watch?v=...`, `https://youtu.be/...`, `https://vimeo.com/...`).
 */
export function resolveSafeVideoEmbedUrl(rawUrl: string): SafeVideoEmbedResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Ingresa un enlace válido de YouTube o Vimeo." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "El enlace de video no tiene un formato URL válido." };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Solo se admiten enlaces http o https de YouTube o Vimeo." };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return { ok: true, provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    return { ok: false, error: "Identificador de video YouTube inválido." };
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const segments = parsed.pathname.split("/").filter(Boolean);
    let videoId = "";
    if (segments[0] === "watch") {
      videoId = parsed.searchParams.get("v")?.trim() ?? "";
    } else if (
      (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") &&
      segments[1]
    ) {
      videoId = segments[1].trim();
    }
    if (/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      return { ok: true, provider: "youtube", embedUrl: `https://www.youtube.com/embed/${videoId}` };
    }
    return { ok: false, error: "No se pudo identificar el video de YouTube en el enlace." };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const id = host === "player.vimeo.com" && segments[0] === "video" ? segments[1] : segments[segments.length - 1];
    if (id && /^\d{5,15}$/.test(id)) {
      return { ok: true, provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
    return { ok: false, error: "Identificador de video Vimeo inválido." };
  }

  return {
    ok: false,
    error: "Por seguridad, solo se permiten enlaces de YouTube o Vimeo para incrustar video.",
  };
}
