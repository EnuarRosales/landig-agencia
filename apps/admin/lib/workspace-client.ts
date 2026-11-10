/**
 * Cliente HTTP tipado para operaciones del espacio de trabajo del comercio (`/workspace/*`).
 */
export async function workspaceFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(endpoint, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: errBody.detail || errBody.title || `Error ${res.status}: ${res.statusText}`,
      };
    }

    const json = await res.json();
    return { ok: true, data: json.data !== undefined ? json.data : json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de conexión con el servidor.",
    };
  }
}

