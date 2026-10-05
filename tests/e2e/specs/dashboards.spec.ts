import { expect, test, type Page } from "@playwright/test";
import { freshTotp, loadState, totp, WEB_URL } from "../env.js";

const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
});

test.afterEach(() => {
  expect(pageErrors, "uncaught browser errors").toEqual([]);
});

/** Opens every sidebar link and waits for each screen to leave its loading state. */
async function visitEveryNavPage(page: Page) {
  const links = page.getByRole("navigation").getByRole("link");
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(`${WEB_URL}${href}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText(/Application error|Try again|do not have permission|refresh failed/)).toHaveCount(0);
  }
  return hrefs.length;
}

async function login(page: Page, email: string, password: string, totpSecret?: string) {
  await page.goto(`${WEB_URL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  if (totpSecret) {
    await page.getByLabel("Authenticator code").fill(await freshTotp(totpSecret));
    await page.getByRole("button", { name: "Verify and log in" }).click();
  }
}

test("admin needs MFA, then sees overview and a balanced ledger", async ({ page }) => {
  test.setTimeout(120_000);
  const { admin } = loadState();
  await login(page, admin.email, admin.password, admin.totpSecret);
  await expect(page).toHaveURL(`${WEB_URL}/admin`);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();

  await page.getByRole("link", { name: "Ledger" }).click();
  await expect(page.getByText("BALANCED", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  expect(await visitEveryNavPage(page)).toBe(14);
});

test("admin login with a wrong authenticator code is refused", async ({ page }) => {
  const { admin } = loadState();
  await page.goto(`${WEB_URL}/login`);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel("Authenticator code").fill(totp(admin.totpSecret, Date.now() - 10 * 60_000));
  await page.getByRole("button", { name: "Verify and log in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("reseller sees setup, sites, vouchers and wallet", async ({ page }) => {
  const { reseller, package: pkg } = loadState();
  await login(page, reseller.email, reseller.password);
  await expect(page).toHaveURL(`${WEB_URL}/reseller`);
  await expect(page.getByRole("heading", { name: "Smoke Cafe", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Sites" }).first().click();
  await expect(page.getByText("Smoke Cafe Kariakoo").first()).toBeVisible();

  await page.getByRole("link", { name: "Devices" }).first().click();
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();

  await page.getByRole("link", { name: "Vouchers" }).click();
  await expect(page.getByText("Batch A").first()).toBeVisible();

  await page.getByRole("link", { name: "Packages" }).click();
  await expect(page.getByText(pkg.name).first()).toBeVisible();

  await page.getByRole("link", { name: "Wallet" }).click();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  await expect(page.getByText(/^TZS [1-9][\d,]*$/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent ledger entries" })).toBeVisible();

  expect(await visitEveryNavPage(page)).toBe(10);
});

test("reseller is kept out of the admin area", async ({ page }) => {
  const { reseller } = loadState();
  await login(page, reseller.email, reseller.password);
  await expect(page).toHaveURL(`${WEB_URL}/reseller`);
  await page.goto(`${WEB_URL}/admin/ledger`);
  await expect(page).toHaveURL(`${WEB_URL}/reseller`);
});

test("agent sees the earned commission with its policy snapshot", async ({ page }) => {
  const { agent } = loadState();
  await login(page, agent.email, agent.password);
  await expect(page).toHaveURL(`${WEB_URL}/agent`);
  await expect(page.getByText(`/register?ref=${agent.referralCode}`)).toBeVisible();
  await expect(page.getByText("TZS 1,500").first()).toBeVisible();

  await page.getByRole("link", { name: "Commissions" }).click();
  await expect(page.getByRole("heading", { name: "Commissions" })).toBeVisible();
  await expect(page.getByText("TZS 1,500").first()).toBeVisible();

  expect(await visitEveryNavPage(page)).toBe(5);
});

test("unauthenticated dashboard visit redirects to login with next", async ({ page }) => {
  await page.goto(`${WEB_URL}/reseller/wallet`);
  await expect(page).toHaveURL(/\/login\?next=%2Freseller%2Fwallet/);
});
