"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

interface CookieCategory {
  id: "essential" | "support" | "analytics";
  title: string;
  description: string;
  required: boolean;
  cookies: string[];
}

export function CookiePreferences() {
  const locale = useLocale();
  const isEs = locale === "es";

  const [preferences, setPreferences] = useState({
    essential: true,
    support: true,
    analytics: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("mocter_cookie_preferences");
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences((prev) => ({ ...prev, ...parsed, essential: true }));
      }
    } catch {
      // Fallback a valores por defecto
    }
  }, []);

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
          <button
            type="button"
            onClick={acceptAll}
            className="cursor-pointer rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            {isEs ? "Aceptar todas" : "Accept all"}
          </button>
          <button
            type="button"
            onClick={rejectOptional}
            className="cursor-pointer rounded-full border border-stroke bg-bg2 px-4 py-2 text-xs font-semibold text-muted transition hover:text-txt"
          >
            {isEs ? "Solo esenciales" : "Essentials only"}
          </button>
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
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isChecked}
                    disabled={cat.required}
                    onChange={() => {
                      if (!cat.required) {
                        handleToggle(cat.id as "support" | "analytics");
                      }
                    }}
                  />
                  <div
                    className={`peer h-6 w-11 rounded-full bg-stroke transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-a1 peer-checked:after:translate-x-full peer-focus:outline-none ${
                      cat.required ? "cursor-not-allowed opacity-60" : ""
                    }`}
                  />
                </label>
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
          <button
            type="button"
            onClick={() => savePreferences()}
            className="cursor-pointer rounded-full bg-txt px-5 py-2.5 text-xs font-semibold text-bg transition hover:opacity-90"
          >
            {isEs ? "Guardar cambios" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
