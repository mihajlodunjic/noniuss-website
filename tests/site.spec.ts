import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const routes = [
  {
    path: "/",
    slug: "home",
    activeNav: "Početna",
    heroSelector: ".home-hero",
    criticalImageSelector: ".home-hero__photo img"
  },
  {
    path: "/skola-jahanja/",
    slug: "school",
    activeNav: "Škola jahanja",
    heroSelector: ".content-page-hero",
    criticalImageSelector: ".content-page-hero__figure img"
  },
  {
    path: "/terensko-jahanje/",
    slug: "trail",
    activeNav: "Terensko jahanje",
    heroSelector: ".content-page-hero",
    criticalImageSelector: ".content-page-hero__figure img"
  },
  {
    path: "/o-klubu/",
    slug: "about",
    activeNav: "O klubu",
    heroSelector: ".content-page-hero",
    criticalImageSelector: ".content-page-hero__figure img"
  },
  {
    path: "/kontakt/",
    slug: "contact",
    activeNav: "Lokacija i kontakt",
    heroSelector: ".content-page-hero",
    criticalImageSelector: undefined
  },
  {
    path: "/nepostojeca-stranica/",
    slug: "404",
    heroSelector: ".not-found",
    criticalImageSelector: undefined
  }
] as const;

const auditViewports = [
  { width: 320, height: 568, label: "320x568" },
  { width: 360, height: 800, label: "360x800" },
  { width: 390, height: 844, label: "390x844" },
  { width: 430, height: 932, label: "430x932" },
  { width: 667, height: 375, label: "667x375" },
  { width: 844, height: 390, label: "844x390" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 820, height: 1180, label: "820x1180" },
  { width: 900, height: 900, label: "900x900" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1119, height: 800, label: "1119x800" },
  { width: 1120, height: 800, label: "1120x800" },
  { width: 1366, height: 900, label: "1366x900" },
  { width: 1440, height: 1000, label: "1440x1000" }
] as const;

const mobileMenuViewports = [
  { width: 360, height: 800, label: "360x800" },
  { width: 390, height: 844, label: "390x844" },
  { width: 667, height: 375, label: "667x375" },
  { width: 844, height: 390, label: "844x390" }
] as const;

const screenshotDir = path.resolve("test-results", "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

function assetRequest(pathname: string) {
  return /\.(avif|css|ico|jpg|jpeg|js|json|png|svg|txt|webmanifest|webp|woff2|xml)$/i.test(pathname);
}

function overlaps(a?: { left: number; right: number; top: number; bottom: number } | null, b?: { left: number; right: number; top: number; bottom: number } | null) {
  if (!a || !b) return false;
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function collectBrowserIssues(page: Page, baseURL: string | undefined) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const badAssetResponses: string[] = [];
  const localOrigin = baseURL ? new URL(baseURL).origin : "";

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!localOrigin || url.startsWith(localOrigin)) {
      requestFailures.push(`${request.method()} ${url} :: ${request.failure()?.errorText ?? "failed"}`);
    }
  });

  page.on("response", (response) => {
    if (!localOrigin) return;

    const url = new URL(response.url());
    if (url.origin !== localOrigin) return;
    if (!assetRequest(url.pathname)) return;
    if (response.status() >= 400) {
      badAssetResponses.push(`${response.status()} ${url.pathname}`);
    }
  });

  return { consoleErrors, pageErrors, requestFailures, badAssetResponses };
}

async function waitForHero(page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible();
}

async function progressivelyLoadImages(page: Page) {
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const decodeNearbyImages = async () => {
      const images = Array.from(document.querySelectorAll("img"));

      await Promise.all(
        images
          .filter((img) => {
            const rect = img.getBoundingClientRect();
            return rect.top < window.innerHeight * 1.6 && rect.bottom > -window.innerHeight * 0.4;
          })
          .map(async (img) => {
            if (typeof img.decode !== "function") return;
            try {
              await img.decode();
            } catch {
              /* ignore */
            }
          })
      );
    };

    const totalHeight = document.documentElement.scrollHeight;
    const step = Math.max(window.innerHeight * 0.72, 260);

    await decodeNearbyImages();

    for (let offset = 0; offset <= totalHeight; offset += step) {
      window.scrollTo(0, offset);
      await delay(140);
      await decodeNearbyImages();
    }

    window.scrollTo(0, totalHeight);
    await delay(180);
    await decodeNearbyImages();
    window.scrollTo(0, 0);
    await delay(140);
  });
}

async function saveScreenshot(page: Page, fileName: string) {
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    fullPage: true
  });
}

async function assertCommonPageHealth(page: Page, routeSlug: string, viewportWidth: number) {
  const checks = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll("img"));
    const canonical = document.querySelectorAll('link[rel="canonical"]').length;
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const brand = document.querySelector(".brand")?.getBoundingClientRect();
    const toggle = document.querySelector("[data-menu-toggle]")?.getBoundingClientRect();
    const desktopNav = document.querySelector(".site-header__nav")?.getBoundingClientRect();
    const desktopCta = document.querySelector(".site-header__cta")?.getBoundingClientRect();

    return {
      h1Count: document.querySelectorAll("h1").length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      imgWithoutAlt: images.filter((img) => !img.hasAttribute("alt")).map((img) => img.getAttribute("src") ?? ""),
      brokenImages: images
        .filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0)
        .map((img) => img.currentSrc),
      logoRatios: images
        .filter((img) => img.getAttribute("src")?.includes("/logo.png") && img.clientWidth > 0 && img.clientHeight > 0)
        .map((img) => ({
          natural: img.naturalWidth / img.naturalHeight,
          rendered: img.clientWidth / img.clientHeight
        })),
      canonical,
      metaDescription,
      lang: document.documentElement.lang,
      activeNav: document.querySelector('.site-header__nav a[aria-current="page"]')?.textContent?.trim() ?? "",
      brand,
      toggle,
      desktopNav,
      desktopCta
    };
  });

  expect(checks.lang).toBe("sr-Latn");
  expect(checks.h1Count).toBe(1);
  expect(checks.scrollWidth).toBeLessThanOrEqual(checks.clientWidth + 1);
  expect(checks.imgWithoutAlt, `${routeSlug} images without alt`).toEqual([]);
  expect(checks.brokenImages, `${routeSlug} broken images`).toEqual([]);
  expect(checks.canonical).toBe(1);
  expect(checks.metaDescription.length).toBeGreaterThan(20);

  for (const ratio of checks.logoRatios) {
    expect(Math.abs(ratio.natural - ratio.rendered)).toBeLessThan(0.03);
  }

  if (viewportWidth <= 1119) {
    expect(overlaps(checks.brand, checks.toggle)).toBeFalsy();
  }

  if (viewportWidth >= 1120) {
    expect(overlaps(checks.brand, checks.desktopNav)).toBeFalsy();
    expect(overlaps(checks.desktopNav, checks.desktopCta)).toBeFalsy();
  }
}

async function assertHeroLoading(page: Page, heroSelector: string) {
  const hero = page.locator(heroSelector).first();
  await expect(hero).toBeVisible();

  const heroCheck = await hero.evaluate((node) => {
    if (node instanceof HTMLImageElement) {
      return {
        type: "image",
        loading: node.getAttribute("loading"),
        fetchPriority: node.getAttribute("fetchpriority"),
        naturalWidth: node.naturalWidth
      };
    }

    const image = node.querySelector("img");
    return {
      type: "container",
      loading: image?.getAttribute("loading") ?? "",
      fetchPriority: image?.getAttribute("fetchpriority") ?? "",
      naturalWidth: image?.naturalWidth ?? 0
    };
  });

  expect(heroCheck.loading).toBe("eager");
  expect(heroCheck.fetchPriority).toBe("high");
  expect(heroCheck.naturalWidth).toBeGreaterThan(0);
}

async function expectHref(locator: Locator, href: string) {
  await expect(locator).toHaveAttribute("href", href);
}

test.describe("public route audit and screenshots", () => {
  for (const viewport of auditViewports) {
    for (const route of routes) {
      test(`${route.slug} @ ${viewport.label}`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const issues = await collectBrowserIssues(page, baseURL);

        const response = await page.goto(route.path, { waitUntil: "networkidle" });
        if (route.slug === "404") {
          expect(response?.status()).toBeGreaterThanOrEqual(400);
        } else {
          expect(response?.ok()).toBeTruthy();
        }

        await waitForHero(page, route.heroSelector);
        await progressivelyLoadImages(page);
        await assertCommonPageHealth(page, route.slug, viewport.width);
        if (route.criticalImageSelector) {
          await assertHeroLoading(page, route.criticalImageSelector);
        }

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

        if (viewport.width >= 1120 && route.slug !== "404") {
          await expect(page.locator(".site-header__nav a", { hasText: route.activeNav! })).toHaveAttribute(
            "aria-current",
            "page"
          );
        }

        await saveScreenshot(page, `${route.slug}-${viewport.label}-full.png`);

        const filteredConsoleErrors =
          route.slug === "404"
            ? issues.consoleErrors.filter((message) => !message.includes("404"))
            : issues.consoleErrors;

        expect(filteredConsoleErrors).toEqual([]);
        expect(issues.pageErrors).toEqual([]);
        expect(issues.requestFailures).toEqual([]);
        expect(issues.badAssetResponses).toEqual([]);
      });
    }
  }
});

test.describe("mobile menu behavior", () => {
  for (const viewport of mobileMenuViewports) {
    test(`menu flow @ ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/", { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 680));
      await page.waitForTimeout(150);

      const toggle = page.locator("[data-menu-toggle]");
      const overlay = page.locator("[data-menu-overlay]");
      const panel = page.locator("[data-menu-panel]");
      const closeButton = page.locator("[data-menu-close]");
      const menuPhone = page.locator('[data-menu-panel] a[href="tel:+381691662138"]').first();

      await expect(toggle).toBeVisible();
      await expect(toggle).toBeFocused({ timeout: 0 }).catch(() => undefined);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await saveScreenshot(page, `menu-${viewport.label}-closed.png`);

      const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
      await toggle.click();

      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(overlay).toBeVisible();
      await expect(panel).toHaveAttribute("aria-hidden", "false");
      await expect(closeButton).toBeVisible();
      await expect(closeButton).toBeFocused();
      await expect(menuPhone).toBeVisible();
      await expect(menuPhone).toHaveAttribute("href", "tel:+381691662138");
      await saveScreenshot(page, `menu-${viewport.label}-open.png`);

      const menuStateWhileOpen = await page.evaluate(() => ({
        bodyTop: document.body.style.top,
        bodyPosition: document.body.style.position,
        mainInert: (document.querySelector("[data-main]") as HTMLElement | null)?.inert ?? false
      }));

      expect(menuStateWhileOpen.bodyPosition).toBe("fixed");
      expect(menuStateWhileOpen.bodyTop).toBe(`-${scrollBeforeOpen}px`);
      expect(menuStateWhileOpen.mainInert).toBeTruthy();

      await page.mouse.click(20, 20);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      await page.keyboard.press("Tab");
      const focusAfterTab = await page.evaluate(() => {
        const panelElement = document.querySelector("[data-menu-panel]");
        return panelElement?.contains(document.activeElement) ?? false;
      });
      expect(focusAfterTab).toBeTruthy();
      await saveScreenshot(page, `menu-${viewport.label}-focused.png`);

      const focusableTexts = await page
        .locator('[data-menu-panel] a[href], [data-menu-panel] button')
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => (element.textContent || element.getAttribute("aria-label") || "").trim())
        );

      expect(focusableTexts.length).toBeGreaterThan(3);

      const firstFocusable = page.locator('[data-menu-panel] button[data-menu-close]').first();
      const lastFocusable = page.locator('[data-menu-panel] a[href]').last();
      await lastFocusable.focus();
      await page.keyboard.press("Tab");
      await expect(firstFocusable).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(lastFocusable).toBeFocused();

      await page.mouse.wheel(0, 600);
      const scrollDuringOpen = await page.evaluate(() => document.body.style.top);
      expect(scrollDuringOpen).toBe(`-${scrollBeforeOpen}px`);

      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();

      const scrollAfterClose = await page.evaluate(() => window.scrollY);
      expect(Math.abs(scrollAfterClose - scrollBeforeOpen)).toBeLessThanOrEqual(1);

      await toggle.click();
      await expect(closeButton).toBeVisible();
      await page.locator('[data-menu-panel] a[href="/o-klubu/"]').click();
      await expect(page).toHaveURL(/\/o-klubu\/$/);
      await expect(page.locator("[data-menu-toggle]")).toHaveAttribute("aria-expanded", "false");

      if (viewport.width === 360 || viewport.width === 390) {
        await page.goto("/", { waitUntil: "networkidle" });
        const rapidToggle = page.locator("[data-menu-toggle]");
        await rapidToggle.click();
        await rapidToggle.click();
        await rapidToggle.click();
        await expect(rapidToggle).toHaveAttribute("aria-expanded", "true");
        await page.locator("[data-menu-close]").click();
        await expect(rapidToggle).toHaveAttribute("aria-expanded", "false");
      }
    });
  }

  test("menu resets across the 1119/1120 breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1119, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });

    const toggle = page.locator("[data-menu-toggle]");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.setViewportSize({ width: 1120, height: 800 });
    await page.waitForTimeout(260);

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-menu-overlay]")).toBeHidden();
    await expect(page.locator(".site-header__nav")).toBeVisible();

    const menuLockState = await page.evaluate(() => ({
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      mainInert: (document.querySelector("[data-main]") as HTMLElement | null)?.inert ?? false
    }));

    expect(menuLockState.bodyPosition).toBe("");
    expect(menuLockState.bodyTop).toBe("");
    expect(menuLockState.mainInert).toBeFalsy();
  });

  test("background stays locked until close animation finishes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 540));
    await page.waitForTimeout(120);

    const toggle = page.locator("[data-menu-toggle]");
    const closeButton = page.locator("[data-menu-close]");
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);

    await toggle.click();
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    const lockDuringClose = await page.evaluate(() => ({
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      overlayState: document.querySelector("[data-menu-overlay]")?.getAttribute("data-state")
    }));

    expect(lockDuringClose.overlayState).toBe("closing");
    expect(lockDuringClose.bodyPosition).toBe("fixed");
    expect(lockDuringClose.bodyTop).toBe(`-${scrollBeforeOpen}px`);

    await page.waitForTimeout(280);

    const lockAfterClose = await page.evaluate(() => ({
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      scrollY: window.scrollY
    }));

    expect(lockAfterClose.bodyPosition).toBe("");
    expect(lockAfterClose.bodyTop).toBe("");
    expect(Math.abs(lockAfterClose.scrollY - scrollBeforeOpen)).toBeLessThanOrEqual(1);
  });
});

test.describe("skip link and navigation anchors", () => {
  for (const route of routes) {
    test(`skip link focuses main on ${route.slug}`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(route.path, { waitUntil: "networkidle" });
      await page.keyboard.press("Tab");
      const skipLink = page.locator(".skip-link");
      await expect(skipLink).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page.locator("#main-content")).toBeFocused();
      const mainTop = await page.locator("#main-content").evaluate((element) => element.getBoundingClientRect().top);
      expect(mainTop).toBeGreaterThanOrEqual(0);
    });
  }

  test("program and form anchors land correctly below the sticky header", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator('a[href="#programi"]').click();
    await expect(page).toHaveURL(/#programi$/);

    const programTop = await page.locator("#programi").evaluate((element) => element.getBoundingClientRect().top);
    expect(programTop).toBeGreaterThanOrEqual(0);

    await page.goto("/kontakt/", { waitUntil: "networkidle" });
    await page.goto("/kontakt/#kontakt-forma", { waitUntil: "networkidle" });
    const formTop = await page.locator("#kontakt-forma").evaluate((element) => element.getBoundingClientRect().top);
    expect(formTop).toBeGreaterThanOrEqual(0);
  });

  test("logo link always returns to the homepage", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    for (const route of routes.filter((entry) => entry.slug !== "home" && entry.slug !== "404")) {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await page.locator(".brand").click();
      await expect(page).toHaveURL(/\/$/);
    }
  });
});

test("contact form is always present, validates fields, and does not fake success without endpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/kontakt/", { waitUntil: "networkidle" });

  const form = page.locator("[data-contact-form]");
  await expect(form).toBeVisible();

  const submit = form.locator('[type="submit"]');
  await submit.click();

  await expect(page.locator("#error-full-name")).toHaveText("Unesite ime i prezime.");
  await expect(page.locator("#error-phone")).toHaveText(
    "Unesite broj telefona na koji možemo da vas kontaktiramo."
  );
  await expect(page.locator("#error-email")).toHaveText("Unesite ispravnu e-mail adresu.");
  await expect(page.locator("#error-rider-type")).toHaveText("Izaberite ko želi da jaše.");
  await expect(page.locator("#error-ride-type")).toHaveText("Izaberite šta vas zanima.");
  await expect(page.locator("#error-message")).toHaveText("Napišite kratku poruku.");

  await page.fill("#full-name", "Petar Petrović");
  await page.fill("#phone", "069 1234 567");
  await page.fill("#email", "petar@example.com");
  await page.selectOption("#rider-type", "Dete");
  await page.fill("#child-age", "9");
  await page.selectOption("#experience", "Prvi susret sa konjem");
  await page.selectOption("#ride-type", "Škola jahanja");
  await page.fill("#preferred-time", "Subota prepodne");
  await page.fill("#message", "Želim prvi dolazak za dete početnika.");

  await submit.click();
  await expect(page.locator("[data-form-status]")).toContainText(
    "Telefon i e-mail su trenutno najbrži način za upit."
  );

  await expectHref(page.locator('.contact-form__endpoint-actions a[href^="tel:"]').first(), "tel:+381691662138");
  await expectHref(
    page.locator('.contact-form__endpoint-actions a[href^="mailto:"]').first(),
    "mailto:kknonius@yahoo.com"
  );
});

test("FAQ items open and close with visible controls", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/kontakt/", { waitUntil: "networkidle" });

  const items = page.locator(".faq-block__item");
  await expect(items).toHaveCount(6);

  for (let index = 0; index < 6; index += 1) {
    const item = items.nth(index);
    const summary = item.locator("summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(item).toHaveAttribute("open", "");
    await summary.click();
    await expect(item).not.toHaveAttribute("open", "");
  }
});

test("critical href values are correct without triggering external actions", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 800 });
  await page.goto("/kontakt/", { waitUntil: "networkidle" });

  await expectHref(page.locator('a[href="tel:+381691662138"]').first(), "tel:+381691662138");
  await expectHref(page.locator('a[href="mailto:kknonius@yahoo.com"]').first(), "mailto:kknonius@yahoo.com");
  await expectHref(
    page.locator('a[href="https://www.instagram.com/konjickiklub_noniuss/"]').first(),
    "https://www.instagram.com/konjickiklub_noniuss/"
  );
  await expectHref(
    page.locator('a[href^="https://www.google.com/maps/search/"]').first(),
    "https://www.google.com/maps/search/?api=1&query=Gornje%20Me%C4%91urovo%20bb%2C%2018000%20Ni%C5%A1"
  );

  await page.goto("/nepostojeca-stranica/", { waitUntil: "networkidle" });
  await expectHref(page.locator('.not-found__actions a[href="/"]').first(), "/");
  await expectHref(page.locator('.not-found__actions a[href="/kontakt/"]').first(), "/kontakt/");
});

test("internal crawlable links resolve without 4xx", async ({ page, request, baseURL }) => {
  for (const route of routes.filter((entry) => entry.slug !== "404")) {
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
