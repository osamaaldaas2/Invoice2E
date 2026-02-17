import { test as base, type Page } from '@playwright/test';

/** Test user credentials — set via environment or use defaults. */
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e-test@invoice2e.local';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'Test1234!';

/**
 * Log in through the UI and return the authenticated page.
 * Reusable helper for any spec that needs a logged-in session.
 */
export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /sign in|log ?in|anmelden/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15_000 });
}

/** Extended test fixtures that expose an already-authenticated page. */
type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
