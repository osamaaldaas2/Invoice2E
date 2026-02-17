# E2E Tests — Invoice2E

End-to-end tests powered by [Playwright](https://playwright.dev/).

## Prerequisites

```bash
npm install            # install project deps (includes @playwright/test)
npx playwright install # download browser binaries
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | App URL |
| `E2E_TEST_EMAIL` | `e2e-test@invoice2e.local` | Seeded test user email |
| `E2E_TEST_PASSWORD` | `Test1234!` | Seeded test user password |

Place a sample invoice at `e2e/fixtures/sample-invoice.pdf` for the upload tests.

## Running

```bash
# Start the dev server first
npm run dev

# In another terminal
npm run test:e2e          # headless, all browsers
npm run test:e2e:ui       # interactive Playwright UI
npx playwright test --project=chromium  # single browser
```

## Reports

After a run, open the HTML report:

```bash
npx playwright show-report
```

Screenshots (on failure) and videos (on retry) are saved in `test-results/`.
