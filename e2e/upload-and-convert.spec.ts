import { test, expect } from './fixtures/auth.fixture';
import path from 'node:path';

/**
 * E2E: Upload a PDF invoice → wait for AI extraction → review data →
 * select output format → convert → download the resulting file.
 *
 * Requires a running dev server with valid API keys and a seeded test user.
 * Place a sample PDF at e2e/fixtures/sample-invoice.pdf before running.
 */
const SAMPLE_PDF = path.resolve(__dirname, 'fixtures', 'sample-invoice.pdf');

test.describe('Upload and convert flow', () => {
  test('should upload a PDF and reach the review page', async ({ authenticatedPage: page }) => {
    // Dashboard should contain the upload area
    await expect(page.getByText(/upload/i).first()).toBeVisible();

    // Upload a file via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);

    // Wait for extraction to start — the app redirects to /review/:id
    await page.waitForURL('**/review/**', { timeout: 60_000 });
    await expect(page.url()).toMatch(/\/review\//);
  });

  test('should display extracted invoice data on the review page', async ({ authenticatedPage: page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForURL('**/review/**', { timeout: 60_000 });

    // Key fields should be visible (invoice number, amounts, dates, etc.)
    await expect(page.getByText(/invoice|rechnung/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test('should allow selecting output format on the review page', async ({ authenticatedPage: page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForURL('**/review/**', { timeout: 60_000 });

    // Look for format selector (XRechnung / ZUGFeRD / etc.)
    const formatSelector = page.getByRole('combobox').or(page.getByRole('listbox')).or(page.locator('select'));
    const selectorVisible = await formatSelector.first().isVisible().catch(() => false);

    if (selectorVisible) {
      await formatSelector.first().click();
    }
    // Verification: the page should contain format-related text
    await expect(page.getByText(/xrechnung|zugferd|format/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should convert and trigger a file download', async ({ authenticatedPage: page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForURL('**/review/**', { timeout: 60_000 });

    // Click the convert / download button
    const convertButton = page.getByRole('button', { name: /convert|download|herunterladen|konvertieren/i });
    await expect(convertButton.first()).toBeVisible({ timeout: 30_000 });

    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await convertButton.first().click();
    const download = await downloadPromise;

    // Verify the download is an XML file
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/\.(xml|zip)$/i);
  });
});
