# Technical Design Document (TDD)
## Invoice2E - Implementation Details

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Language** | TypeScript 5.3 |
| **Framework** | Next.js 14.2 |

---

## 1. Project Structure

```
Invoice2E.1/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # Internationalized pages
│   │   ├── page.tsx              # Landing page
│   │   ├── login/                # Auth pages
│   │   ├── signup/
│   │   ├── dashboard/
│   │   └── review/[id]/          # Invoice review
│   └── api/                      # API routes
│       ├── auth/
│       ├── invoices/
│       ├── payments/
│       └── health/
├── components/                   # React components
│   ├── forms/                    # Form components
│   └── ui/                       # UI primitives
├── services/                     # Business logic
│   ├── ai/                       # AI extractors
│   ├── *.service.ts              # Domain services
│   └── *.db.service.ts           # Database services
├── lib/                          # Utilities
│   ├── errors.ts                 # Error classes
│   ├── logger.ts                 # Logging utility
│   ├── validators.ts             # Zod schemas
│   ├── supabase.ts               # Client-side Supabase
│   └── supabase.server.ts        # Server-side Supabase
├── types/                        # TypeScript types
│   └── index.ts                  # Shared interfaces
├── db/migrations/                # SQL migrations
├── messages/                     # i18n translations
├── styles/                       # Global CSS
└── tests/                        # Test files
```

---

## 2. Error Handling

### 2.1 Error Class Hierarchy

**File:** [lib/errors.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/errors.ts)

```
AppError (base class)
├── ValidationError     (400) - Invalid input data
├── UnauthorizedError   (401) - Not authenticated
├── InsufficientCreditsError (402) - No credits
├── ForbiddenError      (403) - Not authorized
├── NotFoundError       (404) - Resource not found
├── ExtractionError     (500) - AI extraction failed
└── ConversionError     (500) - XRechnung generation failed
```

### 2.2 Error Response Format

```typescript
interface ErrorResponse {
    success: false;
    error: string;           // Human-readable message
    code: string;            // Machine-readable code
    details?: object;        // Additional context
    timestamp: string;       // ISO timestamp
}
```

**Example:**
```json
{
    "success": false,
    "error": "Insufficient credits for this operation",
    "code": "INSUFFICIENT_CREDITS",
    "timestamp": "2026-02-01T12:00:00.000Z"
}
```

### 2.3 API Error Handler Pattern

```typescript
// API route pattern
export async function POST(request: Request) {
    try {
        // Business logic
    } catch (error) {
        if (error instanceof AppError) {
            return NextResponse.json(
                { success: false, error: error.message, code: error.code },
                { status: error.statusCode }
            );
        }
        logger.error('Unexpected error', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
```

---

## 3. Logging System

### 3.1 Logger Implementation

**File:** [lib/logger.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/logger.ts)

| Method | Level | Environment | Output |
|--------|-------|-------------|--------|
| `logger.info()` | INFO | All | Structured JSON |
| `logger.error()` | ERROR | All | JSON + stack trace |
| `logger.warn()` | WARN | All | Structured JSON |
| `logger.debug()` | DEBUG | Development only | Structured JSON |

### 3.2 Log Entry Format

```typescript
interface LogEntry {
    timestamp: string;      // ISO 8601
    level: string;          // INFO, ERROR, WARN, DEBUG
    message: string;        // Description
    data?: Record<string, unknown>;  // Context
}
```

**Example Output:**
```json
{"timestamp":"2026-02-01T12:00:00.000Z","level":"INFO","message":"AI extractor created","data":{"provider":"gemini"}}
```

### 3.3 Usage Patterns

```typescript
// Info with context
logger.info('Invoice extracted', { extractionId, userId, confidence: 0.95 });

// Error with exception
logger.error('Extraction failed', error);

// Debug (development only)
logger.debug('Request payload', { body: requestBody });
```

---

## 4. Validation

### 4.1 Zod Schemas

**File:** [lib/validators.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/validators.ts)

| Schema | Purpose | Fields |
|--------|---------|--------|
| `EmailSchema` | Email validation | string, email format |
| `PasswordSchema` | Strong password | 8+ chars, upper, lower, number |
| `SignupSchema` | Registration | email, password, firstName, lastName |
| `LoginSchema` | Authentication | email, password |
| `UpdateProfileSchema` | Profile update | All profile fields (optional) |
| `PaginationSchema` | Query params | page, limit, sort, order |

### 4.2 Password Requirements

```typescript
PasswordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number');
```

### 4.3 Validation Flow

```
1. Client  → React Hook Form validates on change
2. Submit  → Zod schema validates before API call
3. API     → Zod schema validates request body
4. Service → Business logic validation
5. DB      → PostgreSQL constraints
```

---

## 5. Type Definitions

### 5.1 Core Entity Types

**File:** [types/index.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/types/index.ts)

```typescript
// User entity
interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    addressLine1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    taxId?: string;
    language: 'en' | 'de';
    createdAt: string;
    updatedAt: string;
}

// User credits
interface UserCredits {
    userId: string;
    availableCredits: number;
    totalCreditsUsed: number;
    createdAt: string;
    updatedAt: string;
}

// Invoice extraction record
interface InvoiceExtraction {
    id: string;
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore: number;
    geminiResponseTimeMs: number;
    createdAt: string;
}

// Invoice conversion record
interface InvoiceConversion {
    id: string;
    userId: string;
    extractionId: string;
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat: 'CII' | 'UBL';
    conversionStatus: 'pending' | 'completed' | 'failed';
    validationStatus?: 'valid' | 'invalid';
    validationErrors?: Record<string, unknown>;
    creditsUsed: number;
    createdAt: string;
}
```

### 5.2 API Response Types

```typescript
// Standard API response
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

// Paginated response
interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
```

### 5.3 Enum Types

```typescript
enum ExtractionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

enum ConversionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

enum PaymentStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REFUNDED = 'refunded'
}
```

---

## 6. Service Implementations

### 6.1 XRechnung Service

**File:** [services/xrechnung.service.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/xrechnung.service.ts)

**Purpose:** Generate EN16931 CII XML compliant with XRechnung 3.0

**Key Methods:**

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| `generateXRechnung()` | InvoiceData | { xmlContent, valid, errors } | Main generation method |
| `validateInvoiceData()` | InvoiceData | void (throws) | BR-DE rule validation |
| `buildXMLDocument()` | InvoiceData | string | XML structure building |

**BR-DE Validation Rules:**
- BR-DE-2: Seller contact required
- BR-DE-3: Seller city required
- BR-DE-4: Seller postal code required
- BR-DE-15: Buyer reference (Leitweg-ID) required
- BR-DE-23-a: IBAN required for credit transfer
- BR-DE-21: XRechnung 3.0 specification ID

### 6.2 Gemini Extractor

**File:** [services/gemini.service.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/gemini.service.ts)

**Purpose:** Extract invoice data from images using Google Gemini Vision API

**Configuration:**
```typescript
const config = {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-flash',
    timeout: 60000,  // 60 seconds
    maxRetries: 3
};
```

**Extraction Fields:**
- Invoice number, date
- Buyer/Seller info (name, address, tax ID)
- Line items (description, quantity, price, tax)
- Totals (subtotal, tax, grand total)
- Currency, payment terms

### 6.3 Batch Service

**File:** [services/batch.service.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/batch.service.ts)

**Purpose:** Process bulk invoice uploads from ZIP files

**Processing Flow:**
```
1. Parse ZIP → Extract PDFs (max 100)
2. For each file:
   a. AI extraction
   b. Format conversion (CII/UBL)
   c. Update progress
3. Generate results ZIP
4. Return download link
```

**Interfaces:**
```typescript
interface BatchJob {
    id: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    totalFiles: number;
    processedFiles: number;
    format: 'CII' | 'UBL';
}

interface BatchResult {
    fileName: string;
    success: boolean;
    xmlContent?: string;
    error?: string;
}
```

---

## 7. Database Helpers

### 7.1 Case Conversion

**File:** [lib/database-helpers.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/lib/database-helpers.ts)

```typescript
// TypeScript (camelCase) → PostgreSQL (snake_case)
function camelToSnakeKeys(obj: object): object

// PostgreSQL (snake_case) → TypeScript (camelCase)
function snakeToCamelKeys(obj: object): object
```

**Example:**
```typescript
// Input:  { firstName: 'John', lastName: 'Doe' }
// Output: { first_name: 'John', last_name: 'Doe' }

// Input:  { first_name: 'John', last_name: 'Doe' }
// Output: { firstName: 'John', lastName: 'Doe' }
```

### 7.2 Supabase Clients

| Client | File | Key Type | Usage |
|--------|------|----------|-------|
| Browser | `supabase.ts` | Anon key | Client components |
| Server | `supabase.server.ts` | Service role | API routes |

---

## 8. AI Extraction Interface

### 8.1 Interface Definition

**File:** [services/ai/IAIExtractor.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/ai/IAIExtractor.ts)

```typescript
interface IAIExtractor {
    extractFromFile(
        fileBuffer: Buffer,
        fileName: string,
        fileType: string
    ): Promise<ExtractedInvoiceData>;
    
    getProviderName(): string;
    
    validateConfiguration(): boolean;
}
```

### 8.2 ExtractedInvoiceData

```typescript
interface ExtractedInvoiceData {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    
    buyerName: string | null;
    buyerEmail: string | null;
    buyerAddress: string | null;
    buyerTaxId: string | null;
    
    sellerName: string | null;
    sellerEmail: string | null;
    sellerAddress: string | null;
    sellerTaxId: string | null;
    
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        taxRate?: number;
    }>;
    
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    
    paymentTerms: string | null;
    notes: string | null;
    
    confidence: number;        // 0-1 score
    processingTimeMs: number;  // Extraction time
}
```

---

## 9. Configuration

### 9.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek API key |
| `AI_PROVIDER` | Optional | gemini \| deepseek (default: deepseek) |
| `STRIPE_SECRET_KEY` | Phase 4 | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Phase 4 | Stripe webhook signing |
| `PAYPAL_CLIENT_ID` | Phase 4 | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | Phase 4 | PayPal secret |
| `SENDGRID_API_KEY` | Phase 4 | SendGrid API key |

### 9.2 TypeScript Configuration

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["dom", "dom.iterable", "esnext"],
        "strict": true,
        "noEmit": true,
        "esModuleInterop": true,
        "module": "esnext",
        "moduleResolution": "bundler",
        "jsx": "preserve",
        "paths": {
            "@/*": ["./*"]
        }
    }
}
```

### 9.3 ESLint Configuration

- Extends: Next.js recommended
- No console statements (except logger)
- Strict TypeScript rules

---

## 10. Testing Strategy

### 10.1 Test Framework

| Tool | Purpose |
|------|---------|
| Vitest | Unit tests |
| React Testing Library | Component tests |
| MSW | API mocking |

### 10.2 Test File Locations

```
tests/
├── unit/
│   ├── services/         # Service unit tests
│   └── lib/              # Utility tests
├── integration/
│   └── api/              # API route tests
└── __mocks__/            # Test mocks
```

### 10.3 Coverage Targets

| Metric | Target |
|--------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

---

## Document References

| Document | Path |
|----------|------|
| Architecture | [01-software-architecture.md](./01-software-architecture.md) |
| Database | [03-database.md](./03-database.md) |
| API Reference | [03-development/02-api-reference.md](../03-development/02-api-reference.md) |
| Source Code | [03-development/01-source-code.md](../03-development/01-source-code.md) |
