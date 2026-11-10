import { config } from "./config.mjs";

/**
 * Opaque-box HTTP client with cookie jar and redirect capture.
 * Accurately models browser session interactions against Admin and Web portals.
 */

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setCookie(headerStr, domain = "") {
    if (!headerStr) return;
    const parts = headerStr.split(";").map((p) => p.trim());
    if (parts.length === 0) return;
    const [nameVal] = parts;
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx !== -1) {
      const name = nameVal.substring(0, eqIdx).trim();
      const val = nameVal.substring(eqIdx + 1).trim();
      this.cookies.set(name, val);
    }
  }

  set(name, val) {
    this.cookies.set(name, val);
  }

  get(name) {
    return this.cookies.get(name);
  }

  toHeaderString() {
    const list = [];
    for (const [name, val] of this.cookies.entries()) {
      list.push(`${name}=${val}`);
    }
    return list.join("; ");
  }

  clear() {
    this.cookies.clear();
  }
}

export class HttpClient {
  constructor(baseUrl = config.adminUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.jar = new CookieJar();
  }

  setSession(sessionId) {
    this.jar.set("mocter_sid", sessionId);
  }

  clearSession() {
    this.jar.clear();
  }

  /**
   * Send HTTP request.
   * @param {string} path - URL path (e.g. "/admin/cells" or "/onboarding")
   * @param {object} options
   */
  async request(path, options = {}) {
    const {
      method = "GET",
      body = null,
      headers = {},
      followRedirects = false,
      timeout = config.timeouts.defaultRequestMs,
    } = options;

    const fullUrl = path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    const reqHeaders = {
      ...headers,
    };

    const cookieHeader = this.jar.toHeaderString();
    if (cookieHeader) {
      reqHeaders["Cookie"] = cookieHeader;
    }

    let payload = body;
    if (body && typeof body === "object" && !(body instanceof Buffer) && !(body instanceof Uint8Array)) {
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
      payload = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(fullUrl, {
        method,
        headers: reqHeaders,
        body: payload,
        redirect: followRedirects ? "follow" : "manual",
        signal: controller.signal,
      });

      // Update cookie jar from response set-cookie headers
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      if (Array.isArray(setCookies)) {
        for (const sc of setCookies) {
          this.jar.setCookie(sc);
        }
      } else {
        const sc = res.headers.get("set-cookie");
        if (sc) {
          this.jar.setCookie(sc);
        }
      }

      const status = res.status;
      const responseHeaders = Object.fromEntries(res.headers.entries());
      const location = res.headers.get("location");
      const contentType = res.headers.get("content-type") || "";

      let text = "";
      let json = null;

      try {
        text = await res.text();
        if (contentType.includes("application/json")) {
          json = JSON.parse(text);
        }
      } catch {
        // Ignored if unparseable
      }

      return {
        status,
        ok: res.ok,
        headers: responseHeaders,
        location,
        text,
        json,
        url: res.url,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get(path, options = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  post(path, body, options = {}) {
    return this.request(path, { ...options, method: "POST", body });
  }

  put(path, body, options = {}) {
    return this.request(path, { ...options, method: "PUT", body });
  }

  delete(path, options = {}) {
    return this.request(path, { ...options, method: "DELETE" });
  }
}
