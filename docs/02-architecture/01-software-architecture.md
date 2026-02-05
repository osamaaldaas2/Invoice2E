# Software Architecture Document (SAD)
## Invoice2E - System Architecture

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Architecture Style** | Layered + Microservices-ready |
| **Deployment** | Serverless (Vercel) |

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │  React Pages    │  │  React Forms    │  │  React Query    │          │
│  │  (Next.js App)  │  │  (Components)   │  │  (Data Fetch)   │          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
└───────────┼────────────────────┼────────────────────┼────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Next.js)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │  /api/auth/*    │  │  /api/invoices/*│  │  /api/payments/*│          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
└───────────┼────────────────────┼────────────────────┼────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER (Business Logic)                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ AuthService│  │XRechnungSvc│  │ GeminiSvc  │  │PaymentProc │         │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘         │
└────────┼───────────────┼───────────────┼───────────────┼─────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA ACCESS LAYER                                │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │              DatabaseService (Supabase Client)              │         │
│  └─────────────────────────────┬──────────────────────────────┘         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Supabase │  │ Gemini   │  │ DeepSeek │  │ Stripe   │  │ SendGrid │  │
│  │ (PgSQL)  │  │ API      │  │ API      │  │ API      │  │ API      │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, Next.js 14 | UI components, SSR |
| **Styling** | Tailwind CSS 3.3 | Utility-first CSS |
| **State** | Zustand, React Query | Client state, server state |
| **Forms** | React Hook Form + Zod | Form management, validation |
| **API** | Next.js API Routes | RESTful endpoints |
| **Services** | TypeScript classes | Business logic, patterns |
| **Database** | PostgreSQL (Supabase) | Relational data storage |
| **Auth** | Supabase Auth + JWT | Authentication |
| **Storage** | Supabase Storage | File uploads |
| **AI** | Google Gemini, DeepSeek | Invoice data extraction |
| **Payments** | Stripe, PayPal | Credit purchases |
| **Email** | SendGrid | Transactional emails |
| **Deployment** | Vercel | Serverless hosting |

---

## 2. Layered Architecture

### 2.1 Presentation Layer

**Location:** `components/`, `app/[locale]/`

| Component Type | Location | Purpose |
|----------------|----------|---------|
| Pages | `app/[locale]/*.tsx` | Route handlers, layouts |
| Forms | `components/forms/` | User input components |
| UI Primitives | `components/ui/` | Reusable UI elements |
| Layout | `components/layout/` | Header, footer, nav |

**Key Patterns:**
- Server Components for data fetching
- Client Components for interactivity (`'use client'`)
- React Query for API state management
- Zustand for client-side state

### 2.2 API Layer

**Location:** `app/api/`

```
app/api/
├── auth/           # Authentication endpoints
│   ├── login/      # POST - User login
│   └── signup/     # POST - User registration
├── files/          # File management
│   └── upload/     # POST - File upload
├── invoices/       # Invoice processing
│   ├── extract/    # POST - AI extraction
│   ├── review/     # POST - Save reviewed data
│   ├── convert/    # POST - Generate XRechnung
│   ├── history/    # GET - Conversion history
│   ├── analytics/  # GET - User statistics
│   └── templates/  # CRUD - Invoice templates
├── payments/       # Payment processing
│   ├── checkout/   # POST - Create checkout
│   └── webhook/    # POST - Payment webhooks
└── health/         # System health check
```

**Route Handler Pattern:**
```typescript
export async function POST(request: Request) {
    try {
        // 1. Parse request body
        // 2. Validate with Zod
        // 3. Call service layer
        // 4. Return JSON response
    } catch (error) {
        // Centralized error handling
    }
}
```

### 2.3 Service Layer

**Location:** `services/`

| Service | File | Lines | Responsibility |
|---------|------|-------|----------------|
| XRechnungService | `xrechnung.service.ts` | 379 | CII XML generation, BR-DE compliance |
| UBLService | `ubl.service.ts` | 327 | UBL 2.1 XML generation |
| GeminiService | `gemini.service.ts` | 376 | AI extraction via Gemini |
| BatchService | `batch.service.ts` | 386 | Bulk upload processing |
| DatabaseService | `database.service.ts` | 441 | Supabase operations |
| PaymentProcessor | `payment-processor.ts` | 320 | Stripe/PayPal routing |
| EmailService | `email.service.ts` | 441 | SendGrid email delivery |
| AnalyticsService | `analytics.service.ts` | 337 | Statistics and charts |
| TemplateDBService | `template.db.service.ts` | 318 | Template CRUD |
| AuthService | `auth.service.ts` | 157 | Authentication |

### 2.4 Data Access Layer

**Location:** `lib/supabase.*.ts`, `services/*.db.service.ts`

**Components:**
- `supabase.ts` - Browser client (anon key)
- `supabase.server.ts` - Server client (service role)
- `database.service.ts` - Repository pattern wrapper
- `database-helpers.ts` - Case conversion utilities

**Data Transformation:**
```typescript
// camelCase (TypeScript) ↔ snake_case (PostgreSQL)
camelToSnakeKeys(data)  // Input to DB
snakeToCamelKeys(data)  // Output from DB
```

---

## 3. Design Patterns

### 3.1 Factory Pattern (AI Extractors)

**File:** [services/ai/extractor.factory.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/ai/extractor.factory.ts)

```
┌───────────────────────────────────────┐
│         ExtractorFactory              │
│  ├─ create(provider?) → IAIExtractor  │
│  ├─ getAvailableProviders()           │
│  └─ clear() (cache reset)             │
└───────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────┐
│         IAIExtractor (Interface)      │
│  ├─ extractFromFile()                 │
│  ├─ getProviderName()                 │
│  └─ validateConfiguration()           │
└───────────────────────────────────────┘
       ▲              ▲
       │              │
┌──────┴──────┐ ┌─────┴──────┐
│GeminiExtrac │ │DeepSeekExtr│
│tor          │ │actor       │
└─────────────┘ └────────────┘
```

**Benefits:**
- Easy to add new AI providers
- Cached instances for performance
- Configuration validation before use
- Environment-based provider selection

### 3.2 Repository Pattern (Database)

**File:** [services/database.service.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/services/database.service.ts)

```typescript
class DatabaseService {
    // User Operations
    createUser(data: CreateUserData): Promise<User>
    getUserById(userId: string): Promise<User>
    getUserByEmail(email: string): Promise<User | null>
    updateUser(userId: string, data: UpdateUserData): Promise<User>
    
    // Credits Operations
    getUserCredits(userId: string): Promise<UserCredits>
    deductCredits(userId: string, amount: number): Promise<boolean>
    addCredits(userId: string, amount: number): Promise<UserCredits>
    
    // Extraction/Conversion Operations
    createExtraction(...): Promise<InvoiceExtraction>
    createConversion(...): Promise<InvoiceConversion>
    
    // ... more operations
}
```

### 3.3 Singleton Pattern (Services)

All services export singleton instances:

```typescript
// Example from each service file
export const xrechnungService = new XRechnungService();
export const geminiService = new GeminiService();
export const databaseService = new DatabaseService();
export const paymentProcessor = new PaymentProcessor();
```

### 3.4 Adapter Pattern (External APIs)

```
┌──────────────────────┐
│   PaymentProcessor   │  ← Unified interface
└──────────┬───────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌───────┐    ┌────────┐
│Stripe │    │PayPal  │  ← External adapters
│Service│    │Service │
└───────┘    └────────┘
```

---

## 4. Data Flow

### 4.1 Invoice Conversion Flow

```
[1] User uploads file (PDF/JPG)
        │
        ▼
[2] FileUploadForm → /api/invoices/extract
        │
        ▼
[3] ExtractorFactory.create() → GeminiExtractor
        │
        ▼
[4] Gemini API → extractFromFile() → JSON data
        │
        ▼
[5] DatabaseService.createExtraction() → Save to DB
        │
        ▼
[6] Redirect to /review page
        │
        ▼
[7] User edits data in InvoiceReviewForm
        │
        ▼
[8] POST /api/invoices/convert
        │
        ▼
[9] XRechnungService.generateXRechnung() → XML
        │
        ▼
[10] Return XML for download
```

### 4.2 Payment Flow

```
[1] User selects credit package
        │
        ▼
[2] CreditPurchaseForm → /api/payments/checkout
        │
        ▼
[3] PaymentProcessor.processPayment(method)
        │
        ├── Stripe → stripeService.createCheckout()
        │
        └── PayPal → paypalService.createOrder()
        │
        ▼
[4] Redirect to payment gateway
        │
        ▼
[5] User completes payment
        │
        ▼
[6] Webhook → /api/payments/webhook
        │
        ▼
[7] PaymentProcessor.handleWebhook()
        │
        ▼
[8] DatabaseService.addCredits()
```

---

## 5. Security Architecture

### 5.1 Authentication

```
┌─────────────────────────────────────┐
│            User Login               │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│       AuthService.login()           │
│  ├─ Verify email/password           │
│  ├─ bcrypt.compare()                │
│  └─ Create Supabase session         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│           JWT Token                 │
│  ├─ Stored in httpOnly cookie       │
│  ├─ Refreshed automatically         │
│  └─ Used for API authorization      │
└─────────────────────────────────────┘
```

### 5.2 Row-Level Security (RLS)

All tables have RLS enabled with policies:

```sql
-- Users can only see their own data
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (user_id::text = auth.uid()::text);
```

### 5.3 Input Validation

**Defense in depth:**
1. Client-side validation (React Hook Form + Zod)
2. API route validation (Zod schemas)
3. Database constraints (NOT NULL, CHECK)

---

## 6. Integration Points

### 6.1 External API Integrations

| Service | Purpose | Auth Method | Timeout |
|---------|---------|-------------|---------|
| Google Gemini | AI extraction | API Key | 60s |
| DeepSeek | AI extraction | API Key | 60s |
| Stripe | Payments | Secret Key | 30s |
| PayPal | Payments | Client ID/Secret | 30s |
| SendGrid | Email | API Key | 10s |
| Supabase | Database | Service Role Key | 30s |

### 6.2 Error Handling

**Custom Error Classes:**
```typescript
// lib/errors.ts
class AppError extends Error {
    code: string;
    statusCode: number;
}

class ValidationError extends AppError {}
class NotFoundError extends AppError {}
class AuthenticationError extends AppError {}
```

**API Error Response Format:**
```json
{
    "success": false,
    "error": "Error message",
    "code": "ERROR_CODE",
    "timestamp": "2026-02-01T12:00:00Z"
}
```

---

## 7. Scalability

### 7.1 Horizontal Scaling

| Component | Scaling Strategy |
|-----------|------------------|
| API Routes | Vercel serverless (auto-scale) |
| Database | Supabase managed (connection pooling) |
| File Storage | Supabase Storage (S3-backed) |
| AI Processing | Stateless (new instance per request) |

### 7.2 Caching Strategy

| Level | Implementation |
|-------|----------------|
| Browser | React Query cache (5min stale) |
| CDN | Vercel Edge (static assets) |
| Application | Factory pattern singleton cache |
| Database | Supabase connection pooling |

### 7.3 Performance Optimizations

- Next.js Image optimization
- Code splitting (dynamic imports)
- Server Components (reduced JS bundle)
- Database indexes on foreign keys

---

## 8. Deployment Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                          VERCEL                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Edge Network (CDN)                    │  │
│  │  - Static assets (JS, CSS, images)                       │  │
│  │  - Cached responses                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Serverless Functions                     │  │
│  │  - API routes (/api/*)                                   │  │
│  │  - SSR pages                                             │  │
│  │  - Auto-scaling (0 to N instances)                       │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┬─┘
                                                              │
                    ┌─────────────────────────────────────────┼─┐
                    │              SUPABASE                    │ │
                    │  ┌────────────────┐ ┌────────────────┐  │ │
                    │  │   PostgreSQL   │ │    Storage     │  │ │
                    │  │   (Database)   │ │   (S3-like)    │  │ │
                    │  └────────────────┘ └────────────────┘  │ │
                    │  ┌────────────────┐ ┌────────────────┐  │ │
                    │  │  Auth Service  │ │   Realtime     │  │ │
                    │  └────────────────┘ └────────────────┘  │ │
                    └─────────────────────────────────────────┴─┘
```

---

## Document References

| Document | Path |
|----------|------|
| PRD | [01-product/01-prd.md](../01-product/01-prd.md) |
| Technical Design | [02-technical-design.md](./02-technical-design.md) |
| Database Schema | [03-database.md](./03-database.md) |
| API Reference | [03-development/02-api-reference.md](../03-development/02-api-reference.md) |
