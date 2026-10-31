import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(__dirname, "../app/globals.css"),
  "utf8",
);

const localeLayoutTsx = readFileSync(
  resolve(__dirname, "../app/[locale]/layout.tsx"),
  "utf8",
);

const loginPageTsx = readFileSync(
  resolve(__dirname, "../app/[locale]/(auth)/login/page.tsx"),
  "utf8",
);

const registerPageTsx = readFileSync(
  resolve(__dirname, "../app/[locale]/(auth)/register/page.tsx"),
  "utf8",
);

const oauthButtonsTsx = readFileSync(
  resolve(__dirname, "../components/auth/oauth-buttons.tsx"),
  "utf8",
);

const navbarTsx = readFileSync(
  resolve(__dirname, "../components/nav.tsx"),
  "utf8",
);

const pricingSectionTsx = readFileSync(
  resolve(__dirname, "../components/sections/pricing-section.tsx"),
  "utf8",
);

/**
 * Calcula la luminancia relativa WCAG 2.x de un color hexadecimal `#RRGGBB`.
 */
function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calcula la razón de contraste WCAG 2.2 entre dos colores hexadecimales.
 */
function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("DSN-001 T-02 · Tokens en 3 capas (@theme), contraste WCAG 2.2 AA y preferencia de sistema", () => {
  it("define las 3 capas canónicas de tokens: primitivos, semánticos (claro/oscuro) y capa de marca", () => {
    // Capa 1: Primitivos (espaciado 4px, radios sm..full, dimensiones y motion 150-240ms)
    expect(globalsCss).toContain("--primitive-space-1: 0.25rem;");
    expect(globalsCss).toContain("--primitive-radius-sm: 0.375rem;");
    expect(globalsCss).toContain("--primitive-radius-md: 0.5rem;");
    expect(globalsCss).toContain("--primitive-radius-lg: 0.75rem;");
    expect(globalsCss).toContain("--primitive-radius-xl: 1rem;");
    expect(globalsCss).toContain("--primitive-sidebar-width: 260px;");
    expect(globalsCss).toContain("--primitive-content-max-width: 720px;");
    expect(globalsCss).toContain("--primitive-touch-target: 44px;");
    expect(globalsCss).toContain("--primitive-duration-fast: 150ms;");
    expect(globalsCss).toContain("--primitive-duration-slow: 240ms;");

    // Capa 2: Semánticos oscuros y claros de DSN-001 §3.1
    expect(globalsCss).toContain("--dsn-background: #0a0a0b;");
    expect(globalsCss).toContain("--dsn-surface: #121214;");
    expect(globalsCss).toContain("--dsn-text: #ededef;");
    expect(globalsCss).toContain("--dsn-text-secondary: #8d8d93;");
    expect(globalsCss).toContain("--dsn-accent: #22d3ee;");

    expect(globalsCss).toContain("--dsn-background: #f9f9f9;");
    expect(globalsCss).toContain("--dsn-surface: #ffffff;");
    expect(globalsCss).toContain("--dsn-text: #09090b;");
    expect(globalsCss).toContain("--dsn-text-secondary: #71717a;");
    expect(globalsCss).toContain("--dsn-accent: #0891b2;");

    // Capa 3: Tokens de marca desacoplados de los primitivos
    expect(globalsCss).toContain("--brand-primary:");
    expect(globalsCss).toContain("--brand-accent: var(--dsn-accent);");
    expect(globalsCss).toContain("--color-accent: var(--brand-accent);");
    // Ningún token primitivo referencia variables --brand-*
    const primitiveMatches = globalsCss.match(/--primitive-[a-z0-9-]+:\s*([^;]+);/g) ?? [];
    expect(primitiveMatches.length).toBeGreaterThanOrEqual(10);
    for (const line of primitiveMatches) {
      expect(line).not.toContain("--brand-");
    }
  });

  it("aprueba contraste WCAG 2.2 AA en modo oscuro y modo claro sobre background y surface", () => {
    // Modo oscuro (background #0a0a0b, surface #121214)
    expect(contrastRatio("#ededef", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ededef", "#121214")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#8d8d93", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#8d8d93", "#121214")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#22d3ee", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#3ddc97", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#f5a524", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ff6b6b", "#0a0a0b")).toBeGreaterThanOrEqual(4.5);

    // Modo claro (background #f9f9f9, surface #ffffff)
    expect(contrastRatio("#09090b", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#09090b", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#71717a", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#71717a", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#15803d", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#15803d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#a16207", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#a16207", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#dc2626", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#dc2626", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#0e7490", "#f9f9f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#0891b2", "#ffffff")).toBeGreaterThanOrEqual(3.0);
  });

  it("respeta la preferencia del sistema (enableSystem) y usa oscuro como fallback del primer render", () => {
    expect(localeLayoutTsx).toContain("defaultTheme={siteConfig.theme.defaultTheme}");
    expect(localeLayoutTsx).toContain("enableSystem");
    expect(localeLayoutTsx).not.toContain("enableSystem={false}");
    expect(localeLayoutTsx).toContain('className={`dark ${chakraPetch.variable}');
  });
});

describe("DSN-001 T-03 · Fuentes self-hosted (Chakra Petch, Inter, IBM Plex Mono)", () => {
  it("configura las tres familias tipográficas vía next/font/google (self-hosted en build) con display swap y subset es/en", () => {
    expect(localeLayoutTsx).toContain("Chakra_Petch");
    expect(localeLayoutTsx).toContain("Inter");
    expect(localeLayoutTsx).toContain("IBM_Plex_Mono");
    expect(localeLayoutTsx).toContain('subsets: ["latin", "latin-ext"]');
    expect(localeLayoutTsx).toContain('display: "swap"');
    // Sin enlaces externos en runtime a Google Fonts CDN
    expect(localeLayoutTsx).not.toContain("fonts.googleapis.com");
    expect(localeLayoutTsx).not.toContain("fonts.gstatic.com");
  });

  it("aplica tabular-nums a cifras de KPI/mono y fuente de texto en peso 600 a títulos de página", () => {
    expect(globalsCss).toContain("font-variant-numeric: tabular-nums;");
    expect(globalsCss).toMatch(/\.page-title\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-weight:\s*600;/);
  });
});

describe("LND-001 T-09 (Fase 1) · Criterios BDD CA-LND-01 a CA-LND-04 y CA-AUTH-02 en UI", () => {
  it("CA-LND-01 y CA-LND-02 · Oculta #planes si no hay planes públicos activos y muestra Iniciar sesión contiguo a Solicitar demo en el header", () => {
    expect(pricingSectionTsx).toContain("if (!plans || plans.length === 0)");
    expect(pricingSectionTsx).toContain("return null;");
    expect(navbarTsx).toContain("hasPublicPlans ? [{ href: `/${locale}#planes`");
    expect(navbarTsx).toContain("href={`/${locale}/login`}");
  });

  it("CA-LND-03 y CA-LND-04 · Enlaza CTA de plan a /register?plan_code=<slug> con badge de plan e interconecta /login y /register", () => {
    expect(pricingSectionTsx).toContain("register?plan_code=${plan.code}");
    expect(registerPageTsx).toContain("selectedPlan = await getPlanByCode(planCodeParam)");
    expect(registerPageTsx).toContain('t("selectedPlan")');
    expect(loginPageTsx).toContain("href={`/${locale}/register`}");
    expect(registerPageTsx).toContain("href={`/${locale}/login`}");
  });

  it("CA-AUTH-02 · OAuthButtons filtra dinámicamente los proveedores habilitados desde auth_providers_config", () => {
    expect(oauthButtonsTsx).toContain('enabledProviders.includes("google")');
    expect(oauthButtonsTsx).toContain('enabledProviders.includes("facebook")');
    expect(loginPageTsx).toContain("authService.getEnabledOAuthProviders()");
    expect(registerPageTsx).toContain("authService.getEnabledOAuthProviders()");
  });
});
