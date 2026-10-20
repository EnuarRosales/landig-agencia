import { test, expect } from "@playwright/test";

test.describe("Landing page (i18n + theme)", () => {
  test("renders Spanish homepage with Mocter branding", async ({ page }) => {
    await page.goto("/es");

    await expect(page.locator("h1, h2, h3, h4, .eyebrow").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Mocter/i })).toBeVisible();
    await expect(
      page.getByText("Automatiza la atención, el agendamiento y las ventas"),
    ).toBeVisible();
  });

  test("renders English homepage with Mocter branding", async ({ page }) => {
    await page.goto("/en");

    await expect(page.locator("h1, h2, h3, h4, .eyebrow").first()).toBeVisible();
    await expect(
      page.getByText("Automate customer support, scheduling and sales"),
    ).toBeVisible();
  });

  test("switches locale from /es to /en", async ({ page }) => {
    await page.goto("/es");
    await expect(
      page.getByText("Solicitar demo gratis", { exact: true }),
    ).toBeVisible();

    const enLink = page.getByRole("link", { name: /en/i });
    if ((await enLink.count()) > 0) {
      await enLink.first().click();
    } else {
      await page.goto("/en");
    }

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
