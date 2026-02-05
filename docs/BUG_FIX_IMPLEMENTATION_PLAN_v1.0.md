# Invoice2E Bug Fix Implementation Plan

**Version:** 1.0
**Date:** 2026-02-04
**Author:** Senior Security Engineer / Backend Engineer / QA Lead
**Status:** Implementation-Ready

---

## Executive Fix Strategy

### Goal
Minimize exploitation risk and stabilize billing/credits correctness in the Invoice2E SaaS platform.

### Core Principles

1. **Fail Closed on Auth & Signature Checks** - Reject invalid requests; never process uncertain data
2. **Single Source of Truth for Credits** - Credits are allocated in exactly one place (webhook handler only)
3. **Atomic Updates for Balances** - Use database transactions/RPC functions; no read-modify-write patterns
4. **Validate Inputs; Remove Dangerous Defaults** - Never use hardcoded fake IBANs, emails, or phone numbers
5. **Test + Monitor High-Risk Flows** - Payment, credit allocation, and auth flows must be monitored continuously

### Risk Assessment Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Authentication/Authorization | 5 | 2 | 2 | 2 | 11 |
| Payments/Webhooks | 5 | 4 | 2 | 0 | 11 |
| Credits/Concurrency | 3 | 2 | 1 | 0 | 6 |
| Data Integrity (XRechnung) | 2 | 5 | 1 | 0 | 8 |
| Batch Processing/DoS | 2 | 3 | 2 | 1 | 8 |
| Validation/Input Handling | 0 | 2 | 6 | 4 | 12 |
| **TOTAL** | **15** | **18** | **14** | **7** | **54** |

---

## Prioritized Fix Plan

### Priority P0: Security Critical (Immediate - Week 1)

**Bugs:** BUG-001, BUG-002, BUG-003, BUG-015, BUG-004, BUG-005, BUG-008, BUG-009, BUG-010, BUG-006, BUG-007

**Focus:** Authentication bypass, payment fraud, credit manipulation

**Implementation Order:**
1. Fix authentication in Extract/Review/Convert/Extractions routes (BUG-001, 002, 003, 015)
2. Fix webhook signature verification (BUG-008, 009)
3. Remove unsafe auth fallback (BUG-010)
4. Implement webhook idempotency (BUG-004)
5. Prevent verify+webhook double-credit (BUG-005)
6. Fix race conditions in credits (BUG-006, 007)

**Key Changes:**
- Replace `userId` from request body with `getAuthenticatedUser(req).id` in all sensitive routes
- Implement HMAC-SHA256 for Stripe webhook verification
- Return 401 (not continue processing) for invalid PayPal webhook signatures
- Add `webhook_events` table for idempotency tracking
- Remove credits addition from verify endpoint; only webhooks allocate credits
- Use PostgreSQL RPC atomic increment for credit operations

---

### Priority P1: Financial/Data Integrity (Week 2)

**Bugs:** BUG-011, BUG-012, BUG-013, BUG-016, BUG-017, BUG-018, BUG-019, BUG-023, BUG-024, BUG-025, BUG-026, BUG-027

**Focus:** XRechnung validity, memory safety, credit rollbacks

**Implementation Order:**
1. Remove hardcoded IBAN/email/phone defaults (BUG-011, 023, 024)
2. Fix tax rate hardcoding (BUG-025)
3. Fix date format handling (BUG-026)
4. Add null checks to XML builder (BUG-027)
5. Implement batch memory streaming (BUG-012)
6. Add file size validation in batch (BUG-013)
7. Fix payment verify race condition (BUG-016)
8. Implement credit rollback on conversion failure (BUG-017)
9. Handle credit creation failure in signup (BUG-018)
10. Add login rate limiting (BUG-019)

---

### Priority P2: Stability & Platform Protections (Week 3)

**Bugs:** BUG-020, BUG-021, BUG-022, BUG-028, BUG-029, BUG-030, BUG-031, BUG-032, BUG-033, BUG-034, BUG-035, BUG-036, BUG-037, BUG-038, BUG-039 to BUG-054

**Focus:** Batch status, validation improvements, platform protections

---

## Per-Bug Fix Specifications

---

### BUG-001: Missing Authentication in Extract Invoice Route

**Severity:** CRITICAL
**File:** `app/api/invoices/extract/route.ts`
**Lines:** 14-23

#### Root Cause
The route extracts `userId` from the request body (`formData.get('userId')`) instead of deriving it from an authenticated session. No authentication check is performed.

#### Exploit Scenario
```bash
curl -X POST /api/invoices/extract \
  -F "file=@invoice.pdf" \
  -F "userId=VICTIM_USER_ID"
```
Attacker can extract invoices and consume credits from any user account.

#### Fix Approach

1. Import `getAuthenticatedUser` from `@/lib/auth`
2. At route start, call `const user = await getAuthenticatedUser(request)`
3. If `!user`, return `401 Unauthorized`
4. Use `user.id` as `userId`, ignore any client-provided userId
5. Remove `formData.get('userId')` entirely from the logic

**Code Changes:**
```typescript
// app/api/invoices/extract/route.ts
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
    // AUTHENTICATION CHECK
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = user.id; // SECURE: from authenticated session only

    // Remove: const userId = formData.get('userId') as string;
    // ... rest of logic
}
```

#### Acceptance Criteria
- [ ] Requests without valid session return 401
- [ ] Client-provided userId is ignored
- [ ] All extractions use authenticated user's ID
- [ ] Unit test: spoofed userId is rejected

#### Tests to Add
- `tests/unit/api/extract.auth.test.ts`: Test auth rejection
- Integration test: Authenticated vs unauthenticated requests

#### Risk Notes
Frontend must send auth cookies/headers properly. No breaking change if auth flow is already implemented on frontend.

---

### BUG-002: Missing Authentication in Review Invoice Route

**Severity:** CRITICAL
**File:** `app/api/invoices/review/route.ts`
**Lines:** 7-28

#### Root Cause
`userId` is extracted from request body (`body.userId`) and compared to extraction's userId for "ownership check" - but the body userId is client-controlled.

#### Exploit Scenario
Attacker knows an extraction ID. They submit:
```json
{"extractionId": "victim_extraction_id", "userId": "victim_user_id", "reviewedData": {...}}
```
Since both `extractionId` and `userId` are attacker-controlled, the ownership check passes.

#### Fix Approach

1. Add auth check at route start
2. Use `user.id` from authenticated session
3. Compare `extraction.userId` with `user.id` (from session), not from body

**Code Changes:**
```typescript
// app/api/invoices/review/route.ts
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    const body = await request.json();
    const { extractionId, reviewedData } = body;
    // Remove: const userId = body.userId;

    const extraction = await invoiceDbService.getExtractionById(extractionId);

    // SECURE: Compare with authenticated user
    if (extraction.userId !== user.id) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 403 }
        );
    }
    // ... use user.id for all operations
}
```

#### Acceptance Criteria
- [ ] Ownership check uses authenticated session user ID
- [ ] Spoofed userId in body is ignored
- [ ] Cross-user extraction access returns 403

---

### BUG-003: Missing Authentication in Convert Invoice Route

**Severity:** CRITICAL
**File:** `app/api/invoices/convert/route.ts`
**Lines:** 11-38

#### Root Cause
Same pattern as BUG-001 and BUG-002. `userId` from request body allows credit deduction from any user.

#### Fix Approach
Same as BUG-001: Add auth check, use `user.id` from session.

**Code Changes:**
```typescript
// app/api/invoices/convert/route.ts
const user = await getAuthenticatedUser(request);
if (!user) {
    return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
    );
}

const body = await request.json();
const { conversionId, invoiceData, format = 'CII' } = body;
const userId = user.id; // From authenticated session
```

#### Acceptance Criteria
- [ ] Credit deduction only for authenticated user
- [ ] Cannot convert invoices for other users

---

### BUG-004: Double Charging - Webhook Idempotency Missing

**Severity:** CRITICAL
**File:** `services/payment-processor.ts`
**Lines:** 147-159, 225-235

#### Root Cause
Webhook handlers (`handleStripeWebhook`, `handlePaypalWebhook`) do not check if the event has already been processed. Duplicate webhook events (common with payment providers) result in duplicate credit allocation.

#### Exploit Scenario
1. Payment completes, webhook fires
2. Network issue causes payment provider to retry webhook
3. Credits added twice (or more)

#### Fix Approach

1. Create `webhook_events` table for idempotency tracking
2. Before processing, check if `event_id` exists in table
3. If exists, return success without processing
4. After processing, insert `event_id` with timestamp
5. Add unique constraint on `event_id`

**Database Migration:**
```sql
-- db/migrations/007_webhook_idempotency.sql
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES users(id),
    credits_added INTEGER DEFAULT 0,
    CONSTRAINT unique_webhook_event UNIQUE (event_id, provider)
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at);
```

**Code Changes:**
```typescript
// services/payment-processor.ts
async handleStripeWebhook(event: StripeEvent): Promise<WebhookResult> {
    const eventId = event.id;

    // IDEMPOTENCY CHECK
    const supabase = createServerClient();
    const { data: existing } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .eq('provider', 'stripe')
        .single();

    if (existing) {
        logger.info('Webhook already processed', { eventId });
        return { success: true, message: 'Already processed' };
    }

    // Process webhook...

    // Record processed event
    await supabase.from('webhook_events').insert({
        event_id: eventId,
        provider: 'stripe',
        event_type: event.type,
        user_id: userId,
        credits_added: credits,
    });

    return { success: true, userId, credits };
}
```

#### Acceptance Criteria
- [ ] Duplicate webhook events return success without credit addition
- [ ] webhook_events table has unique constraint on event_id+provider
- [ ] Concurrent duplicate webhooks handled correctly (race-safe)

---

### BUG-005: Double Charging - Verify & Webhook Race

**Severity:** CRITICAL
**File:** `app/api/payments/verify/route.ts` vs webhook handler

#### Root Cause
Both the verify endpoint (lines 130-188) and webhook handler add credits independently. User can refresh verify page after webhook already processed.

#### Exploit Scenario
1. User completes Stripe payment
2. Stripe webhook fires, adds credits via `handleStripeWebhook`
3. User calls verify endpoint, which also checks Stripe and adds credits
4. Credits doubled

#### Fix Approach

**Option A (Recommended): Single Source of Truth**
- Remove credit addition from verify endpoint entirely
- Verify endpoint only confirms payment status, doesn't allocate credits
- All credit allocation happens via webhooks only

**Option B: Conditional Check**
- In verify endpoint, check if payment already recorded as completed
- Only add credits if transaction status is still 'pending'

**Code Changes (Option A):**
```typescript
// app/api/payments/verify/route.ts
// Remove lines 170-188 that add credits
// Change to:
if (paymentStatus === 'paid') {
    // Update transaction status (if still pending)
    await supabase
        .from('payment_transactions')
        .update({ stripe_session_id: paymentId })
        .eq('user_id', user.id)
        .eq('payment_status', 'pending');

    return NextResponse.json({
        success: true,
        verified: true,
        message: 'Payment verified. Credits will be added shortly via webhook.',
    });
}
```

#### Acceptance Criteria
- [ ] Credits allocated exactly once per payment
- [ ] Verify endpoint cannot add credits if webhook already did
- [ ] No lost credits if webhook fails (retry mechanism)

---

### BUG-006: Race Condition in Credit Addition (credits.db.service)

**Severity:** CRITICAL
**File:** `services/credits.db.service.ts`
**Lines:** 62-79

#### Root Cause
```typescript
const current = await this.getUserCredits(userId);  // Line 64 - READ
const { data, error } = await supabase
    .from('user_credits')
    .update({ available_credits: current.availableCredits + amount })  // Line 68 - WRITE
```
Classic read-modify-write race condition. Between READ and WRITE, another transaction can modify credits.

#### Exploit Scenario
Two concurrent webhook events for same user:
- T1: Reads credits = 100
- T2: Reads credits = 100
- T1: Writes 100 + 50 = 150
- T2: Writes 100 + 50 = 150
- Result: 150 (should be 200)

#### Fix Approach

Use atomic increment via PostgreSQL RPC or raw SQL update.

**Create RPC Function:**
```sql
-- db/migrations/008_atomic_credit_operations.sql
CREATE OR REPLACE FUNCTION add_credits(
    p_user_id UUID,
    p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    UPDATE user_credits
    SET available_credits = available_credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING available_credits INTO new_balance;

    IF NOT FOUND THEN
        INSERT INTO user_credits (user_id, available_credits, used_credits)
        VALUES (p_user_id, p_amount, 0)
        RETURNING available_credits INTO new_balance;
    END IF;

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
```

**Code Changes:**
```typescript
// services/credits.db.service.ts
async addCredits(userId: string, amount: number): Promise<UserCredits> {
    if (amount <= 0) {
        throw new ValidationError('Amount must be positive');
    }

    const supabase = this.getSupabase();

    // ATOMIC INCREMENT via RPC
    const { data, error } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: amount,
    });

    if (error) {
        logger.error('Failed to add credits', { userId, amount, error: error.message });
        throw new AppError('DB_ERROR', 'Failed to add credits', 500);
    }

    // Refetch for full object
    return this.getUserCredits(userId);
}
```

#### Acceptance Criteria
- [ ] Concurrent credit additions produce correct sum
- [ ] No lost updates under load
- [ ] Negative amounts rejected

---

### BUG-007: Broken RPC Call in Credit Service

**Severity:** CRITICAL
**File:** `services/database/credit.service.ts`
**Lines:** 66-69

#### Root Cause
```typescript
.update({
    available_credits: supabase.rpc('increment', { x: amount }),
})
```
`supabase.rpc()` returns a Promise, which cannot be passed as an update value. This is a syntax/logic error.

#### Fix Approach
Remove this file entirely and use only `credits.db.service.ts` with the fixed atomic RPC call (BUG-006 fix), or fix to call RPC properly.

**Code Changes:**
```typescript
// services/database/credit.service.ts
async addCredits(userId: string, amount: number): Promise<UserCredits> {
    const supabase = this.getSupabase();

    // CORRECT: Call RPC directly, not nested in update
    const { data, error } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: amount,
    });

    if (error) throw new AppError('DB_ERROR', 'Failed to add credits', 500);

    return this.getUserCredits(userId);
}
```

**Better Fix:** Delete duplicate service, use only `credits.db.service.ts`.

---

### BUG-008: Stripe Webhook Signature Not Verified

**Severity:** CRITICAL
**File:** `adapters/stripe.adapter.ts`
**Lines:** 81-109

#### Root Cause
The comment at line 101 admits: "we can't cryptographically verify without implementing HMAC-SHA256". Only timestamp is checked, not the actual signature hash.

#### Exploit Scenario
Attacker sends forged webhook with valid timestamp:
```bash
curl -X POST /api/payments/webhook?provider=stripe \
  -H "stripe-signature: t=NOW,v1=fake" \
  -d '{"type":"checkout.session.completed","data":{"object":{"metadata":{"user_id":"attacker","credits":"1000"}}}}'
```

#### Fix Approach

Implement proper HMAC-SHA256 verification using Node.js crypto.

**Code Changes:**
```typescript
// adapters/stripe.adapter.ts
import crypto from 'crypto';

async constructWebhookEvent(payload: string, signature: string): Promise<StripeEvent> {
    if (!this.webhookSecret) {
        throw new Error('Stripe webhook secret not configured');
    }

    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1Signature = parts.find(p => p.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !v1Signature) {
        throw new Error('Invalid signature format');
    }

    // Check timestamp age (5 minutes tolerance)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
        throw new Error('Webhook timestamp too old');
    }

    // CRITICAL: Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(signedPayload)
        .digest('hex');

    // CRITICAL: Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
        Buffer.from(v1Signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    )) {
        throw new Error('Invalid webhook signature');
    }

    return JSON.parse(payload) as StripeEvent;
}
```

#### Acceptance Criteria
- [ ] Invalid signatures throw error
- [ ] Forged webhooks rejected with 400
- [ ] Valid Stripe webhooks pass verification
- [ ] Timing-safe comparison used

---

### BUG-009: PayPal Webhook Signature Bypassed

**Severity:** CRITICAL
**File:** `app/api/payments/webhook/route.ts`
**Lines:** 64-70

#### Root Cause
```typescript
if (!isValid) {
    logger.warn('Invalid PayPal webhook signature');
    // Note: In sandbox, signature verification may fail
    // Continue processing but log warning  <-- PROBLEM
}
```
Invalid signature only logs warning, doesn't reject request.

#### Fix Approach

Return 401 Unauthorized when signature is invalid. Remove sandbox bypass.

**Code Changes:**
```typescript
// app/api/payments/webhook/route.ts
if (provider === 'paypal') {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
        headers[key] = value;
    });

    const isValid = await paypalService.verifyWebhookSignature(headers, body);

    // CRITICAL: Fail closed - reject invalid signatures
    if (!isValid) {
        logger.warn('Invalid PayPal webhook signature rejected', {
            headers: Object.keys(headers)
        });
        return NextResponse.json(
            { error: 'Invalid webhook signature' },
            { status: 401 }
        );
    }

    // Only process if signature is valid
    const event = JSON.parse(body);
    // ...
}
```

#### Acceptance Criteria
- [ ] Invalid PayPal signatures return 401
- [ ] No credits allocated for unsigned webhooks
- [ ] Sandbox mode requires explicit environment flag (not automatic bypass)

---

### BUG-010: Unsafe Authentication Fallback

**Severity:** CRITICAL
**File:** `lib/auth.ts`
**Lines:** 28-48

#### Root Cause
When Supabase auth fails, the code falls back to a `session_user_id` cookie and creates a minimal user object without verification:
```typescript
return {
    id: sessionUserId,  // Directly from unverified cookie
    email: '',
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    // ...
};
```

#### Exploit Scenario
Attacker sets cookie `session_user_id=VICTIM_UUID` and gains authenticated access as victim.

#### Fix Approach

**Option A (Safest): Remove fallback entirely**
```typescript
export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
    try {
        const authClient = createUserClient();
        const { data: { user }, error } = await authClient.auth.getUser();

        if (user && !error) {
            return user as AuthenticatedUser;
        }

        // NO FALLBACK - return null if Supabase auth fails
        logger.warn('Authentication failed', { error: error?.message });
        return null;
    } catch (error) {
        logger.error('Error in getAuthenticatedUser', { error });
        return null;
    }
}
```

**Option B: Secure fallback with signed token**
If fallback is required, use a cryptographically signed JWT stored in the cookie, not raw user ID.

#### Acceptance Criteria
- [ ] Cookie-only authentication is rejected
- [ ] All auth requires valid Supabase session
- [ ] Forged cookies don't grant access

---

### BUG-011: Hardcoded Example IBAN in XRechnung

**Severity:** CRITICAL
**File:** `services/xrechnung/builder.ts`
**Lines:** 208-209

#### Root Cause
```typescript
const iban = data.sellerIban || data.iban || 'DE89370400440532013000';
```
This is a well-known example IBAN from German bank tutorials.

#### Fix Approach

Remove hardcoded default. Require IBAN or emit validation error/warning.

**Code Changes:**
```typescript
// services/xrechnung/builder.ts
private buildPaymentMeans(data: any): string {
    const iban = data.sellerIban || data.iban;

    if (!iban) {
        logger.warn('Missing IBAN for invoice', { invoiceNumber: data.invoiceNumber });
        // Option 1: Omit payment means entirely (valid for some invoice types)
        // Option 2: Throw validation error
        throw new ValidationError('Seller IBAN is required for XRechnung invoices');
    }

    // ... rest of method
}
```

#### Acceptance Criteria
- [ ] No hardcoded IBAN in generated invoices
- [ ] Missing IBAN causes validation error or warning
- [ ] Tests verify no example IBAN in output

---

### BUG-012: Memory Leak in Batch Processing

**Severity:** CRITICAL
**File:** `services/batch/batch.service.ts`
**Lines:** 16-23

#### Root Cause
All PDF files are extracted into memory (`pdfFiles` array) and held until processing completes. For 100 files at 25MB each, this is 2.5GB.

#### Fix Approach

1. Stream files to temporary cloud storage (S3/GCS) during ZIP extraction
2. Process files one at a time, fetching from storage
3. Clean up after each file is processed

**Code Changes:**
```typescript
// services/batch/batch.service.ts
async createBatchJob(userId: string, zipBuffer: Buffer): Promise<BatchJob> {
    const zip = await JSZip.loadAsync(zipBuffer);
    const fileMetadata: { name: string; size: number }[] = [];

    // Only extract metadata, not content
    for (const [filename, file] of Object.entries(zip.files)) {
        if (!file.dir && filename.toLowerCase().endsWith('.pdf')) {
            // Validate individual file size
            const content = await file.async('nodebuffer');

            if (content.length > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
                throw new ValidationError(`File ${filename} exceeds 25MB limit`);
            }

            // Store to cloud storage immediately
            await this.storeFileToCloud(jobId, filename, content);

            fileMetadata.push({ name: filename, size: content.length });

            // Release memory immediately
            // (content goes out of scope)
        }
    }

    // ... create job record with metadata only
}
```

#### Acceptance Criteria
- [ ] Memory usage stays below threshold during batch processing
- [ ] Files are streamed, not held in memory
- [ ] Cleanup occurs after each file

---

### BUG-013: No File Size Limits in Batch

**Severity:** CRITICAL
**File:** `services/batch/batch.service.ts`
**Lines:** 20-24

#### Root Cause
Only ZIP total size is checked. Individual files within ZIP are not validated.

#### Fix Approach

Add size check during file extraction (included in BUG-012 fix).

```typescript
if (content.length > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File ${filename} exceeds ${FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit`);
}
```

---

### BUG-014: Inadequate String Sanitization

**Severity:** CRITICAL
**File:** `lib/database-helpers.ts`
**Lines:** 72-74

#### Root Cause
```typescript
return str.trim().replace(/[<>]/g, '');
```
Only removes `<` and `>`. SQL injection characters pass through.

#### Fix Approach

Supabase uses parameterized queries, so SQL injection is mitigated at the database layer. However, for XSS prevention:

```typescript
export const sanitizeString = (str: string): string => {
    if (!str) return '';
    return str
        .trim()
        .replace(/[<>]/g, '')        // HTML tags
        .replace(/['"]/g, '')         // Quotes
        .replace(/javascript:/gi, '') // JS URIs
        .replace(/on\w+=/gi, '');     // Event handlers
};
```

**Note:** For comprehensive XSS protection, use a library like DOMPurify on the frontend.

---

### BUG-015: No Authentication on Extraction by ID

**Severity:** HIGH
**File:** `app/api/invoices/extractions/[id]/route.ts`
**Lines:** 10-26

#### Root Cause
No authentication or authorization check. Any request with an extraction ID returns the data.

#### Fix Approach

```typescript
// app/api/invoices/extractions/[id]/route.ts
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(
    request: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    // AUTHENTICATION
    const user = await getAuthenticatedUser(request as NextRequest);
    if (!user) {
        return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    const { id } = await params;
    const extraction = await invoiceDbService.getExtractionById(id);

    // AUTHORIZATION: Ownership check
    if (extraction.userId !== user.id) {
        return NextResponse.json(
            { success: false, error: 'Access denied' },
            { status: 403 }
        );
    }

    return NextResponse.json({ success: true, data: extraction });
}
```

---

### BUG-016: Race Condition in Payment Verify Credits

**Severity:** HIGH
**File:** `app/api/payments/verify/route.ts`
**Lines:** 170-188

#### Root Cause
Same read-modify-write pattern as BUG-006.

#### Fix Approach
With BUG-005 fix (remove credit addition from verify), this becomes moot. If kept, use same RPC atomic increment.

---

### BUG-017: Missing Credit Rollback on Conversion Failure

**Severity:** HIGH
**File:** `app/api/invoices/convert/route.ts`
**Lines:** 219-278

#### Root Cause
Credits are deducted via transaction, but if XML generation fails afterward, no rollback.

#### Fix Approach

Move credit deduction AFTER successful XML generation.

```typescript
// Generate XML first
const result = xrechnungService.generateXRechnung(serviceData);

if (!result || !result.xmlContent) {
    // No credits deducted yet, just return error
    return NextResponse.json({ success: false, error: 'Failed to generate XML' }, { status: 500 });
}

// Only deduct credits after successful generation
const txResult = await invoiceDbService.processConversionTransaction(userId, actualConversionId);
```

---

### BUG-018: Signup Doesn't Handle Credit Creation Failure

**Severity:** HIGH
**File:** `services/auth.service.ts`
**Lines:** 83-94

#### Fix Approach

Either make credit creation transactional with signup, or rollback user creation on credit failure.

```typescript
// Option: Rollback user if credits fail
if (creditsError) {
    logger.error('Failed to create user credits, rolling back user', { userId: user.id });
    await supabase.from('users').delete().eq('id', user.id);
    throw new AppError('SIGNUP_ERROR', 'Failed to create account', 500);
}
```

---

### BUG-019: Missing Login Rate Limiting

**Severity:** HIGH
**File:** `services/auth.service.ts`
**Lines:** 106-130

#### Fix Approach

Implement rate limiting middleware or service-level throttling.

```typescript
// lib/rate-limiter.ts
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(email: string): boolean {
    const now = Date.now();
    const record = loginAttempts.get(email);

    if (!record || now - record.firstAttempt > WINDOW_MS) {
        loginAttempts.set(email, { count: 1, firstAttempt: now });
        return true;
    }

    if (record.count >= MAX_ATTEMPTS) {
        return false; // Rate limited
    }

    record.count++;
    return true;
}
```

---

### BUG-020 through BUG-033: HIGH Severity Fixes

*(Abbreviated for length - same pattern: identify root cause, provide code fix)*

| Bug | Issue | Fix Summary |
|-----|-------|-------------|
| BUG-020 | Batch job status never updated to failed | Add try-catch around processBatch with status='failed' on error |
| BUG-021 | Partial batch failure marked as success | Change condition: mark 'completed' only if all succeed, 'partial' if some fail |
| BUG-022 | No progress updates in batch | Update database after each file processed |
| BUG-023 | Hardcoded fake email | Remove `'buyer@example.de'` default, require email or omit field |
| BUG-024 | Hardcoded fake phone | Remove `'+49 000 0000000'` default |
| BUG-025 | Fixed 19% tax rate | Use `item.taxRate` or calculate from data |
| BUG-026 | Date format assumption | Add date format detection/parsing |
| BUG-027 | Null values in XML | Add null checks: `if (data.sellerName) { ... }` |
| BUG-028 | Fragile markdown removal | Use regex that handles variations |
| BUG-029 | @ts-ignore bypass | Add proper type definitions |
| BUG-030 | No price/quantity validation | `if (unitPrice < 0 || quantity <= 0) throw ValidationError` |
| BUG-031 | Bulk download no auth | Add signed download tokens |
| BUG-032 | Stripe metadata key mismatch | Use `userId` consistently (or `user_id`) |
| BUG-033 | Duplicate user services | Delete one, use single service |

---

### BUG-034 through BUG-054: MEDIUM/LOW Severity Fixes

| Bug | Severity | Fix Summary |
|-----|----------|-------------|
| BUG-034 | MEDIUM | Add CSRF tokens to forms |
| BUG-035 | MEDIUM | Add rate limiting to upload endpoint |
| BUG-036 | MEDIUM | Clear timeout after API response |
| BUG-037 | MEDIUM | Log warning when line items missing |
| BUG-038 | MEDIUM | Add recursion depth limit to convertKeys |
| BUG-039 | MEDIUM | Validate item structure in validator |
| BUG-040 | MEDIUM | Return 404 for not found, 409 for already completed |
| BUG-041 | MEDIUM | Verify session cookie cryptographically |
| BUG-042 | MEDIUM | Include field name in error logs |
| BUG-043 | MEDIUM | Sanitize template fields for XSS |
| BUG-044 | MEDIUM | Add max page limit (e.g., 1000) |
| BUG-045 | MEDIUM | Handle PayPal custom_id parse failure gracefully |
| BUG-046 | MEDIUM | Validate file sizes within ZIP |
| BUG-047 | MEDIUM | Validate DeepSeek response structure |
| BUG-048 | LOW | Add magic number validation |
| BUG-049 | LOW | Normalize UUID to lowercase |
| BUG-050 | LOW | Remove console.error, use logger only |
| BUG-051 | LOW | Generic validation error message |
| BUG-052 | LOW | Remove "check server logs" from user messages |
| BUG-053 | LOW | Consistent file size formatting |
| BUG-054 | LOW | Use actual filename in batch errors |

---

## Security Controls Checklist

### Authentication & Authorization
- [ ] All routes derive user identity from authenticated session only
- [ ] Ownership checks for resource-by-id routes
- [ ] No client-provided userId trusted
- [ ] Session cookies httpOnly + secure + sameSite

### Webhooks
- [ ] Verify full HMAC signature (not just timestamp)
- [ ] Fail closed - reject invalid signatures with 401
- [ ] Idempotency per event ID (webhook_events table)
- [ ] Replay protection with timestamp tolerance

### Credits
- [ ] Atomic increments/decrements via PostgreSQL RPC
- [ ] No duplicate credit allocation across verify/webhook
- [ ] Audit log for all credit changes
- [ ] Validate amounts are positive

### Input Validation
- [ ] Reject dangerous defaults (IBAN/email/phone)
- [ ] Validate monetary fields (>=0, quantity>0)
- [ ] XSS/HTML sanitization for stored templates
- [ ] File type and size validation

### Platform Protections
- [ ] Rate limiting on login (5 attempts/15 min)
- [ ] Rate limiting on file upload
- [ ] CSRF protection on state-changing routes
- [ ] Pagination bounds (max page 1000)

---

## Test Plan

### Authentication Tests
```typescript
// tests/unit/api/auth.test.ts
describe('Authentication', () => {
    it('rejects extract requests without session', async () => {
        const res = await POST('/api/invoices/extract', { file, userId: 'any' });
        expect(res.status).toBe(401);
    });

    it('ignores spoofed userId', async () => {
        const res = await authenticatedPOST('/api/invoices/extract', {
            file,
            userId: 'other-user-id'
        });
        // Should use session user, not body user
        expect(extraction.userId).toBe(sessionUser.id);
    });

    it('returns 403 for extraction not owned by user', async () => {
        const res = await authenticatedGET(`/api/invoices/extractions/${otherUserExtraction.id}`);
        expect(res.status).toBe(403);
    });
});
```

### Payment Tests
```typescript
describe('Webhook Security', () => {
    it('rejects invalid Stripe signature', async () => {
        const res = await POST('/api/payments/webhook?provider=stripe', {
            body: fakeEvent,
            headers: { 'stripe-signature': 'invalid' }
        });
        expect(res.status).toBe(400);
    });

    it('rejects invalid PayPal signature', async () => {
        const res = await POST('/api/payments/webhook?provider=paypal', {
            body: fakeEvent,
            headers: { /* invalid headers */ }
        });
        expect(res.status).toBe(401);
    });

    it('does not double-credit on duplicate webhook', async () => {
        await processWebhook(event);
        await processWebhook(event); // Same event ID

        const credits = await getCredits(userId);
        expect(credits).toBe(initialCredits + packageCredits); // Not doubled
    });
});
```

### Concurrency Tests
```typescript
describe('Credit Operations', () => {
    it('handles concurrent credit additions correctly', async () => {
        const initialCredits = 100;
        const addAmount = 50;
        const numConcurrent = 10;

        await Promise.all(
            Array(numConcurrent).fill(null).map(() =>
                creditsDbService.addCredits(userId, addAmount)
            )
        );

        const finalCredits = await creditsDbService.getUserCredits(userId);
        expect(finalCredits.availableCredits).toBe(initialCredits + (addAmount * numConcurrent));
    });
});
```

### XRechnung Tests
```typescript
describe('XRechnung Generation', () => {
    it('rejects invoice without IBAN', async () => {
        const data = { ...validInvoice, sellerIban: undefined };
        expect(() => xrechnungService.generateXRechnung(data)).toThrow('Seller IBAN is required');
    });

    it('does not contain example IBAN', async () => {
        const result = xrechnungService.generateXRechnung(validInvoice);
        expect(result.xmlContent).not.toContain('DE89370400440532013000');
    });

    it('uses provided tax rate, not default', async () => {
        const data = { ...validInvoice, lineItems: [{ ...item, taxRate: 7 }] };
        const result = xrechnungService.generateXRechnung(data);
        expect(result.xmlContent).toContain('7.00'); // Not 19.00
    });
});
```

---

## Rollout and Monitoring

### Rollout Steps

1. **Phase 1: Database Migrations** (Day 1)
   - Deploy migrations 007, 008 (webhook_events, atomic credit functions)
   - Verify migrations successful in staging

2. **Phase 2: P0 Fixes Behind Feature Flag** (Day 2-3)
   - Deploy auth fixes with feature flag `ENABLE_STRICT_AUTH=true`
   - Deploy webhook fixes with feature flag `ENABLE_WEBHOOK_VERIFICATION=true`
   - Test in staging with flags enabled

3. **Phase 3: Canary Rollout** (Day 4)
   - Enable flags for 10% of traffic
   - Monitor error rates, webhook processing

4. **Phase 4: Full Rollout** (Day 5)
   - Enable flags for 100% of traffic
   - Continue monitoring for 48 hours

### Monitoring Signals

| Signal | Threshold | Alert |
|--------|-----------|-------|
| Webhook verification failures | > 5% | PagerDuty |
| Duplicate webhook detections | > 10/hour | Slack |
| Credit balance anomalies (sudden spike > 1000) | Any | PagerDuty |
| Auth 401/403 rate | > 20% | Slack |
| Batch job memory usage | > 2GB | Slack |
| Conversion error rate | > 10% | Slack |

### Rollback Plan

1. **Immediate:** Disable feature flags
2. **If fraud detected:** Stop webhook processing (return 503)
3. **Database issues:** Restore from backup, revert migrations
4. **Code issues:** Revert to previous deployment

---

## Change Tracking

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-04 | Initial fix plan created from 54 bug analysis |

---

## Missing Information / Questions

1. **Authentication Provider:** Confirmed Supabase Auth with bcrypt. Is there SSO/OAuth integration planned?

2. **Database:** Confirmed Supabase PostgreSQL. Is there read replica for analytics queries?

3. **Payment Providers:** Stripe and PayPal confirmed. Are both active in production? What are the webhook secrets?

4. **Idempotency Store:** Does `webhook_events` table exist, or needs migration?

5. **Schema Changes:** Any constraints on adding tables (webhook_events) or RPC functions?

6. **Feature Flags:** Is there a feature flag system in place? If not, use environment variables.

7. **Monitoring:** What observability tools are in use? (DataDog, New Relic, custom?)

8. **Rate Limiting:** Is there existing rate limiting infrastructure? (Redis, Upstash?)

---

## Appendix: Migration Scripts

### 007_webhook_idempotency.sql
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES users(id),
    credits_added INTEGER DEFAULT 0,
    CONSTRAINT unique_webhook_event UNIQUE (event_id, provider)
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
```

### 008_atomic_credit_operations.sql
```sql
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE new_balance INTEGER;
BEGIN
    UPDATE user_credits
    SET available_credits = available_credits + p_amount
    WHERE user_id = p_user_id
    RETURNING available_credits INTO new_balance;

    IF NOT FOUND THEN
        INSERT INTO user_credits (user_id, available_credits, used_credits)
        VALUES (p_user_id, p_amount, 0)
        RETURNING available_credits INTO new_balance;
    END IF;

    RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
```

---

**END OF IMPLEMENTATION PLAN**
