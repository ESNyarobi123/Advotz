import { expect, test } from "@playwright/test";
import { WEB_URL } from "../env.js";

const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
});

test.afterEach(() => {
  expect(pageErrors, "uncaught browser errors").toEqual([]);
});

test("marketing landing page renders with complete brand aesthetic and working interactive widgets", async ({ page }) => {
  await page.goto(`${WEB_URL}/`);

  // 1. Verify Logo & Headline
  await expect(page.getByRole("link", { name: "Advo TZ" }).first()).toBeVisible();
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toContainText("Badili WiFi Yako Kuwa");
  await expect(heading).toContainText("Mashine Ya Mapato");

  // 2. Interactive Simulator Test (Guest View)
  await expect(page.getByText("Live Interactive Simulator")).toBeVisible();
  await expect(page.getByText("Kama Mteja Anavyoona (Captive Portal)")).toBeVisible();

  // Select 3 hours package
  const pkgBtn = page.getByRole("button", { name: /Masaa 3/i });
  await expect(pkgBtn).toBeVisible();
  await pkgBtn.click();

  // Click simulate button
  const simulateBtn = page.getByRole("button", { name: /Lipia TZS 2,500 & Unganishwa/i });
  await expect(simulateBtn).toBeVisible();
  await simulateBtn.click();

  // Wait for connected state
  await expect(page.getByText("Umeunganishwa Kwenye Internet!")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Muda Uliobaki")).toBeVisible();

  // Switch to Reseller View
  const resellerTabBtn = page.getByRole("button", { name: /Kama Mmiliki Anavyoona/i });
  await resellerTabBtn.click();
  await expect(page.getByText("TZS 342,500")).toBeVisible();
  await expect(page.getByText("Miamala ya Hivi Punde (Live Ledger Feed)")).toBeVisible();

  // 3. Interactive Revenue Calculator Test
  await expect(page.locator("#calculator").getByText("Kikokotoo cha Mapato")).toBeVisible();
  const hotelBtn = page.getByRole("button", { name: "Hoteli & Lodges" });
  await expect(hotelBtn).toBeVisible();
  await hotelBtn.click();
  await expect(page.getByText("Faida Yako Halisi Mfukoni (Net Profit):")).toBeVisible();

  // 4. FAQ Accordion Test
  const faqBtn = page.getByRole("button", { name: /Je, nahitaji vifaa gani vya TP-Link Omada/i });
  await expect(faqBtn).toBeVisible();
  await faqBtn.click();
  await expect(page.getByText(/Unahitaji TP-Link Omada Controller/i)).toBeVisible();

  // 5. Test Marketing Subpages
  await page.goto(`${WEB_URL}/features`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Captive Portal ya Kisasa ya Simu")).toBeVisible();

  await page.goto(`${WEB_URL}/pricing`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Professional Plan")).toBeVisible();

  await page.goto(`${WEB_URL}/contact`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("support@advo.tz")).toBeVisible();
});
