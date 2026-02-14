# BUG-2 P0 Protocol Completion Progress

**Started**: 2026-02-13
**Status**: IN PROGRESS (40% Complete)
**Critical Path**: P0-1 ✅ | P0-2 🚧 | P0-3-7 📋

---

## ✅ P0-1: COMPLETED - Admin Fallback Removed

### Changes Made

**File**: [`services/invoice.db.service.ts`](../services/invoice.db.service.ts)

#### 1. Fail-Fast Helper Added
```typescript
private assertClientProvided(client: SupabaseClient | undefined, methodName: string): asserts client is SupabaseClient {
    if (!client) {
        throw new AppError(
            'MISSING_CLIENT',
            `${methodName} requires a Supabase client for RLS enforcement...`,
            500
        );
    }
}
```

#### 2. All User-Facing Methods Updated (11 methods)
- ✅ `createExtraction()` - asserts client, uses `client!`
- ✅ `getExtractionById()` - asserts client, uses `client!`
- ✅ `getUserExtractions()` - asserts client, uses `client!`
- ✅ `updateExtraction()` - asserts client, uses `client!`
- ✅ `deleteExtraction()` - asserts client, uses `client!`
- ✅ `createConversion()` - asserts client, uses `client!`
- ✅ `updateConversion()` - asserts client, uses `client!`
- ✅ `getConversionById()` - asserts client, uses `client!`
- ✅ `getUserConversions()` - asserts client, uses `client!`
- ✅ `getConversionByExtractionId()` - asserts client, uses `client!`
- ✅ `processConversionTransaction()` - asserts client, uses `client!`

#### 3. Admin Methods Added (2 methods)
- ✅ `getExtractionByIdAdmin()` - explicit admin access
- ✅ `updateExtractionAdmin()` - explicit admin access

### Impact
- **FOOTGUN ELIMINATED**: If a route forgets to pass `client`, it throws `MISSING_CLIENT` error instead of silently bypassing RLS
- **NO SILENT FALLBACK**: Cannot accidentally use admin client for user data
- **EXPLICIT ADMIN ACCESS**: Admin operations use dedicated `*Admin()` methods

### Verification
- ✅ TypeScript compiles (`npx tsc --noEmit`)
- ✅ All methods throw if client not provided
- ✅ Admin methods clearly separated

---

## 🚧 P0-2: IN PROGRESS - User Routes Migration

### Routes Completed (5/~20)

#### ✅ Core Workflow Routes
1. **`/api/invoices/review`** (F3) - Review and save extracted data
   - Creates user-scoped client
   - 5 database calls updated
   - Defense-in-depth: ownership check + RLS

2. **`/api/invoices/convert`** (F3) - Generate XRechnung/UBL XML
   - Creates user-scoped client
   - 3 database calls updated
   - Defense-in-depth: ownership check + RLS

3. **`/api/invoices/extract`** (P0-2) - Single/multi-invoice extraction
   - Creates user-scoped client
   - 2 database calls updated (line 220, 339)
   - Handles multi-invoice PDFs

4. **`/api/invoices/extractions/[id]`** (P0-2) - Get extraction by ID
   - Creates user-scoped client
   - 1 database call updated
   - Defense-in-depth: ownership check + RLS

### Routes Remaining (~15 routes)

#### High Priority (User PII/Financial Data)
- [ ] `/api/invoices/history` - **BLOCKED**: Needs analytics.service refactor (P0-3)
- [ ] `/api/invoices/templates/route.ts` - Template CRUD
- [ ] `/api/invoices/templates/[id]/route.ts` - Template by ID
- [ ] `/api/invoices/bulk-upload/route.ts` - Batch upload
- [ ] `/api/invoices/bulk-upload/download/route.ts` - Batch download
- [ ] `/api/invoices/batch-download/route.ts` - Download multiple
- [ ] `/api/invoices/review/bulk/route.ts` - Bulk review
- [ ] `/api/invoices/analytics/route.ts` - User analytics

#### Medium Priority (Credits/Payments)
- [ ] `/api/credits/usage/route.ts` - Credit usage
- [ ] `/api/credits/history/route.ts` - Credit transaction history
- [ ] `/api/payments/history/route.ts` - Payment history
- [ ] `/api/payments/verify/route.ts` - Payment verification

#### Lower Priority (Profile)
- [ ] `/api/users/profile/route.ts` - User profile
- [ ] `/api/vouchers/redeem/route.ts` - Voucher redemption

#### Special Cases (Verify Admin-Only)
- [ ] `/api/admin/**/*` - All admin routes (should use admin client by design)
- [ ] `/api/internal/batch-worker/route.ts` - Background job (admin client OK)
- [ ] `/api/payments/webhook/route.ts` - External webhook (admin client OK)

### Pattern to Apply

```typescript
// 1. Import
import { createUserScopedClient } from '@/lib/supabase.server';

// 2. After authentication
const user = await getAuthenticatedUser(request);
const userClient = await createUserScopedClient(user.id);

// 3. Pass to all DB calls
await invoiceDbService.someMethod(...args, userClient);
```

---

## 📋 P0-3: BLOCKED - Analytics Service Refactor

### Problem
`services/analytics.service.ts` directly calls `createServerClient()` (line 8, 106+).

Used by `/api/invoices/history` route which is HIGH PRIORITY.

### Required Changes
1. **Option A** (User-Scoped):
   - Refactor service to accept optional `SupabaseClient` parameter
   - Add `assertClientProvided()` for user-facing methods
   - Add admin variants if needed

2. **Option B** (Admin-Only):
   - Move analytics to admin namespace
   - Explicitly document as admin-only
   - Only expose via admin routes

### Recommendation
**Option A** - Analytics is user-specific data, should use user-scoped client.

---

## 📋 P0-4: TODO - Defense-in-Depth Audit

### Current State
- ✅ `/api/invoices/review` - has ownership check (line 55)
- ✅ `/api/invoices/convert` - has ownership check (line 235)
- ✅ `/api/invoices/extractions/[id]` - has ownership check (line 26)
- ⚠️ Other routes - need audit

### Pattern to Apply
```typescript
// After RLS-enforced query
const extraction = await invoiceDbService.getExtractionById(id, userClient);

// Defense-in-depth: explicit ownership check
if (extraction.userId !== user.id) {
  logger.warn('Ownership check failed', { id, userId: user.id });
  return NextResponse.json({ error: 'Access denied' }, { status: 403 });
}
```

---

## 📋 P0-5: TODO - Security Isolation Tests

### Required Tests (0/3 minimum)

#### 1. Cross-User Read Test
```typescript
it('should block cross-user extraction read', async () => {
  // User A creates extraction
  const userAClient = await createUserScopedClient(userA.id);
  const extraction = await invoiceDbService.createExtraction(data, userAClient);

  // User B attempts to read
  const userBClient = await createUserScopedClient(userB.id);
  await expect(
    invoiceDbService.getExtractionById(extraction.id, userBClient)
  ).rejects.toThrow('Extraction not found'); // RLS blocks access
});
```

#### 2. Cross-User Write Test
```typescript
it('should block cross-user credit update', async () => {
  // User B attempts to update User A credits
  const userBClient = await createUserScopedClient(userB.id);
  const result = await creditsDbService.updateCredits(userA.id, 1000, userBClient);

  expect(result.rowsAffected).toBe(0); // RLS blocks update
});
```

#### 3. Admin Override Test
```typescript
it('should allow admin to access all data', async () => {
  const adminClient = createAdminClient();
  const extraction = await invoiceDbService.getExtractionByIdAdmin(anyExtractionId);

  expect(extraction).toBeDefined(); // Admin bypasses RLS
});
```

### Test File Location
`tests/security/rls-isolation.test.ts` (NEW)

---

## 📋 P0-6: TODO - Service-Role Static Guard

### Objective
Prevent regressions by failing CI if service-role key is used in user routes.

### Implementation
```typescript
// tests/security/service-role-guard.test.ts
describe('Service-Role Key Guard', () => {
  it('should not import service-role in user routes', () => {
    const userRouteFiles = glob.sync('app/api/!(admin|internal)/**/*.ts');

    for (const file of userRouteFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('createAdminClient()');
      expect(content).not.toContain('createServerClient()'); // Deprecated
    }
  });
});
```

### Allowed Patterns
- `app/api/admin/**/*` - Admin routes (admin client OK)
- `app/api/internal/**/*` - Background jobs (admin client OK)
- `services/**/*Admin()` - Explicit admin methods

---

## 📋 P0-7: TODO - Documentation

### Required Documents (0/4)

#### 1. ADR: RLS Restoration
**File**: `docs/adr/005-rls-restoration.md`

**Sections**:
- Context: Service-role bypass vulnerability (BUG-2)
- Decision: User-scoped JWT approach with fail-fast pattern
- Consequences: Performance (JWT signing), security (RLS enforced), complexity
- Alternatives: Custom RLS, middleware, Supabase Auth

#### 2. Migration Checklist
**File**: `docs/BUG-2-MIGRATION-CHECKLIST.md`

**Sections**:
- How to update routes (code examples)
- How to refactor services (dependency injection pattern)
- Common pitfalls (forgetting client parameter)
- Testing requirements (isolation tests)

#### 3. Security Checklist
**File**: `docs/SECURITY-CHECKLIST.md`

**Sections**:
- When to use admin vs user-scoped client
- How to verify RLS policies
- Testing for isolation breaches
- Incident response (if bypass detected)

#### 4. CHANGELOG Entry
**File**: `CHANGELOG.md`

```markdown
## [Unreleased]

### SECURITY
- **CRITICAL**: Restored RLS-based data isolation (BUG-2, CVSS 9.1)
  - All user-facing routes now use user-scoped JWT client
  - Service-role key restricted to admin routes only
  - Fail-fast pattern prevents accidental RLS bypass

### BREAKING CHANGES
- `SUPABASE_JWT_SECRET` environment variable now REQUIRED
- Database service methods require `SupabaseClient` parameter (no fallback)
- Deprecated: `createServerClient()`, `createUserClient()` (use explicit variants)
```

---

## Verification Commands

### TypeScript Compilation
```bash
npx tsc --noEmit
```
✅ **PASSING** (as of last check)

### Test Suite
```bash
npx vitest run --pool=forks
```
⚠️ **NOT RUN** (need to run after P0-5 tests added)

### Service-Role Audit
```bash
grep -R "SUPABASE_SERVICE_ROLE_KEY" app services adapters lib
grep -R "createAdminClient\(" app services adapters lib
grep -R "createServerClient\(" app services adapters lib
```
⚠️ **NOT RUN** (need to run after P0-6 guard added)

---

## Risk Assessment

### Current State (40% Complete)
- ✅ **P0-1 DONE**: Footgun eliminated (fail-fast pattern)
- ✅ **4 critical routes secured**: review, convert, extract, extractions/[id]
- ⚠️ **~15 routes still vulnerable**: Using methods that will now throw if no client
- ⚠️ **Analytics service blocking**: History route cannot be fixed until P0-3
- ❌ **No test coverage**: RLS isolation not verified

### Before Production
**MUST COMPLETE**:
- P0-2: ALL remaining routes (block routes that forgot client will fail-fast now)
- P0-3: Analytics service refactor (unblocks history route)
- P0-5: Security isolation tests (prove RLS works)

**RECOMMENDED**:
- P0-4: Defense-in-depth audit
- P0-6: Static guard (prevent regressions)
- P0-7: Documentation (ADR, migration guide)

**CRITICAL ENV VAR**:
- Add `SUPABASE_JWT_SECRET` to production environment

---

## Next Steps (Priority Order)

### Immediate (Hours 1-4)
1. **P0-3**: Refactor `analytics.service.ts` to accept client parameter
2. **P0-2**: Update `/api/invoices/history` (unblocked after P0-3)
3. **P0-2**: Update remaining high-priority invoice routes (templates, bulk)

### Short-Term (Hours 5-8)
4. **P0-2**: Update credit/payment history routes
5. **P0-5**: Write 3 security isolation tests
6. **P0-6**: Add service-role static guard test

### Medium-Term (Hours 9-12)
7. **P0-4**: Audit defense-in-depth ownership checks
8. **P0-7**: Write ADR and migration docs
9. **P0-7**: Update CHANGELOG
10. Final verification: all tests passing, no regressions

---

## Files Modified (So Far)

### Core Infrastructure
- ✅ `lib/supabase.server.ts` (F1 - JWT clients)
- ✅ `services/invoice.db.service.ts` (P0-1 - fail-fast pattern)
- ✅ `.env.example` (F6 - JWT secret docs)
- ✅ `package.json` (jose dependency)

### Routes Secured
- ✅ `app/api/invoices/review/route.ts`
- ✅ `app/api/invoices/convert/route.ts`
- ✅ `app/api/invoices/extract/route.ts`
- ✅ `app/api/invoices/extractions/[id]/route.ts`

### Documentation
- ✅ `docs/BUG-2-FIX-PROGRESS.md` (original progress)
- ✅ `docs/BUG-2-P0-PROGRESS.md` (this file)

---

## Estimated Remaining Effort

- **P0-2 (Routes)**: 3-4 hours (~15 routes remaining)
- **P0-3 (Analytics)**: 1-2 hours (service refactor)
- **P0-4 (Audit)**: 1-2 hours (ownership checks)
- **P0-5 (Tests)**: 2-3 hours (3 isolation tests)
- **P0-6 (Guard)**: 1 hour (static test)
- **P0-7 (Docs)**: 2-3 hours (ADR + guides)

**Total**: 10-15 hours remaining

---

**Last Updated**: 2026-02-13
**Next Milestone**: P0-3 Analytics Service Refactor
