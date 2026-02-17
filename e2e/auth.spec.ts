import { test, expect } from '@playwright/test';

test.describe('Authentication flows', () => {
  test('should navigate to the sign-up page and display the form', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /first name/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /last name/i })).toBeVisible();
  });

  test('should show validation errors on empty sign-up submit', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /sign up|create|registrieren/i }).click();
    // Expect at least one validation message to appear
    await expect(page.locator('[role="alert"], .text-rose-200, .text-red-400').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate to the login page and display the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('should show error on invalid login credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('nonexistent@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('WrongPassword1!');
    await page.getByRole('button', { name: /sign in|log ?in|anmelden/i }).click();
    await expect(page.locator('[role="alert"], .text-rose-200, .text-red-400').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate from login to sign-up via link', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('should navigate from sign-up to login via link', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('link', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should navigate to forgot-password page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot|password reset|passwort vergessen/i }).click();
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();
  });

  test('should redirect unauthenticated user from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('should log out and redirect to home or login', async ({ page }) => {
    // This test requires a valid session — skip gracefully if login fails
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill(process.env.E2E_TEST_EMAIL ?? 'e2e-test@invoice2e.local');
    await page.getByRole('textbox', { name: /password/i }).fill(process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.getByRole('button', { name: /sign in|log ?in|anmelden/i }).click();

    // If login succeeds, test logout
    const loggedIn = await page.waitForURL('**/dashboard**', { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!loggedIn) {
      test.skip();
      return;
    }

    // Look for logout button/link in header or sidebar
    const logoutTrigger = page.getByRole('button', { name: /log ?out|abmelden|sign ?out/i }).or(
      page.getByRole('link', { name: /log ?out|abmelden|sign ?out/i }),
    );
    await logoutTrigger.first().click();
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });
});
