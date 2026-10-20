import { test, expect } from "@playwright/test";

test.describe("Landing page (i18n + theme)", () => {
  test("renders Spanish homepage with Mocter branding", async ({ page }) => {
    await page.goto("/es");

    // El logo es el único link con este nombre accesible exacto.
    // Un regex /Mocter/i también matchea el mailto info@mocter.co de la sección de contacto.
    await expect(page.getByRole("link", { name: "Mocter — inicio" })).toBeVisible();
    await expect(page.locator("h1").first()).toContainText(
      "Automatiza la atención, el agendamiento y las ventas de tu empresa con IA",
    );
  });

  test("renders English homepage with Mocter branding", async ({ page }) => {
    await page.goto("/en");

    await expect(page.getByRole("link", { name: "Mocter — home" })).toBeVisible();
    await expect(page.locator("h1").first()).toContainText(
      "Automate the support, scheduling and sales of your business with AI",
    );
  });

  test("switches locale from /es to /en", async ({ page }) => {
    await page.goto("/es");
    await expect(
      page.getByText("Solicitar demo gratis", { exact: true }),
    ).toBeVisible();

    // El selector de idioma es un group de botones (ES / EN), no links.
    await page.getByRole("button", { name: "EN", exact: true }).click();

    await expect(page).toHaveURL(/\/en(\/|$)/);
    await expect(
      page.getByText("Book a free demo", { exact: true }),
    ).toBeVisible();
  });

  test("renders the demo request form", async ({ page }) => {
    await page.goto("/es");

    await expect(page.getByLabel("Nombre")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Teléfono (WhatsApp)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Enviar solicitud/ })).toBeVisible();
  });

  test("toggles light/dark theme", async ({ page }) => {
    await page.goto("/es");

    const themeToggle = page.getByLabel("Cambiar tema");
    await expect(themeToggle).toBeVisible();

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    await themeToggle.click();
    await expect(html).not.toHaveClass(/dark/);
  });
});
