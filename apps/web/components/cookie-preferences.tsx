"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Button, Switch } from "@mocter/ui";

interface CookieCategory {
  id: "essential" | "support" | "analytics";
  title: string;
  description: string;
  required: boolean;
  cookies: string[];
}

/**
 * Estado de consentimiento gestionado por el panel de configuración de cookies.
 */
interface CookiePreferencesState {
  essential: boolean;
  support: boolean;
  analytics: boolean;
}

/**
 * Preferencias por defecto; las cookies esenciales permanecen siempre activas.
 */
const DEFAULT_COOKIE_PREFERENCES: CookiePreferencesState = {
  essential: true,
  support: true,
  analytics: true,
};

export function CookiePreferences() {
  const locale = useLocale();
  const isEs = locale === "es";

  const [preferences, setPreferences] = useState<CookiePreferencesState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_COOKIE_PREFERENCES;
    }
    try {
      const stored = window.localStorage.getItem("mocter_cookie_preferences");
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CookiePreferencesState>;
        return { ...DEFAULT_COOKIE_PREFERENCES, ...parsed, essential: true };
      }
    } catch {
      // Fallback a valores por defecto
    }
    return DEFAULT_COOKIE_PREFERENCES;
  });
  const [saved, setSaved] = useState(false);

  const handleToggle = (key: "support" | "analytics") => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSaved(false);
  };

  const savePreferences = (custom?: typeof preferences) => {
    const toSave = custom || preferences;
    try {
      localStorage.setItem("mocter_cookie_preferences", JSON.stringify(toSave));
    } catch {
      // ignore
    }
    setPreferences(toSave);
    setSaved(true);
    setTimeout(() => setSaved(false), 3500);
  };

  const acceptAll = () => {
    const all = { essential: true, support: true, analytics: true };
    savePreferences(all);
  };

  const rejectOptional = () => {
    const min = { essential: true, support: false, analytics: false };
    savePreferences(min);
  };

  const categories: CookieCategory[] = [
    {
      id: "essential",
      title: isEs ? "Cookies Técnicas y Esenciales" : "Essential & Technical Cookies",
      description: isEs
        ? "Son estrictamente necesarias para el funcionamiento del sitio web, navegación segura y retención de tus preferencias básicas de interfaz."
        : "Strictly necessary for website operation, secure navigation, and remembering your basic UI preferences.",
      required: true,
      cookies: ["NEXT_LOCALE", "mocter-theme", "__Host-csrf"],
    },
    {
      id: "support",
      title: isEs ? "Cookies de Soporte en Vivo (Chatwoot)" : "Live Support Cookies (Chatwoot)",
      description: isEs
        ? "Permiten mantener tu sesión activa con nuestro equipo de atención y soporte técnico a través del widget de chat integrado."
        : "Maintains your active session with our live support and customer service team through the integrated chat widget.",
      required: false,
      cookies: ["cw_conversation", "cw_user", "chatwoot_session"],
    },
    {
      id: "analytics",
      title: isEs ? "Cookies de Rendimiento y Análisis" : "Performance & Analytics Cookies",
      description: isEs
        ? "Recopilan estadísticas de uso completamente agregadas y anónimas para ayudarnos a optimizar la velocidad y experiencia de navegación."
        : "Collects aggregated, anonymous usage metrics to help us optimize page speed and overall browsing experience.",
      required: false,
      cookies: ["_mocter_perf", "_mocter_visit"],
    },
  ];

  return (
    <div className="rounded-2xl border border-stroke bg-surface p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-txt">
            {isEs ? "Panel de Gestión de Cookies" : "Cookie Management Panel"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isEs
              ? "Configura qué tecnologías de almacenamiento y rastreo permites en este navegador."
              : "Configure which storage and tracking technologies you permit in this browser."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={acceptAll}
            className="min-h-[36px] rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
          >
            {isEs ? "Aceptar todas" : "Accept all"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={rejectOptional}
            className="min-h-[36px] rounded-full border-stroke bg-bg2 px-4 py-2 text-xs font-semibold text-muted hover:text-txt"
          >
            {isEs ? "Solo esenciales" : "Essentials only"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((cat) => {
          const isChecked = cat.required ? true : preferences[cat.id];

          return (
            <div
              key={cat.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-stroke/70 bg-bg2/40 p-5 transition hover:border-stroke sm:flex-row sm:items-center"
            >
              <div className="max-w-2xl">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-txt">{cat.title}</h3>
                  {cat.required ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {isEs ? "Siempre activa" : "Always active"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted/15 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                      {isEs ? "Opcional" : "Optional"}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{cat.description}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted/80">
                  <span className="font-medium text-txt/80">
                    {isEs ? "Identificadores:" : "Identifiers:"}
                  </span>
                  {cat.cookies.map((c) => (
                    <code
                      key={c}
                      className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-a2"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              </div>

              <div className="flex items-center self-end sm:self-center">
                <Switch
                  checked={isChecked}
                  disabled={cat.required}
                  aria-label={cat.title}
                  onCheckedChange={() => {
                    if (!cat.required) {
                      handleToggle(cat.id as "support" | "analytics");
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-stroke pt-5">
        <p className="text-xs text-muted">
          {isEs
            ? "Tus preferencias se guardan localmente y puedes modificarlas en cualquier momento."
            : "Your preferences are stored locally and can be changed at any time."}
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {isEs ? "Preferencias guardadas" : "Preferences saved"}
            </span>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => savePreferences()}
            className="min-h-[38px] rounded-full bg-txt px-5 py-2.5 text-xs font-semibold text-bg hover:bg-txt hover:opacity-90"
          >
            {isEs ? "Guardar cambios" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
