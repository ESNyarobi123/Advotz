import { expect, test } from "@playwright/test";
import { API_URL, loadState, PORTAL_URL } from "../env.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("advo:lang", "en"));
});

test("guest buys a package from the captive portal (simulated payment)", async ({ page, request }) => {
  const { site, package: pkg } = loadState();
  const redirect = new URLSearchParams({
    clientMac: "5C-CF-7F-00-E2-E1",
    apMac: "AC:84:C6:00:00:01",
    ssidName: "Smoke WiFi",
    radioId: "1",
    clientIp: "10.1.0.77",
  });
  await page.goto(`${PORTAL_URL}/${site.slug}?${redirect}`);

  // Redirect parameters are stored server-side and stripped from the address bar.
  await expect(page).toHaveURL(`${PORTAL_URL}/${site.slug}`);
  await expect(page.getByText(pkg.name)).toBeVisible();
  await expect(page.getByText("TZS 1,000")).toBeVisible();

  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByLabel("Mobile money number").fill("0754 000 222");
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Last name").fill("M");
  await page.getByLabel("Email for receipt").fill("asha@example.com");
  await page.getByRole("button", { name: /Pay now/ }).click();

  await expect(page).toHaveURL(new RegExp(`/${site.slug}/payment/`));
  await expect(page.getByText("Waiting for payment confirmation…").first()).toBeVisible();

  const orderToken = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
  const sim = await request.post(`${API_URL}/api/v1/dev/simulate/orders/${orderToken}/payment`, {
    data: { outcome: "completed", feeTzs: 20 },
  });
  expect(sim.status()).toBe(201);

  await expect(page.getByText("Your WiFi is ready to use.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Expires/)).toBeVisible();
});

test("portal without a WiFi redirect cannot buy", async ({ page }) => {
  const { site } = loadState();
  await page.goto(`${PORTAL_URL}/${site.slug}`);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: "Buy" }).first()).toBeDisabled();
});

test("voucher activates, then a second device is held to the package device limit", async ({ browser, page }) => {
  const { site, voucherCodes } = loadState();
  const code = voucherCodes[0]!;

  async function redeemFrom(p: typeof page, mac: string, voucher = code) {
    await p.goto(`${PORTAL_URL}/${site.slug}?clientMac=${mac}&apMac=AC:84:C6:00:00:01&ssidName=Smoke%20WiFi&radioId=1`);
    await expect(p).toHaveURL(`${PORTAL_URL}/${site.slug}`);
    await p.getByRole("link", { name: "Have a voucher?" }).click();
    await p.getByLabel("Voucher code").fill(voucher);
    await p.getByRole("button", { name: "Use voucher" }).click();
  }

  await redeemFrom(page, "5C-CF-7F-00-E2-E2");
  await expect(page).toHaveURL(new RegExp(`/${site.slug}/status\\?token=`));
  await expect(page.getByText("Your WiFi is ready to use.")).toBeVisible({ timeout: 20_000 });

  const other = await browser.newContext({ timezoneId: "Africa/Dar_es_Salaam" });
  const otherPage = await other.newPage();
  await otherPage.addInitScript(() => localStorage.setItem("advo:lang", "en"));
  // Re-entering a redeemed code joins the same grant, so the 1-device package refuses a second phone.
  await redeemFrom(otherPage, "5C-CF-7F-00-E2-E3");
  await expect(otherPage.getByText("Device limit reached for this package.")).toBeVisible();

  await otherPage.getByLabel("Voucher code").fill("ZZZZ-ZZZZ-ZZZZ");
  await otherPage.getByRole("button", { name: "Use voucher" }).click();
  await expect(otherPage.getByText("This voucher has already been used or has expired.")).toBeVisible();
  await other.close();
});
