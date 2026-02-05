# Source Code Documentation
## Invoice2E - Codebase Reference

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Language** | TypeScript 5.3 |
| **Total Files** | ~150 |

---

## 1. Directory Structure

```
Invoice2E.1/
│
├── app/                          # Next.js 14 App Router
│   ├── [locale]/                 # Internationalized pages
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout with i18n
│   │   ├── login/page.tsx        # Login page
│   │   ├── signup/page.tsx       # Registration page
│   │   ├── dashboard/page.tsx    # User dashboard
│   │   ├── review/[id]/page.tsx  # Invoice review & edit
│   │   └── admin/                # Admin pages
│   │       ├── layout.tsx        # Admin layout wrapper
│   │       ├── page.tsx          # Admin dashboard
│   │       ├── users/page.tsx    # User management
│   │       ├── users/[id]/page.tsx # User detail
│   │       ├── packages/page.tsx # Package management
│   │       ├── transactions/page.tsx # Transaction list
│   │       └── audit-logs/page.tsx   # Audit log viewer
│   │
│   ├── api/                      # REST API endpoints
│   │   ├── auth/                 # Authentication
│   │   │   ├── login/route.ts
│   │   │   └── signup/route.ts
│   │   ├── files/                # File operations
│   │   │   └── upload/route.ts
│   │   ├── invoices/             # Invoice processing
│   │   │   ├── extract/route.ts
│   │   │   ├── convert/route.ts
│   │   │   ├── review/route.ts
│   │   │   ├── history/route.ts
│   │   │   ├── analytics/route.ts
│   │   │   ├── templates/route.ts
│   │   │   ├── batch/route.ts
│   │   │   └── [id]/route.ts
│   │   ├── payments/             # Payment processing
│   │   │   ├── checkout/route.ts
│   │   │   └── webhook/route.ts
│   │   ├── admin/                # Admin API endpoints
│   │   │   ├── stats/route.ts
│   │   │   ├── users/route.ts
│   │   │   ├── users/[id]/route.ts
│   │   │   ├── users/[id]/credits/route.ts
│   │   │   ├── users/[id]/ban/route.ts
│   │   │   ├── packages/route.ts
│   │   │   ├── packages/[id]/route.ts
│   │   │   ├── transactions/route.ts
│   │   │   ├── transactions/[id]/refund/route.ts
│   │   │   └── audit-logs/route.ts
│   │   └── health/route.ts       # Health check
│   │
│   ├── globals.css               # Global styles
│   └── favicon.ico
│
├── components/                   # React components
│   ├── forms/                    # Form components
│   │   ├── FileUploadForm.tsx    # Drag-drop upload (295 lines)
│   │   ├── InvoiceReviewForm.tsx # Data edit form (703 lines)
│   │   ├── LoginForm.tsx         # Login form
│   │   ├── SignupForm.tsx        # Registration form
│   │   ├── CreditPurchaseForm.tsx# Payment form
│   │   └── BulkUploadForm.tsx    # Batch upload
│   │
│   ├── ui/                       # UI primitives
│   │   ├── button.tsx            # Button variants
│   │   ├── card.tsx              # Card layout
│   │   ├── alert.tsx             # Alert/notification
│   │   ├── input.tsx             # Text input
│   │   ├── label.tsx             # Form labels
│   │   └── dialog.tsx            # Modal dialogs
│   │
│   ├── layout/                   # Layout components
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   │
│   └── admin/                    # Admin components
│       ├── AdminProtectedRoute.tsx  # Admin role guard
│       ├── AdminLayout.tsx          # Admin sidebar layout
│       ├── AdminStatsCard.tsx       # Dashboard stat cards
│       └── index.ts                 # Component exports
│
├── services/                     # Business logic (21+ files)
│   ├── ai/                       # AI extraction
│   │   ├── IAIExtractor.ts       # Interface (36 lines)
│   │   ├── gemini.extractor.ts   # Gemini implementation
│   │   ├── deepseek.extractor.ts # DeepSeek implementation
│   │   └── extractor.factory.ts  # Factory pattern (83 lines)
│   │
│   ├── auth.service.ts           # Authentication
│   ├── database.service.ts       # Repository pattern (441 lines)
│   ├── gemini.service.ts         # Legacy Gemini (376 lines)
│   ├── xrechnung.service.ts      # XRechnung 3.0 (379 lines)
│   ├── ubl.service.ts            # UBL 2.1 (327 lines)
│   ├── batch.service.ts          # Bulk processing (386 lines)
│   ├── payment-processor.ts      # Payment routing (320 lines)
│   ├── stripe.service.ts         # Stripe integration
│   ├── paypal.service.ts         # PayPal integration
│   ├── email.service.ts          # SendGrid (441 lines)
│   ├── analytics.service.ts      # Statistics (337 lines)
│   ├── template.db.service.ts    # Templates (318 lines)
│   ├── credits.db.service.ts     # Credit operations
│   │
│   └── admin/                    # Admin services
│       ├── audit.admin.service.ts      # Admin action logging
│       ├── user.admin.service.ts       # User management
│       ├── stats.admin.service.ts      # Dashboard statistics
│       ├── transaction.admin.service.ts # Transaction management
│       └── index.ts                    # Service exports
│
├── lib/                          # Utilities
│   ├── errors.ts                 # Error classes (61 lines)
│   ├── logger.ts                 # Logging (63 lines)
│   ├── validators.ts             # Zod schemas (54 lines)
│   ├── utils.ts                  # General helpers
│   ├── supabase.ts               # Browser client
│   ├── supabase.server.ts        # Server client
│   └── database-helpers.ts       # Case conversion
│
├── types/                        # TypeScript definitions
│   └── index.ts                  # All interfaces (136 lines)
│
├── db/                           # Database
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_phase4_features.sql
│
├── messages/                     # i18n translations
│   ├── en.json                   # English
│   └── de.json                   # German
│
├── styles/                       # CSS
│   └── globals.css               # CSS variables
│
├── tests/                        # Test files
│   ├── unit/
│   └── integration/
│
├── public/                       # Static assets
│
└── [Config files]
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── next.config.mjs
    └── .env.local
```

---

## 2. Service Modules

### 2.1 AI Extraction Services

| File | Lines | Purpose |
|------|-------|---------|
| `ai/IAIExtractor.ts` | 36 | Interface contract |
| `ai/gemini.extractor.ts` | ~350 | Gemini Vision API |
| `ai/deepseek.extractor.ts` | ~300 | DeepSeek Vision API |
| `ai/extractor.factory.ts` | 83 | Provider factory |

**Interface:**
```typescript
interface IAIExtractor {
    extractFromFile(buffer, fileName, fileType): Promise<ExtractedInvoiceData>
    getProviderName(): string
    validateConfiguration(): boolean
}
```

---

### 2.2 Format Generation Services

| File | Lines | Purpose |
|------|-------|---------|
| `xrechnung.service.ts` | 379 | CII/XRechnung 3.0 XML |
| `ubl.service.ts` | 327 | UBL 2.1 XML |

**XRechnung Methods:**
```typescript
class XRechnungService {
    generateXRechnung(data): { xmlContent, valid, errors }
    validateInvoiceData(data): void // throws ValidationError
    private buildXMLDocument(data): string
    private formatDate(date): string
    private escapeXml(text): string
}
```

---

### 2.3 Database Services

| File | Lines | Purpose |
|------|-------|---------|
| `database.service.ts` | 441 | Main repository |
| `credits.db.service.ts` | ~100 | Credit operations |
| `template.db.service.ts` | 318 | Template CRUD |

**DatabaseService Methods:**
```typescript
// User Operations
createUser(data): Promise<User>
getUserById(id): Promise<User>
getUserByEmail(email): Promise<User | null>
updateUser(id, data): Promise<User>

// Credits Operations
getUserCredits(userId): Promise<UserCredits>
deductCredits(userId, amount): Promise<boolean>
addCredits(userId, amount): Promise<UserCredits>

// Extraction/Conversion Operations
createExtraction(data): Promise<InvoiceExtraction>
getExtractionById(id): Promise<InvoiceExtraction>
createConversion(data): Promise<InvoiceConversion>
updateConversion(id, data): Promise<InvoiceConversion>

// Payment Operations
createPayment(data): Promise<PaymentTransaction>
getUserPayments(userId): Promise<PaymentTransaction[]>

// Audit Operations
createAuditLog(data): Promise<void>
```

---

### 2.4 Payment Services

| File | Lines | Purpose |
|------|-------|---------|
| `payment-processor.ts` | 320 | Payment routing |
| `stripe.service.ts` | ~250 | Stripe Checkout |
| `paypal.service.ts` | ~200 | PayPal Orders |

**PaymentProcessor Methods:**
```typescript
getPackages(): CreditPackage[]
processPayment(method, userId, packageId, ...): Promise<PaymentSession>
handleStripeWebhook(event): Promise<WebhookResult>
handlePaypalWebhook(event): Promise<WebhookResult>
addCreditsToUser(userId, credits, source): Promise<void>
getPaymentHistory(userId, page, limit): Promise<PaginatedPayments>
```

---

### 2.5 Communication Services

| File | Lines | Purpose |
|------|-------|---------|
| `email.service.ts` | 441 | SendGrid integration |

**EmailService Methods:**
```typescript
sendConversionEmail(email, data, xmlContent?): Promise<boolean>
sendPaymentConfirmationEmail(email, data): Promise<boolean>
sendWelcomeEmail(email, userName): Promise<boolean>
sendErrorNotificationEmail(email, error, invoiceNumber?): Promise<boolean>
```

---

### 2.6 Analytics Service

| File | Lines | Purpose |
|------|-------|---------|
| `analytics.service.ts` | 337 | Stats & charts |

**Methods:**
```typescript
getConversionHistory(userId, page, limit, filters): Promise<PaginatedHistory>
getStatistics(userId): Promise<UserStatistics>
getChartsData(userId, period): Promise<ChartsData>
exportHistoryAsCSV(userId): Promise<string>
```

---

### 2.7 Admin Services

| File | Lines | Purpose |
|------|-------|---------|
| `admin/audit.admin.service.ts` | ~100 | Admin action logging |
| `admin/user.admin.service.ts` | ~300 | User management |
| `admin/stats.admin.service.ts` | ~200 | Dashboard statistics |
| `admin/transaction.admin.service.ts` | ~230 | Transaction management |

**AdminAuditService Methods:**
```typescript
logAdminAction(params: LogActionParams): Promise<void>
getAuditLogs(page, limit): Promise<{ logs, total }>
```

**AdminUserService Methods:**
```typescript
getAllUsers(page, limit, filters): Promise<{ users, total }>
getUserById(userId): Promise<AdminUserWithCredits>
banUser(userId, reason, adminId): Promise<void>
unbanUser(userId, adminId): Promise<void>
modifyCredits(userId, amount, reason, adminId): Promise<{ newBalance }>
changeRole(userId, newRole, adminId): Promise<void>
```

**AdminStatsService Methods:**
```typescript
getDashboardStats(): Promise<AdminDashboardStats>
getRevenueByPeriod(period): Promise<RevenueData[]>
getUserGrowth(period): Promise<GrowthData[]>
```

**AdminTransactionService Methods:**
```typescript
getAllTransactions(page, limit, filters): Promise<{ transactions, total }>
getTransactionById(id): Promise<AdminTransaction>
refundTransaction(input, adminId): Promise<AdminTransaction>
```

---

## 3. API Routes

### 3.1 Authentication (`/api/auth`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | User login |
| `/api/auth/signup` | POST | User registration |

### 3.2 Files (`/api/files`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/files/upload` | POST | Upload invoice file |

### 3.3 Invoices (`/api/invoices`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/invoices/extract` | POST | AI extraction |
| `/api/invoices/convert` | POST | Generate XML |
| `/api/invoices/review` | POST | Save reviewed data |
| `/api/invoices/history` | GET | Conversion history |
| `/api/invoices/analytics` | GET | User statistics |
| `/api/invoices/templates` | GET/POST/PUT/DELETE | Templates |
| `/api/invoices/batch` | POST | Bulk upload |
| `/api/invoices/[id]` | GET | Single conversion |

### 3.4 Payments (`/api/payments`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/payments/checkout` | POST | Create checkout |
| `/api/payments/webhook` | POST | Process webhooks |

### 3.5 Admin (`/api/admin`)

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/api/admin/stats` | GET | admin | Dashboard stats |
| `/api/admin/users` | GET | admin | List users |
| `/api/admin/users/[id]` | GET | admin | User detail |
| `/api/admin/users/[id]/credits` | POST | admin | Modify credits |
| `/api/admin/users/[id]/ban` | POST | admin | Ban/unban user |
| `/api/admin/packages` | GET/POST | admin | List/create packages |
| `/api/admin/packages/[id]` | GET/PUT | admin | Get/update package |
| `/api/admin/packages/[id]` | DELETE | super_admin | Delete package |
| `/api/admin/transactions` | GET | admin | List transactions |
| `/api/admin/transactions/[id]/refund` | POST | super_admin | Refund transaction |
| `/api/admin/audit-logs` | GET | admin | View audit logs |

### 3.6 System (`/api/health`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Health check |

---

## 4. Component Library

### 4.1 Form Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `FileUploadForm` | userId, onComplete, credits | File upload |
| `InvoiceReviewForm` | extractionId, userId, data, confidence | Data editing |
| `LoginForm` | - | User login |
| `SignupForm` | - | Registration |
| `CreditPurchaseForm` | userId | Buy credits |
| `BulkUploadForm` | userId | Batch upload |

### 4.2 UI Components

| Component | Variants | Purpose |
|-----------|----------|---------|
| `Button` | default, destructive, outline, secondary, ghost, link | Actions |
| `Card` | - | Content container |
| `Alert` | default, destructive | Notifications |
| `Input` | - | Text input |
| `Label` | - | Form labels |
| `Dialog` | - | Modals |

### 4.3 Admin Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `AdminProtectedRoute` | children | Verifies admin role, redirects non-admins |
| `AdminLayout` | children | Sidebar navigation with admin menu |
| `AdminStatsCard` | title, value, icon, trend, trendLabel | Dashboard statistic card |

---

## 5. Utility Libraries

### 5.1 Error Handling

**File:** [lib/errors.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/errors.ts)

| Class | Code | Status | Usage |
|-------|------|--------|-------|
| `AppError` | various | 500 | Base class |
| `ValidationError` | VALIDATION_ERROR | 400 | Invalid input |
| `UnauthorizedError` | UNAUTHORIZED | 401 | Auth required |
| `InsufficientCreditsError` | INSUFFICIENT_CREDITS | 402 | No credits |
| `ForbiddenError` | FORBIDDEN | 403 | Not allowed |
| `NotFoundError` | NOT_FOUND | 404 | Missing resource |
| `ExtractionError` | EXTRACTION_ERROR | 500 | AI failure |
| `ConversionError` | CONVERSION_ERROR | 500 | XML failure |

### 5.2 Authorization

**File:** [lib/authorization.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/authorization.ts)

| Function | Returns | Throws | Purpose |
|----------|---------|--------|---------|
| `requireAdmin(request)` | `AuthorizedUser` | 401/403 | Verify admin role |
| `requireSuperAdmin(request)` | `AuthorizedUser` | 401/403 | Verify super_admin role |
| `checkAdminAuth(request)` | `AuthorizationResult` | - | Non-throwing auth check |
| `hasRole(roles)` | `boolean` | - | Check current session role |
| `isAdmin()` | `boolean` | - | Check if admin or super_admin |
| `isSuperAdmin()` | `boolean` | - | Check if super_admin |

**Usage in API Routes:**
```typescript
export async function GET(request: NextRequest) {
    const admin = await requireAdmin(request); // throws if not admin
    // admin.id, admin.email, admin.role available
}
```

### 5.3 Logging

**File:** [lib/logger.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/logger.ts)

```typescript
logger.info('message', { data });   // All environments
logger.error('message', error);     // All environments
logger.warn('message', { data });   // All environments
logger.debug('message', { data });  // Development only
```

### 5.4 Validation

**File:** [lib/validators.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/validators.ts)

| Schema | Fields | Usage |
|--------|--------|-------|
| `EmailSchema` | string email | Email validation |
| `PasswordSchema` | 8+ chars, upper, lower, number | Password rules |
| `SignupSchema` | email, password, names | Registration |
| `LoginSchema` | email, password | Login |
| `UpdateProfileSchema` | all profile fields | Profile update |
| `PaginationSchema` | page, limit, sort | Query params |

---

## 6. Configuration Files

### 6.1 Package Dependencies

**File:** [package.json](file:///c:/Users/osama/Desktop/Invoice2E.1/package.json)

**Key Dependencies:**
- `next`: 14.2.x
- `react`: 18.2.x
- `typescript`: 5.3.x
- `tailwindcss`: 3.3.x
- `zod`: Validation
- `@supabase/supabase-js`: Database
- `@google/generative-ai`: Gemini API
- `stripe`: Payments
- `jszip`: Bulk upload

### 6.2 TypeScript Config

**File:** [tsconfig.json](file:///c:/Users/osama/Desktop/Invoice2E.1/tsconfig.json)

- Target: ES2022
- Module: ESNext
- Strict mode: enabled
- Path alias: `@/*`

### 6.3 Tailwind Config

**File:** [tailwind.config.js](file:///c:/Users/osama/Desktop/Invoice2E.1/tailwind.config.js)

- Custom colors via CSS variables
- HSL color system
- Configurable border radius

---

## Document References

| Document | Path |
|----------|------|
| Architecture | [02-architecture/01-software-architecture.md](../02-architecture/01-software-architecture.md) |
| API Reference | [02-api-reference.md](./02-api-reference.md) |
| Database | [02-architecture/03-database.md](../02-architecture/03-database.md) |
