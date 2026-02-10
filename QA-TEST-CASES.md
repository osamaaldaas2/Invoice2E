# QA Test Cases — Invoice2E.1

> 120 test cases for comprehensive QA testing.
> Priority: P0 = critical, P1 = high, P2 = medium, P3 = low
> Status: PASS / FAIL / BLOCKED / SKIP

---

## 1. Authentication & Session Management

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-001 | Sign up with valid data | Go to /signup, fill all fields (first name, last name, email, password), submit | Account created, redirect to /dashboard, welcome email sent | P0 |
| TC-002 | Sign up with existing email | Use an email that already exists | Error message "Email already registered" shown | P0 |
| TC-003 | Sign up with weak password | Use password < 8 chars or missing requirements | Validation error shown, form not submitted | P1 |
| TC-004 | Sign up with invalid email format | Enter "not-an-email" as email | Validation error shown | P1 |
| TC-005 | Login with valid credentials | Go to /login, enter correct email + password | Redirect to /dashboard, session created | P0 |
| TC-006 | Login with wrong password | Enter correct email + wrong password | Error "Invalid credentials" shown | P0 |
| TC-007 | Login with non-existent email | Enter email not in system | Error "Invalid credentials" shown (no email enumeration) | P1 |
| TC-008 | Logout | Click logout button in header | Session destroyed, redirect to /login | P0 |
| TC-009 | Session persistence on refresh | Login, refresh browser | User stays logged in, dashboard loads | P0 |
| TC-010 | Session expiry | Wait for session to expire (or manually clear cookie) | Redirected to /login on next action | P1 |
| TC-011 | Protected route without auth | Navigate directly to /dashboard without login | Redirected to /login | P0 |
| TC-012 | Protected route /review/:id without auth | Navigate directly to /review/some-id | Redirected to /login | P1 |
| TC-013 | Protected route /convert/:id without auth | Navigate directly to /convert/some-id | Redirected to /login | P1 |
| TC-014 | Forgot password — valid email | Go to /forgot-password, enter registered email | Success message "Reset link sent", email received | P0 |
| TC-015 | Forgot password — non-existent email | Enter unregistered email | Same success message (no email enumeration) | P1 |
| TC-016 | Reset password — valid token | Click reset link from email, enter new password | Password updated, can login with new password | P0 |
| TC-017 | Reset password — expired token | Use an expired reset link | Error "Token expired" shown | P1 |
| TC-018 | Reset password — already used token | Use a reset link that was already used | Error "Token already used" shown | P1 |

---

## 2. Dashboard

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-019 | Dashboard loads with stats | Login, navigate to /dashboard | Stats cards show correct values (Total Conversions, Credits Remaining, Success Rate) | P0 |
| TC-020 | Dashboard — recent conversions | Complete at least one conversion, go to dashboard | Recent Conversions section shows the conversion | P0 |
| TC-021 | Dashboard — drafts section | Upload a file (creates extraction), don't convert, go to dashboard | Drafts section shows the draft with "Resume" button | P1 |
| TC-022 | Dashboard — resume draft | Click "Resume" on a draft item | Navigates to /review/:extractionId with data loaded | P1 |
| TC-023 | Dashboard — empty state | New user with no conversions | Shows "No conversions yet" and "No drafts yet" messages | P2 |
| TC-024 | Dashboard — credits link | Click Credits Remaining card | Navigates to /pricing page | P2 |
| TC-025 | Dashboard — analytics link | Click Success Rate card | Navigates to /dashboard/analytics | P2 |
| TC-026 | Dashboard — sidebar navigation | Click each sidebar item (History, Analytics, Templates, Credits, Bulk Upload) | Each page loads correctly | P1 |
| TC-027 | Dashboard — mobile navigation | On mobile (< 768px), check horizontal nav tabs | Nav tabs scroll horizontally, active tab highlighted | P1 |

---

## 3. File Upload (Single Invoice)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-028 | Upload valid PDF invoice | On dashboard, upload a valid PDF invoice | Extraction succeeds, redirect to /review/:id | P0 |
| TC-029 | Upload valid image invoice (JPG) | Upload a JPG invoice image | Extraction succeeds, redirect to /review/:id | P0 |
| TC-030 | Upload valid image invoice (PNG) | Upload a PNG invoice image | Extraction succeeds, redirect to /review/:id | P1 |
| TC-031 | Upload invalid file type | Upload a .txt or .docx file | Error "Invalid file type" shown | P0 |
| TC-032 | Upload oversized file | Upload a file > max allowed size | Error about file size shown | P1 |
| TC-033 | Upload with zero credits | User with 0 credits tries to upload | Error "Insufficient credits" shown | P0 |
| TC-034 | Upload — drag and drop | Drag a valid PDF into the upload zone | File accepted, extraction begins | P1 |
| TC-035 | Upload — loading state | Upload a file, observe UI | Spinner shown, "Extracting..." text, button disabled | P1 |
| TC-036 | Upload — error recovery | Upload fails (e.g., network error), try again | Error shown, user can retry upload | P2 |

---

## 4. Invoice Review

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-037 | Review page loads with extracted data | After upload, land on /review/:id | Form populated with AI-extracted data (invoice number, dates, seller, buyer, line items) | P0 |
| TC-038 | Review — edit invoice number | Change invoice number in form | Value updates, form is valid | P1 |
| TC-039 | Review — edit seller info | Modify seller name, address, tax ID | Values update correctly | P1 |
| TC-040 | Review — edit buyer info | Modify buyer name, address, tax ID | Values update correctly | P1 |
| TC-041 | Review — edit line items | Change quantity or unit price of a line item | Total recalculates automatically | P0 |
| TC-042 | Review — add line item | Click "Add Line Item" button | New empty row added, can fill in details | P1 |
| TC-043 | Review — remove line item | Click remove/delete on a line item | Item removed, totals recalculate | P1 |
| TC-044 | Review — required field validation | Clear a required field (e.g., invoice number), try to proceed | Validation error shown, cannot proceed | P0 |
| TC-045 | Review — proceed to convert | Fill all required fields, click "Convert" / "Proceed" | Navigates to /convert/:id, review data saved to sessionStorage | P0 |
| TC-046 | Review — cancel / back to dashboard | Click "Cancel" button | Returns to /dashboard | P2 |
| TC-047 | Review — unauthorized access | Try to access /review/:id for another user's extraction | Error "Unauthorized access" shown | P0 |
| TC-048 | Review — progress steps display | Check progress bar at top | Upload=check, Review=active(2), Convert=inactive(3), Download=inactive(4) | P2 |
| TC-049 | Review — confidence score display | After extraction, check confidence indicator | Confidence score/percentage shown | P3 |

---

## 5. XRechnung Conversion

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-050 | Convert to XRechnung — success | On /convert/:id, click "Convert to XRechnung" | XML generated, preview shown, success message | P0 |
| TC-051 | Convert — loading state | Click convert, observe during processing | Spinner, "Generating XML..." text, button disabled | P1 |
| TC-052 | Convert — download XML | After conversion, click "Download XML File" | XML file downloads as invoice_xrechnung.xml | P0 |
| TC-053 | Convert — XML preview | After conversion, check XML preview section | XML content shown in code block | P1 |
| TC-054 | Convert — back to review | Click "Back to Review" before converting | Returns to /review/:id with data intact | P1 |
| TC-055 | Convert — missing sessionStorage | Clear sessionStorage, try to convert | Error "No review data found. Please go back to review step." | P1 |
| TC-056 | Convert — start new after download | After downloading, click "Start New Invoice" | Returns to /dashboard | P2 |
| TC-057 | Convert — credit deduction | Convert an invoice, check credits | 1 credit deducted from user's balance | P0 |
| TC-058 | Convert — progress steps display | Check progress bar | Upload=check, Review=check, Convert=active(3) | P2 |

---

## 6. Bulk Upload

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-059 | Bulk upload — valid ZIP file | Navigate to /invoices/bulk-upload, upload ZIP with valid invoices | Batch job created, progress shown | P0 |
| TC-060 | Bulk upload — processing status | Upload ZIP, observe status updates | Shows processing progress (X/Y files completed) | P0 |
| TC-061 | Bulk upload — results display | After batch completes | Shows success/failure for each file in the batch | P0 |
| TC-062 | Bulk upload — mixed results | Upload ZIP with some valid and invalid files | Partial success, each file's status shown individually | P1 |
| TC-063 | Bulk upload — insufficient credits | Upload ZIP requiring more credits than available | Error about insufficient credits | P0 |
| TC-064 | Bulk upload — review individual result | Click on a successfully extracted item in batch results | Opens review page for that extraction | P1 |
| TC-065 | Bulk upload — empty ZIP | Upload a ZIP with no invoice files | Error message about no valid files | P2 |
| TC-066 | Bulk upload — invalid file type | Upload a non-ZIP file on bulk upload page | Error "Invalid file type" | P1 |

---

## 7. Credit System & Payment

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-067 | View pricing page | Navigate to /pricing | Credit packages displayed with prices | P0 |
| TC-068 | Stripe checkout — initiate | Select a package, click buy with Stripe | Redirected to Stripe checkout page | P0 |
| TC-069 | Stripe checkout — complete payment | Complete payment on Stripe | Redirected back, credits added to account | P0 |
| TC-070 | Stripe checkout — cancel | Cancel on Stripe checkout | Redirected to cancel page, no credits added | P1 |
| TC-071 | PayPal checkout — initiate | Select a package, click buy with PayPal | PayPal modal/redirect opens | P0 |
| TC-072 | PayPal checkout — complete payment | Complete PayPal payment | Credits added to account | P0 |
| TC-073 | Payment verify — idempotency | Call /api/payments/verify twice with same session | Credits added only once (second call returns "Already processed") | P0 |
| TC-074 | Credit balance display — dashboard | After purchase, check dashboard | Credits Remaining card shows updated balance | P0 |
| TC-075 | Credit balance display — credits page | Navigate to /dashboard/credits | Current balance shown correctly | P1 |
| TC-076 | Credit deduction on conversion | Convert an invoice | Credits balance decremented by 1 | P0 |
| TC-077 | Credit history — purchase appears | Buy credits, go to /dashboard/credits | Transaction shows "Credit Purchase" label (not raw source) | P0 |
| TC-078 | Credit history — conversion debit appears | Convert an invoice, check credit history | Debit entry shown with negative amount | P1 |
| TC-079 | Credit history — pagination | Have > 10 transactions, check pagination | Next/Previous buttons work, page indicator correct | P2 |
| TC-080 | Credit history — empty state | New user with no transactions | Shows "No transactions yet" message | P2 |
| TC-081 | Voucher redemption | Enter a valid voucher code on credits page | Credits added, voucher marked as used, history entry created | P1 |
| TC-082 | Voucher — already used | Enter a voucher code that was already redeemed | Error "Voucher already redeemed" | P1 |
| TC-083 | Voucher — expired | Enter an expired voucher code | Error "Voucher expired" | P2 |
| TC-084 | Voucher — invalid code | Enter a non-existent voucher code | Error "Invalid voucher code" | P1 |

---

## 8. Analytics Page

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-085 | Analytics page loads | Navigate to /dashboard/analytics | Stats summary cards show correct values (non-zero for active user) | P0 |
| TC-086 | Analytics — Total Conversions matches dashboard | Compare analytics page total vs dashboard page total | Same number on both pages | P0 |
| TC-087 | Analytics — Success Rate | Check success rate card | Shows correct percentage (successful / total * 100) | P1 |
| TC-088 | Analytics — Credits Used | Check credits used card | Shows total credits consumed | P1 |
| TC-089 | Analytics — Credits Remaining | Check credits remaining card | Matches dashboard and /dashboard/credits balance | P1 |
| TC-090 | Analytics — charts display | Check if conversion charts render | Daily conversions chart, format distribution, weekly trend shown | P2 |
| TC-091 | Analytics — period filter | Change period (week/month/year) | Charts update with correct date range | P2 |

---

## 9. Conversion History

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-092 | History page loads | Navigate to /dashboard/history | List of all conversions, drafts, and batch jobs shown | P0 |
| TC-093 | History — filter by status (completed) | Select "Completed" filter | Only completed conversions shown | P1 |
| TC-094 | History — filter by status (draft) | Select "Draft" filter | Only draft items shown | P1 |
| TC-095 | History — pagination | Have > 20 items, check pagination | Pages work correctly, page indicator accurate | P2 |
| TC-096 | History — batch job display | Complete a bulk upload, check history | Batch job shown with file count (e.g., "Batch (5 files)") | P1 |
| TC-097 | History — batch deduplication | Check that individual files from a batch are not also shown as separate items | No duplicates between batch and individual entries | P1 |
| TC-098 | History — only shows user's own data | Login as user A, check history | Only user A's conversions shown, not other users' | P0 |
| TC-099 | History — CSV export | Click "Export CSV" button | CSV file downloads with all history items | P2 |

---

## 10. Admin Panel

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-100 | Admin access — authorized | Login as admin, navigate to /admin | Admin dashboard loads with stats | P0 |
| TC-101 | Admin access — unauthorized | Login as regular user, navigate to /admin | Access denied / redirect to dashboard | P0 |
| TC-102 | Admin — user list | Go to admin users page | List of all users with emails, roles, creation dates | P1 |
| TC-103 | Admin — create voucher | Create a new voucher with credits amount and optional expiry | Voucher created, code displayed | P1 |
| TC-104 | Admin — view vouchers | Go to admin vouchers page | List of all vouchers with status (active/used/expired) | P1 |
| TC-105 | Admin — view transactions | Go to admin transactions page | List of all payment transactions across all users | P1 |
| TC-106 | Admin — packages management | Go to admin packages page | Credit packages listed with prices and credit amounts | P1 |
| TC-107 | Admin — responsive layout | Check admin pages on mobile (414px) | Content doesn't overflow, sidebar collapses | P2 |

---

## 11. Responsive Design (Mobile)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-108 | Dashboard on iPhone (414px) | Open /dashboard in 414px viewport | No horizontal overflow, all cards visible, no content cut off | P0 |
| TC-109 | Dashboard on iPhone SE (375px) | Open /dashboard in 375px viewport | No horizontal overflow, text wraps properly | P0 |
| TC-110 | Review page on mobile | Open /review/:id on mobile | Form fields stack vertically, progress steps fit, no cutoff | P1 |
| TC-111 | Convert page on mobile | Open /convert/:id on mobile | Buttons full width, XML preview scrollable, no cutoff | P1 |
| TC-112 | History page on mobile | Open /dashboard/history on mobile | Items display correctly, no overflow | P1 |
| TC-113 | Pricing page on mobile | Open /pricing on mobile | Cards stack vertically, buttons visible | P1 |
| TC-114 | Home page on mobile | Open / on mobile | Hero section, features, CTA all visible | P1 |
| TC-115 | Header on mobile | Check header at 414px | Hamburger menu works, logo + menu button visible | P1 |
| TC-116 | Bulk upload on mobile | Open /invoices/bulk-upload on mobile | Upload zone fits screen, instructions readable | P2 |
| TC-117 | Credits page on mobile | Open /dashboard/credits on mobile | Balance, history, voucher form all fit | P2 |
| TC-118 | No horizontal scroll on any page | Test all pages at 375px and 414px width | `document.documentElement.scrollWidth <= window.innerWidth` on every page | P0 |

---

## 12. Internationalization (i18n)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-119 | Language switch to German | Switch language to DE in header | All UI text shows in German | P1 |
| TC-120 | Language switch to English | Switch language to EN | All UI text shows in English | P1 |
| TC-121 | German — dashboard labels | Switch to DE, check dashboard | "Gesamtkonvertierungen", "Verbleibende Guthaben", etc. | P1 |
| TC-122 | German — credit history labels | Switch to DE, check credit history | Transaction labels in German (not raw source strings) | P1 |
| TC-123 | Date format — DE locale | Switch to DE, check dates anywhere | Dates in DD.MM.YYYY format | P2 |
| TC-124 | Date format — EN locale | Switch to EN, check dates | Dates in DD/MM/YYYY format | P2 |
| TC-125 | Language persistence | Switch to DE, refresh page | Language stays DE after refresh | P2 |

---

## 13. Error Handling & Edge Cases

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-126 | 404 page | Navigate to /nonexistent-route | Custom 404 page shown | P2 |
| TC-127 | API error — network failure | Disable network, try an action | Appropriate error message shown, no crash | P1 |
| TC-128 | API error — 500 response | Simulate server error | Error message shown, app doesn't crash | P1 |
| TC-129 | ErrorBoundary — component crash | Trigger a React error in a component | ErrorBoundary catches it, fallback UI shown | P2 |
| TC-130 | Rate limiting | Make many rapid API requests | After limit exceeded, 429 response with retry-after | P1 |
| TC-131 | Concurrent tab sessions | Login in two tabs, logout in one | Other tab detects session end on next action | P2 |
| TC-132 | XSS prevention — invoice data | Upload invoice with `<script>alert('xss')</script>` in a field | HTML escaped in display, no script execution | P0 |
| TC-133 | SQL injection prevention | Submit form with SQL injection in fields | No SQL injection, data treated as string | P0 |

---

## 14. API Endpoints

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-134 | GET /api/invoices/analytics — unauthenticated | Call without auth header/cookie | 401 Unauthorized | P0 |
| TC-135 | GET /api/invoices/analytics?type=stats | Call authenticated | Returns `{ success: true, statistics: { totalConversions, ... } }` | P0 |
| TC-136 | GET /api/invoices/analytics?type=charts | Call authenticated | Returns `{ success: true, charts: { dailyConversions, ... } }` | P1 |
| TC-137 | GET /api/credits/history | Call authenticated | Returns `{ items: [...], total: N }` | P0 |
| TC-138 | GET /api/credits/history — pagination | Call with `?page=2&limit=5` | Returns correct page of results | P1 |
| TC-139 | POST /api/payments/verify — valid Stripe | Post with valid Stripe sessionId | Returns `{ success: true, verified: true, credits: N }` | P0 |
| TC-140 | POST /api/payments/verify — duplicate | Verify same payment twice | Second call returns `{ message: "Already processed" }`, no double credits | P0 |
| TC-141 | POST /api/payments/verify — expired transaction | Verify an expired transaction | Returns 410 with "payment has expired" | P1 |
| TC-142 | POST /api/payments/verify — no sessionId/orderId | Post without sessionId or orderId | Returns 400 error | P1 |
| TC-143 | GET /api/invoices/extractions/:id — authorized | Fetch own extraction | Returns extraction data | P0 |
| TC-144 | GET /api/invoices/extractions/:id — unauthorized | Fetch another user's extraction | Returns 403 or ownership check fails | P0 |
| TC-145 | POST /api/invoices/convert — valid data | Post valid invoice data | Returns `{ data: { xmlContent: "..." } }` | P0 |
| TC-146 | GET /api/invoices/history — status filter | Call with `?status=completed` | Returns only completed conversions | P1 |

---

## 15. Performance & Loading States

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| TC-147 | Dashboard — skeleton loading | On slow connection, observe dashboard load | Skeleton/pulse animations shown while data loads | P2 |
| TC-148 | History — loading state | Navigate to history on slow connection | Loading skeletons shown for list items | P2 |
| TC-149 | Credit history — loading state | Navigate to credits page, observe | Skeleton pulse shown while fetching transactions | P3 |
| TC-150 | Upload — progress indication | Upload large file | Progress/spinner clearly visible | P2 |

---

## Test Execution Notes

### Environment Requirements
- Browser: Chrome (latest), Firefox (latest), Safari (latest)
- Mobile: iPhone SE (375px), iPhone 11 Pro (414px), iPad Mini (768px)
- Desktop: 1024px, 1440px, 1920px
- Languages: EN and DE

### Pre-conditions
- Test user account created with known credentials
- At least 10 credits available for conversion tests
- Admin account available for admin panel tests
- Valid Stripe/PayPal test credentials configured
- At least 2 valid test invoices (PDF + JPG)
- A ZIP file with 3-5 invoices for bulk upload testing
