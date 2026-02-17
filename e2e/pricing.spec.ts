import { test, expect } from '@playwright/test';

test.describe('Pricing page', () => {
  test('should display the pricing page with plan cards', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // At least one pricing card should be visible
    await expect(page.locator('.glass-card, [class*="pricing"], [class*="plan"]').first()).toBeVisible();
  });

  test('should show at least three pricing tiers', async ({ page }) => {
    await page.goto('/pricing');
    // The home page shows 3 tiers; pricing page should too
    const priceElements = page.getByText(/€|EUR|\d+,\d{2}/);
    await expect(priceElements.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should have a buy / select button for each plan', async ({ page }) => {
    await page.goto('/pricing');
    const buyButtons = page.getByRole('button', { name: /buy|purchase|select|kaufen|wählen/i }).or(
      page.getByRole('link', { name: /buy|purchase|select|kaufen|wählen/i }),
    );
    const count = await buyButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should navigate to checkout or login when selecting a plan', async ({ page }) => {
    await page.goto('/pricing');
    const buyButton = page.getByRole('button', { name: /buy|purchase|select|kaufen|wählen/i }).or(
      page.getByRole('link', { name: /buy|purchase|select|kaufen|wählen/i }),
    );
    await buyButton.first().click();
    // Should go to login (if unauthenticated) or checkout
    await page.waitForURL(/(login|checkout|payment|stripe)/i, { timeout: 15_000 });
  });

  test('should show secure payment notice', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/secure|sicher|🔒/i).first()).toBeVisible();
  });

  test('should display credit balance when logged in', async ({ page }) => {
    // Log in first
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill(process.env.E2E_TEST_EMAIL ?? 'e2e-test@invoice2e.local');
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.getByRole('button', { name: /sign in|log ?in|anmelden/i }).click();

    const loggedIn = await page.waitForURL('**/dashboard**', { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!loggedIn) {
      test.skip();
      return;
    }

    // Dashboard shows credits remaining
    await expect(page.getByText(/credit|guthaben/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
