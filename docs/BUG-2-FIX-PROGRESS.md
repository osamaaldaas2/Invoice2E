# BUG-2 Fix Progress Report
## Row Level Security (RLS) Restoration

**Issue**: CRITICAL - All database operations bypassed RLS using service-role key (CVSS 9.1)
**Fix Protocol**: F1-F7 Implementation (Option 1: Supabase-compatible JWT)
**Date**: 2026-02-13
**Status**: IN PROGRESS (60% Complete)

---

## ✅ COMPLETED

### F1: Create Two Explicit Supabase Clients ✅

**File**: [`lib/supabase.server.ts`](../lib/supabase.server.ts)

**Changes**:
1. Installed `jose` library for JWT signing
2. Created `createAdminClient()`:
   - Uses `SUPABASE_SERVICE_ROLE_KEY`
   - **BYPASSES RLS** - Use ONLY for admin operations
   - Singleton pattern with caching
3. Created `createUserScopedClient(userId: string)`:
   - Signs Supabase-compatible JWT with:
     - `sub`: userId (required for `auth.uid()` to work)
     - `role`: 'authenticated'
     - `aud`: 'authenticated'
     - `exp`: 15 minutes (short-lived)
   - Uses `SUPABASE_JWT_SECRET` (from Supabase settings)
   - **RESPECTS RLS** - auth.uid() returns the provided userId
4. Deprecated old functions with warnings:
   - `createServerClient()` - warns and delegates to admin
   - `createUserClient()` - warns, NO service-role fallback
5. Removed dangerous service-role fallback

**Verification**:
- ✅ TypeScript compiles (`npx tsc --noEmit`)
- ✅ JWT signing works with `jose` library
- ✅ No service-role fallback for user operations

---

### F2: Refactor Database Services (Dependency Injection) ✅

**File**: [`services/invoice.db.service.ts`](../services/invoice.db.service.ts)

**Changes**:
1. Added optional `client?: SupabaseClient` parameter to all methods:
   - `createExtraction(data, client?)`
   - `getExtractionById(id, client?)`
   - `getUserExtractions(userId, limit, client?)`
   - `updateExtraction(id, data, client?)`
   - `deleteExtraction(id, client?)`
   - `createConversion(data, client?)`
   - `updateConversion(id, data, client?)`
   - `getConversionById(id, client?)`
   - `getUserConversions(userId, limit, client?)`
   - `getConversionByExtractionId(id, client?)`
   - `processConversionTransaction(userId, conversionId, client?)`
2. Created `getClient(client?)` helper:
   - Returns provided client if present
   - Falls back to `createAdminClient()` for backward compatibility
3. Removed old `getAdminClient()` method
4. Updated all comments to reference F2 pattern

**Benefits**:
- ✅ Backward compatibility: existing code works (uses admin fallback)
- ✅ New code can pass user-scoped client for RLS isolation
- ✅ Gradual migration path
- ✅ Single source of truth for database operations

**Verification**:
- ✅ TypeScript compiles
- ✅ All methods accept optional client parameter
- ✅ No breaking changes to existing call sites

---

### F3: Update User-Facing Routes (Partial) ✅

**Completed Routes**:

#### 1. [`app/api/invoices/review/route.ts`](../app/api/invoices/review/route.ts) ✅
- Added `createUserScopedClient(userId)` import
- Created user-scoped client after authentication
- Updated 5 database calls to use `userClient`:
  - `getExtractionById(extractionId, userClient)`
  - `updateExtraction(extractionId, data, userClient)`
  - `getConversionByExtractionId(extractionId, userClient)`
  - `updateConversion(id, data, userClient)`
  - `createConversion(data, userClient)`
- **RLS NOW ENFORCED**: Users can only access their own data

#### 2. [`app/api/invoices/convert/route.ts`](../app/api/invoices/convert/route.ts) ✅
- Added `createUserScopedClient(userId)` import
- Created user-scoped client after authentication
- Updated 3 database calls to use `userClient`:
  - `getConversionByExtractionId(extractionId, userClient)`
  - `updateConversion(id, data, userClient)`
  - `updateExtraction(id, data, userClient)`
- **RLS NOW ENFORCED**: Conversions and extractions isolated per user

**Verification**:
- ✅ TypeScript compiles
- ✅ All database calls pass user-scoped client
- ✅ Defense-in-depth: ownership checks + RLS enforcement

---

### F6: Documentation Updates (Partial) ✅

**File**: [`.env.example`](../.env.example)

**Changes**:
- Added `SUPABASE_JWT_SECRET` with clear documentation:
  ```bash
  # Supabase JWT Secret (REQUIRED for RLS-based data isolation)
  # Get from: https://app.supabase.com/project/[project-id]/settings/api (under "JWT Settings")
  # This is used to sign JWTs for user-scoped database clients.
  # CRITICAL: Never use service-role key for user-facing data access - it bypasses RLS.
  SUPABASE_JWT_SECRET=your_jwt_secret_from_supabase_settings
  ```

**Verification**:
- ✅ Clear instructions for obtaining JWT secret
- ✅ Security warnings about service-role key

---

## 🚧 IN PROGRESS / TODO

### F3: Update Remaining User-Facing Routes 🚧

**Affected Services**:
1. [`services/analytics.service.ts`](../services/analytics.service.ts) - Uses `createServerClient()` directly
2. Other services TBD

**Routes Requiring Update** (estimated 15-20 routes):
- `/api/invoices/history` → Uses analytics.service (needs refactor)
- `/api/invoices/extractions/[id]`
- `/api/invoices/extract`
- `/api/invoices/templates/*`
- `/api/invoices/bulk-upload`
- `/api/invoices/batch-download`
- `/api/invoices/review/bulk`
- `/api/users/profile`
- `/api/credits/usage`
- `/api/credits/history`
- `/api/payments/history`

**Pattern to Apply**:
```typescript
import { createUserScopedClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();

  // F3: Create user-scoped client
  const userClient = await createUserScopedClient(user.id);

  // Pass to all database service calls
  await invoiceDbService.someMethod(...args, userClient);
}
```

---

### F4: Defense-in-Depth Ownership Checks 📋

**Current State**: Some routes have ownership checks (e.g., `/api/invoices/convert` line 235-241)

**TODO**:
1. Audit all user-facing routes for ownership checks
2. Ensure ownership verification happens BEFORE RLS enforcement
3. Add tests for ownership bypass attempts

**Example Pattern**:
```typescript
// Get data via RLS-enforced query
const extraction = await invoiceDbService.getExtractionById(id, userClient);

// Defense-in-depth: verify ownership explicitly
if (extraction.userId !== user.id) {
  logger.warn('Ownership check failed', { id, userId: user.id });
  return unauthorized();
}
```

---

### F5: Security Isolation Tests 📋

**Required Tests** (minimum 3):

1. **Cross-User Access Test**:
   ```typescript
   // User A creates extraction
   // User B attempts to access User A's extraction using their own JWT
   // Expected: RLS blocks access (returns empty/null)
   ```

2. **Admin Override Test**:
   ```typescript
   // Admin route uses createAdminClient()
   // Should access all users' data
   // Expected: RLS bypassed correctly
   ```

3. **JWT Expiration Test**:
   ```typescript
   // Create JWT with 1-second expiry
   // Wait 2 seconds
   // Attempt database query
   // Expected: JWT validation fails
   ```

**File to Create**: `tests/security/rls-isolation.test.ts`

---

### F6: Complete Service-Role Audit 📋

**TODO**:
1. Search codebase for all `SUPABASE_SERVICE_ROLE_KEY` usage
2. Search for all `createServerClient()` calls
3. Search for all `createAdminClient()` calls
4. Verify each usage:
   - ✅ Admin route → OK to use admin client
   - ✅ Background job → OK to use admin client
   - ✅ Webhook → OK to use admin client (external auth)
   - ❌ User-facing route → MUST use user-scoped client

**Files to Check**:
- All files in `app/api/admin/**/*`
- `app/api/internal/batch-worker/route.ts`
- `app/api/payments/webhook/route.ts`
- All services in `services/**/*.ts`
- All adapters in `adapters/**/*.ts`

---

### F7: Comprehensive Documentation 📋

**Documents to Create/Update**:

1. **Security ADR** (`docs/adr/005-rls-restoration.md`):
   - Problem: RLS bypass vulnerability
   - Decision: Supabase-compatible JWT approach
   - Consequences: Performance, security, complexity
   - Alternatives considered: Custom RLS, middleware, Supabase Auth

2. **Migration Guide** (`docs/BUG-2-MIGRATION.md`):
   - How to update routes to use user-scoped client
   - Code examples and patterns
   - Common pitfalls
   - Testing checklist

3. **Security Checklist** (`docs/SECURITY.md`):
   - When to use admin vs user-scoped client
   - How to verify RLS policies
   - Testing for isolation breaches
   - Incident response procedures

4. **CHANGELOG Entry**:
   - SECURITY: Restored RLS-based data isolation (BUG-2)
   - BREAKING: SUPABASE_JWT_SECRET now required

---

## Verification Checklist

### Completed ✅
- [x] F1: TypeScript compiles without errors
- [x] F2: All service methods accept optional client
- [x] F3 (Partial): 2 critical routes updated
- [x] F6 (Partial): .env.example documented

### Pending 📋
- [ ] F3: All user-facing routes updated (~15 routes remaining)
- [ ] F3: Analytics service refactored
- [ ] F4: Ownership checks audited
- [ ] F5: Security isolation tests created (0/3)
- [ ] F5: All tests pass
- [ ] F6: Service-role usage audit complete
- [ ] F7: Documentation complete (0/4 docs)
- [ ] Manual testing: User isolation verified
- [ ] Manual testing: Admin routes still work
- [ ] Production deployment checklist

---

## Risk Assessment

### Current State (60% Complete)
- ✅ **Core infrastructure secure**: JWT signing, dependency injection pattern
- ✅ **2 critical routes protected**: review, convert (most sensitive operations)
- ⚠️ **Remaining routes vulnerable**: Still using admin client (bypass RLS)
- ⚠️ **No test coverage**: Security isolation not verified

### Before Production Deploy
- **MUST COMPLETE**: F3 (all routes), F5 (tests), F6 (audit)
- **RECOMMENDED**: F4 (defense-in-depth), F7 (documentation)
- **CRITICAL**: Add `SUPABASE_JWT_SECRET` to production environment

---

## Next Steps

### Priority 1 (Critical) 🔥
1. Refactor `analytics.service.ts` to accept optional client
2. Update remaining user-facing routes in `/api/invoices/*`
3. Update user/credit/payment history routes
4. Create security isolation tests

### Priority 2 (High) ⚡
1. Audit admin routes (verify admin client usage is intentional)
2. Add defense-in-depth ownership checks
3. Create migration documentation

### Priority 3 (Medium) 📝
1. Write Security ADR
2. Update CHANGELOG
3. Create security checklist
4. Manual testing and verification

---

## Files Modified

### Core Infrastructure
- ✅ `lib/supabase.server.ts` (F1)
- ✅ `services/invoice.db.service.ts` (F2)
- ✅ `.env.example` (F6)
- ✅ `package.json` (added `jose`)

### Routes Updated
- ✅ `app/api/invoices/review/route.ts` (F3)
- ✅ `app/api/invoices/convert/route.ts` (F3)

### Documentation
- ✅ `docs/BUG-2-FIX-PROGRESS.md` (this file)

---

## Estimated Remaining Effort

- **F3 Completion**: 4-6 hours (15-20 routes + analytics service refactor)
- **F4 Audit**: 2-3 hours (ownership checks review)
- **F5 Tests**: 2-3 hours (3 security tests)
- **F6 Audit**: 1-2 hours (service-role usage review)
- **F7 Documentation**: 2-3 hours (4 docs)

**Total**: 11-17 hours remaining work

---

## Dependencies

### External (Production)
- `jose` ^5.x (JWT signing) - ✅ Installed
- `SUPABASE_JWT_SECRET` environment variable - ⚠️ Must be configured

### Internal
- Migration 022 (RLS policies) - ✅ Already applied
- Supabase project with JWT secret - ✅ Available

---

**Last Updated**: 2026-02-13
**Next Review**: After F3 completion (all routes updated)
