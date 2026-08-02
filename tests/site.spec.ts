import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/", slug: "home" },
  { path: "/skola-jahanja/", slug: "school" },
  { path: "/terensko-jahanje/", slug: "trail" },
  { path: "/o-klubu/", slug: "about" },
  { path: "/kontakt/", slug: "contact" },
  { path: "/nepostojeca-stranica/", slug: "404" }
] as const;

const viewports = [
  { width: 360, height: 800, label: "360x800" },
  { width: 390, height: 844, label: "390x844" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1440, height: 1000, label: "1440x1000" }
] as const;

const screenshotDir = path.resolve("test-results", "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

async function collectBrowserIssues(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "failed"}`);
  });

  return { consoleErrors, pageErrors, requestFailures };
}

async function assertCommonPageHealth(page: Page) {
  const checks = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll("img"));
    const h1Count = document.querySelectorAll("h1").length;
    const scrollWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    const imgWithoutAlt = images.filter((img) => !img.hasAttribute("alt")).length;
    const brokenImages = images.filter((img) => img.naturalWidth === 0).length;
    const logoRatios = images
      .filter((img) => img.getAttribute("src")?.includes("/logo.png") && img.clientWidth > 0 && img.clientHeight > 0)
      .map((img) => ({
        natural: img.naturalWidth / img.naturalHeight,
        rendered: img.clientWidth / img.clientHeight
      }));
    const canonical = document.querySelectorAll('link[rel="canonical"]').length;
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";

    return {
      h1Count,
      scrollWidth,
      viewportWidth,
      imgWithoutAlt,
      brokenImages,
      logoRatios,
      canonical,
      metaDescription,
      lang: document.documentElement.lang
    };
  });

  expect(checks.lang).toBe("sr-Latn");
  expect(checks.h1Count).toBe(1);
  expect(checks.scrollWidth).toBeLessThanOrEqual(checks.viewportWidth + 1);
  expect(checks.imgWithoutAlt).toBe(0);
  expect(checks.brokenImages).toBe(0);
  expect(checks.canonical).toBe(1);
  expect(checks.metaDescription.length).toBeGreaterThan(20);

  for (const ratio of checks.logoRatios) {
    expect(Math.abs(ratio.natural - ratio.rendered)).toBeLessThan(0.03);
  }
}

async function saveScreenshot(page: Page, routeSlug: string, viewportLabel: string) {
  await page.screenshot({
    path: path.join(screenshotDir, `${routeSlug}-${viewportLabel}.png`),
    fullPage: true
  });
}

async function loadLazyContent(page: Page) {
  await page.evaluate(async () => {
    const totalHeight = document.documentElement.scrollHeight;
    const step = Math.max(window.innerHeight * 0.8, 320);

    for (let offset = 0; offset < totalHeight; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    window.scrollTo(0, totalHeight);
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  });
}

test.describe("public routes visual and functional audit", () => {
  for (const viewport of viewports) {
    for (const route of routes) {
      test(`${route.slug} @ ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const issues = await collectBrowserIssues(page);

        const response = await page.goto(route.path, { waitUntil: "networkidle" });
        if (route.slug === "404") {
          expect(response?.status()).toBeGreaterThanOrEqual(400);
        } else {
          expect(response?.ok()).toBeTruthy();
        }

        await loadLazyContent(page);
        await assertCommonPageHealth(page);
        const hasVisiblePhoneLink = await page
          .locator('a[href="tel:+381691662138"]')
          .evaluateAll((elements) =>
            elements.some((element) => {
              const style = window.getComputedStyle(element);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                element.getClientRects().length > 0
              );
            })
          );
        expect(hasVisiblePhoneLink).toBeTruthy();
        await saveScreenshot(page, route.slug, viewport.label);

        const consoleErrors =
          route.slug === "404"
            ? issues.consoleErrors.filter((message) => !message.includes("404 (Not Found)"))
            : issues.consoleErrors;

        expect(consoleErrors).toEqual([]);
        expect(issues.pageErrors).toEqual([]);
        expect(issues.requestFailures).toEqual([]);
      });
    }
  }
});

test("mobile menu interaction, focus trap and close behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const toggle = page.locator("[data-menu-toggle]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-menu-panel]")).toHaveAttribute("aria-hidden", "false");
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("menu-open"))).toBeTruthy();

  await page.keyboard.press("Tab");
  const activeInsidePanel = await page.evaluate(() => {
    const panel = document.querySelector("[data-menu-panel]");
    return panel?.contains(document.activeElement) ?? false;
  });
  expect(activeInsidePanel).toBeTruthy();

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-menu-panel]")).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('[data-menu-panel] a[href="/o-klubu/"]').click();
  await expect(page).toHaveURL(/\/o-klubu\/$/);
  await expect(page.locator("[data-menu-toggle]")).toHaveAttribute("aria-expanded", "false");
});

test("contact form validation and no-endpoint fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/kontakt/", { waitUntil: "networkidle" });

  const submit = page.locator('[data-contact-form] [type="submit"]');
  await submit.click();

  await expect(page.locator("#error-full-name")).toHaveText("Unesite ime i prezime.");
  await expect(page.locator("#error-phone")).toHaveText(
    "Unesite broj telefona na koji možemo da vas kontaktiramo."
  );
  await expect(page.locator("#error-email")).toHaveText("Unesite ispravnu e-mail adresu.");
  await expect(page.locator("#error-rider-type")).toHaveText("Izaberite ko želi da jaše.");
  await expect(page.locator("#error-message")).toHaveText("Napišite kratku poruku.");

  await page.fill("#full-name", "Petar Petrović");
  await page.fill("#phone", "069 1234 567");
  await page.fill("#email", "petar@example.com");
  await page.selectOption("#rider-type", "Odrasla osoba");
  await page.selectOption("#experience", "Prvi susret sa konjem");
  await page.selectOption("#ride-type", "Škola jahanja");
  await page.fill("#preferred-time", "Subota prepodne");
  await page.fill("#message", "Želim prvi dolazak za odraslog početnika.");

  await submit.click();
  await expect(page.locator("[data-form-status]")).toContainText(
    "Telefon i e-mail su trenutno najbrži način za upit."
  );
});

test("internal crawlable links resolve without 4xx", async ({ page, request, baseURL }) => {
  for (const route of routes.filter((route) => route.slug !== "404")) {
    await page.goto(route.path, { waitUntil: "networkidle" });

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="/"]'))
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href && !href.startsWith("/#"))
    );

    const uniqueHrefs = [...new Set(hrefs.map((href) => href.split("#")[0]))];

    for (const href of uniqueHrefs) {
      const response = await request.get(new URL(href, baseURL).toString());
      expect(response.status(), `${route.path} -> ${href}`).toBeLessThan(400);
    }
  }
});
