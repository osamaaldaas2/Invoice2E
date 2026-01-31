# Invoice2E - System Architecture Document

**Version:** 1.0  
**Date:** 2024-01-30  
**Architect:** Osama (Senior Developer)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER DEVICES                              │
│            (Desktop, Tablet, Mobile Browsers)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                   ┌───────▼────────┐
                   │   CLOUDFLARE   │
                   │   (DDoS Protection)
                   └───────┬────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Vercel CDN  │   │  Next.js API │   │  Static      │
│  (Frontend)  │   │  (Backend)   │   │  Assets      │
└──────────────┘   └──────┬───────┘   └──────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐   ┌──────────────┐  ┌──────────────┐
│  Supabase   │   │  Google      │  │  Stripe/     │
│  (Database) │   │  Gemini API  │  │  PayPal      │
│   + Auth    │   │  (AI)        │  │  (Payments)  │
└─────────────┘   └──────────────┘  └──────────────┘
       │
       ▼
┌──────────────────┐
│   PostgreSQL DB  │
│   (Supabase)     │
└──────────────────┘
```

---

## 2. Technology Stack Decision

### 2.1 Frontend: Next.js 14 (Full-Stack)

**Why Next.js over alternatives?**

| Aspect | Next.js | React (Vite) | Vue | Svelte |
|--------|---------|--------------|-----|--------|
| Full-stack capability | ✅ Yes | ❌ No | ❌ No | ❌ No |
| API Routes | ✅ Built-in | ❌ Separate | ❌ Separate | ❌ Separate |
| File-based routing | ✅ Yes | ❌ No | ⚠️ Addon | ⚠️ Addon |
| Image optimization | ✅ Built-in | ❌ No | ❌ No | ❌ No |
| Server Components | ✅ Yes | ❌ No | ⚠️ Limited | ⚠️ Limited |
| Learning curve | ⚠️ Medium | ✅ Low | ✅ Low | ⚠️ Medium |
| Community | ✅ Huge | ✅ Huge | ⚠️ Medium | ❌ Small |
| Job market | ✅ High demand | ✅ High | ⚠️ Medium | ❌ Low |
| Deployment | ✅ Vercel | ⚠️ Any | ⚠️ Any | ⚠️ Any |

**Decision:** Next.js 14 with App Router (latest approach)

---

### 2.2 Database: Supabase (PostgreSQL)

**Why Supabase?**

```
❌ Firebase:
- No complex relational queries
- Limited control
- Expensive at scale
- No direct SQL access

✅ Supabase:
- Full PostgreSQL power
- SQL access when needed
- Built-in Auth
- Real-time subscriptions
- Managed backups
- GDPR compliant
- Affordable for MVP
```

---

### 2.3 Authentication: Supabase Auth

**Why?**
- Built into Supabase
- OAuth ready (future)
- Email verification included
- Password reset built-in
- JWT tokens
- No third-party complexity

---

### 2.4 AI/ML: Google Gemini API

**Why Gemini over OpenAI?**

| Aspect | Gemini | OpenAI |
|--------|--------|--------|
| Cost (text extraction) | Lower | Higher |
| Vision capability | Excellent | Good |
| PDF handling | Native | Requires preprocessing |
| Structured output | JSON mode | JSON mode |
| Rate limiting | Generous | Standard |
| Latency | Lower | Standard |

**Decision:** Gemini API with vision capability for PDF/image extraction

---

### 2.5 Validation: KoSIT Validator

**Why?**
- Official German validator
- XRechnung 3.0 certified
- Open source
- Can run locally (JAR file)
- Reliable for compliance

---

### 2.6 Payments: Stripe + PayPal

**Why?**
- Stripe: Best for EU (SEPA, Apple Pay)
- PayPal: Wider acceptance
- Both: PCI-DSS compliant (no card data storage)
- Both: Webhook support for automation
- Both: Established SDKs

---

## 3. Project Structure

### 3.1 Complete Folder Structure

```
invoice2e/
│
├── .env.local                    # Environment variables (not in git)
├── .env.example                  # Example env template
├── .gitignore                    # Git ignore rules
├── package.json                  # Dependencies
├── package-lock.json             # Lock file
├── tsconfig.json                 # TypeScript config
├── next.config.js                # Next.js config
├── tailwind.config.js            # Tailwind config
├── postcss.config.js             # PostCSS config
├── vercel.json                   # Vercel deployment config
│
├── app/                          # Next.js App Directory
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Root page (redirect to /en)
│   ├── [locale]/                 # Language routing
│   │   ├── layout.tsx            # Language layout wrapper
│   │   ├── page.tsx              # Home/landing page
│   │   ├── converter/            # Converter feature
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Main converter page
│   │   │   └── result/
│   │   │       └── page.tsx      # Result page
│   │   ├── dashboard/            # User dashboard
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── profile/
│   │   │   │   └── page.tsx      # Profile settings
│   │   │   ├── history/
│   │   │   │   └── page.tsx      # Conversion history
│   │   │   ├── credits/
│   │   │   │   └── page.tsx      # Credits management
│   │   │   └── payments/
│   │   │       └── page.tsx      # Payment history
│   │   ├── pricing/
│   │   │   └── page.tsx          # Pricing page
│   │   ├── about/
│   │   │   └── page.tsx          # About page
│   │   ├── contact/
│   │   │   └── page.tsx          # Contact page
│   │   └── auth/
│   │       ├── signup/
│   │       │   └── page.tsx
│   │       ├── login/
│   │       │   └── page.tsx
│   │       ├── verify/
│   │       │   └── page.tsx
│   │       └── forgot-password/
│   │           └── page.tsx
│   │
│   └── api/                      # API Routes (Backend)
│       ├── health/
│       │   └── route.ts          # Health check endpoint
│       ├── auth/
│       │   ├── signup/route.ts
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   ├── verify-email/route.ts
│       │   ├── refresh-token/route.ts
│       │   └── forgot-password/route.ts
│       ├── invoices/
│       │   ├── extract/route.ts  # Gemini extraction
│       │   ├── review/route.ts   # Save corrections
│       │   ├── validate/route.ts # KoSIT validation
│       │   ├── convert/route.ts  # Format conversion
│       │   └── history/route.ts  # Get conversion history
│       ├── user/
│       │   ├── profile/route.ts
│       │   └── credits/route.ts
│       └── payments/
│           ├── create-checkout/route.ts
│           ├── webhook/route.ts  # Stripe webhook
│           └── history/route.ts
│
├── components/                   # Reusable Components
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── form.tsx
│   │   ├── dialog.tsx
│   │   ├── alert.tsx
│   │   ├── select.tsx
│   │   └── ... (other shadcn components)
│   │
│   ├── forms/                    # Form components
│   │   ├── LoginForm.tsx
│   │   ├── SignupForm.tsx
│   │   ├── ProfileForm.tsx
│   │   └── InvoiceReviewForm.tsx
│   │
│   ├── features/                 # Feature-specific components
│   │   ├── converter/
│   │   │   ├── FileUploader.tsx
│   │   │   ├── DataExtractedView.tsx
│   │   │   ├── ValidationView.tsx
│   │   │   └── ConversionResult.tsx
│   │   ├── dashboard/
│   │   │   ├── CreditsCard.tsx
│   │   │   ├── HistoryTable.tsx
│   │   │   ├── StatisticsCard.tsx
│   │   │   └── QuickActions.tsx
│   │   └── auth/
│   │       ├── ProtectedRoute.tsx
│   │       └── AuthGuard.tsx
│   │
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Sidebar.tsx
│   │   └── LanguageSwitcher.tsx
│   │
│   └── common/
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       ├── NotFound.tsx
│       └── MaintenanceMode.tsx
│
├── lib/                          # Utilities & Helpers
│   ├── supabase.ts               # Supabase client initialization
│   ├── supabase.server.ts        # Server-side Supabase client
│   ├── gemini.ts                 # Gemini API wrapper
│   ├── validator.ts              # KoSIT validator integration
│   ├── stripe.ts                 # Stripe client initialization
│   ├── paypal.ts                 # PayPal API wrapper
│   ├── email.ts                  # SendGrid email wrapper
│   ├── utils.ts                  # General utilities
│   ├── constants.ts              # App constants
│   ├── errors.ts                 # Custom error classes
│   └── logger.ts                 # Logging utility
│
├── hooks/                        # Custom React Hooks
│   ├── useAuth.ts                # Authentication hook
│   ├── useUser.ts                # Current user data
│   ├── useCredits.ts             # User credits
│   ├── useInvoiceConversion.ts  # Conversion process
│   ├── useForm.ts                # Form handling
│   ├── useLocalStorage.ts        # Local storage wrapper
│   └── usePagination.ts          # Pagination logic
│
├── services/                     # Business Logic Services
│   ├── auth.service.ts           # Auth operations
│   ├── invoice.service.ts        # Invoice processing
│   │   ├── extraction.ts         # Data extraction logic
│   │   ├── validation.ts         # Validation logic
│   │   └── conversion.ts         # Format conversion logic
│   ├── payment.service.ts        # Payment operations
│   ├── credit.service.ts         # Credit management
│   ├── user.service.ts           # User operations
│   └── email.service.ts          # Email operations
│
├── types/                        # TypeScript Type Definitions
│   ├── index.ts                  # Main type exports
│   ├── auth.types.ts             # Auth types
│   ├── invoice.types.ts          # Invoice types
│   │   ├── extracted-data.ts     # Gemini extraction output
│   │   └── validation-result.ts  # Validator output
│   ├── payment.types.ts          # Payment types
│   ├── user.types.ts             # User types
│   └── api.types.ts              # API request/response types
│
├── styles/                       # Global Styles
│   ├── globals.css               # Global Tailwind styles
│   ├── variables.css             # CSS variables
│   └── animations.css            # Custom animations
│
├── messages/                     # i18n Translation Files
│   ├── en.json                   # English translations
│   └── de.json                   # German translations
│
├── public/                       # Static Assets
│   ├── images/
│   │   ├── logo.svg
│   │   ├── favicon.ico
│   │   └── ... (other images)
│   ├── documents/
│   │   ├── terms-en.pdf
│   │   └── terms-de.pdf
│   └── ... (other static files)
│
├── middleware.ts                 # Next.js middleware
├── instrumentation.ts            # Observability/monitoring setup
│
├── docs/                         # Documentation
│   ├── 01-REQUIREMENTS.md        # This document
│   ├── 02-ARCHITECTURE.md        # Architecture (this file)
│   ├── 03-DATABASE-SCHEMA.md
│   ├── 04-API-SPECIFICATION.md
│   ├── 05-DEPLOYMENT-GUIDE.md
│   ├── 06-DEVELOPMENT-GUIDE.md
│   └── 07-TESTING-GUIDE.md
│
├── tests/                        # Test Files
│   ├── unit/
│   │   ├── services/
│   │   ├── utils/
│   │   └── hooks/
│   ├── integration/
│   │   ├── auth/
│   │   └── invoices/
│   └── e2e/
│       ├── converter.spec.ts
│       └── auth.spec.ts
│
├── scripts/                      # Build/deployment scripts
│   ├── setup-db.ts               # Database initialization
│   ├── seed-data.ts              # Seed test data
│   └── validate-env.ts           # Environment validation
│
└── .github/
    └── workflows/
        ├── ci.yml                # CI pipeline
        └── deploy.yml            # Deployment pipeline
```

---

## 4. Component Architecture

### 4.1 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER BROWSER                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React Components (Client-side)                        │ │
│  │  - FileUploader                                        │ │
│  │  - InvoiceReviewForm                                   │ │
│  │  - ValidationView                                      │ │
│  │  - ConversionResult                                    │ │
│  └────────────┬─────────────────────────────────────────┘ │
│               │                                             │
│  ┌────────────▼─────────────────────────────────────────┐ │
│  │  Hooks & State Management (TanStack Query + Zustand) │ │
│  │  - useAuth()                                          │ │
│  │  - useInvoiceConversion()                             │ │
│  │  - useCredits()                                       │ │
│  └────────────┬─────────────────────────────────────────┘ │
│               │                                             │
│  ┌────────────▼─────────────────────────────────────────┐ │
│  │  API Client (Axios with interceptors)                 │ │
│  │  - Error handling                                      │ │
│  │  - Token management                                    │ │
│  │  - Request/response transformation                     │ │
│  └────────────┬─────────────────────────────────────────┘ │
└───────────────┼──────────────────────────────────────────────┘
                │
    HTTPS (TLS 1.3)
                │
┌───────────────▼──────────────────────────────────────────────┐
│              NEXT.JS API ROUTES (Backend)                    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Route Handlers (API Endpoints)                       │   │
│  │  - /api/invoices/extract                              │   │
│  │  - /api/invoices/validate                             │   │
│  │  - /api/invoices/convert                              │   │
│  │  - /api/auth/*                                        │   │
│  │  - /api/payments/*                                    │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────▼─────────────────────────────────────┐   │
│  │  Services (Business Logic)                           │   │
│  │  - InvoiceService.extract()                           │   │
│  │  - InvoiceService.validate()                          │   │
│  │  - InvoiceService.convert()                           │   │
│  │  - PaymentService.processPayment()                    │   │
│  │  - AuthService.login()                                │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────▼─────────────────────────────────────┐   │
│  │  External API Integrations                           │   │
│  │  - Gemini API (data extraction)                        │   │
│  │  - KoSIT Validator (validation)                        │   │
│  │  - Stripe API (payments)                              │   │
│  │  - SendGrid API (emails)                              │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                           │
│  ┌────────────────▼─────────────────────────────────────┐   │
│  │  Database Operations (Supabase)                       │   │
│  │  - Supabase Client (for queries)                       │   │
│  │  - Transaction management                             │   │
│  │  - Data validation                                    │   │
│  └────────────────┬─────────────────────────────────────┘   │
└────────────────┼──────────────────────────────────────────────┘
                 │
    HTTPS (TLS 1.3)
                 │
┌────────────────▼──────────────────────────────────────────────┐
│              EXTERNAL SERVICES                                │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  Supabase        │  │  Google Gemini   │                 │
│  │  (PostgreSQL)    │  │  API             │                 │
│  │  - Users         │  │  (Vision/Text)   │                 │
│  │  - Credits       │  │                  │                 │
│  │  - Conversions   │  │                  │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  Stripe/PayPal   │  │  KoSIT Validator │                 │
│  │  (Payments)      │  │  (Validation)    │                 │
│  │                  │  │                  │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                               │
│  ┌──────────────────┐                                        │
│  │  SendGrid        │                                        │
│  │  (Email)         │                                        │
│  └──────────────────┘                                        │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. Database Architecture

### 5.1 Database Schema (Simplified)

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  address_street VARCHAR(255),
  address_postal_code VARCHAR(10),
  address_city VARCHAR(100),
  address_country VARCHAR(2),
  phone VARCHAR(20),
  tax_id VARCHAR(50),
  language VARCHAR(2) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- User Credits Table
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  available_credits INT DEFAULT 0,
  used_credits INT DEFAULT 0,
  credits_expiry_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Invoice Extractions Table
CREATE TABLE invoice_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  extraction_data JSONB NOT NULL, -- Extracted invoice data
  confidence_score FLOAT,
  status VARCHAR(50) DEFAULT 'extracted',
  -- Statuses: extracted, reviewed, validated, converted, failed
  gemini_response_time_ms INT,
  created_at TIMESTAMP DEFAULT now()
);

-- Invoice Conversions Table
CREATE TABLE invoice_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  extraction_id UUID REFERENCES invoice_extractions(id),
  invoice_number VARCHAR(100),
  buyer_name VARCHAR(255),
  conversion_format VARCHAR(10), -- 'CII' or 'UBL'
  validation_status VARCHAR(50), -- 'valid', 'invalid', 'warning'
  validation_errors JSONB,
  conversion_status VARCHAR(50), -- 'success', 'failed'
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP,
  email_recipient VARCHAR(255),
  file_download_triggered BOOLEAN DEFAULT false,
  download_triggered_at TIMESTAMP,
  credits_used INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT now()
);
-- Note: File content NOT stored, only metadata
-- File is generated → downloaded + emailed → deleted from memory

-- Payment Transactions Table
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(255),
  paypal_transaction_id VARCHAR(255),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'EUR',
  credits_purchased INT,
  payment_method VARCHAR(50), -- 'stripe_card', 'paypal'
  payment_status VARCHAR(50), -- 'pending', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT now()
);

-- Audit Logs Table (GDPR compliance)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_invoice_extractions_user_id ON invoice_extractions(user_id);
CREATE INDEX idx_invoice_conversions_user_id ON invoice_conversions(user_id);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

## 6. Authentication Flow

```
1. User accesses website
   ↓
2. Check token in localStorage
   ├─ Token exists + valid → Load dashboard
   └─ Token missing/invalid → Load login page
   ↓
3. User enters credentials
   ↓
4. POST /api/auth/login
   ├─ Validate email/password with Supabase Auth
   ├─ Generate JWT token
   ├─ Store token in localStorage
   └─ Return user data
   ↓
5. Token stored in Authorization header for all API requests
   ↓
6. API middleware validates token on each request
   ├─ Valid → Process request
   └─ Invalid → Return 401, redirect to login
   ↓
7. Token refresh logic
   ├─ Check token expiry (1 hour)
   ├─ If expired, use refresh token to get new token
   └─ Transparent to user
```

---

## 7. Invoice Conversion Flow

```
START
  │
  ├─▶ User uploads PDF/JPG/PNG
  │      │
  │      ├─ File validation (size, format)
  │      ├─ Temporary file creation
  │      └─ Upload to Node.js temporary storage
  │
  ├─▶ Step 1: EXTRACTION (POST /api/invoices/extract)
  │      │
  │      ├─ Convert PDF to images (if needed)
  │      ├─ Call Gemini Vision API with structured prompt
  │      │   └─ Prompt ensures JSON output matching our schema
  │      │
  │      ├─ Gemini returns extracted data:
  │      │   {
  │      │     "invoice_number": "...",
  │      │     "seller": {...},
  │      │     "buyer": {...},
  │      │     "line_items": [...],
  │      │     ...
  │      │   }
  │      │
  │      ├─ Store extraction in DB with status='extracted'
  │      ├─ Calculate confidence score
  │      └─ Return to frontend
  │
  ├─▶ Step 2: REVIEW (User reviews extracted data)
  │      │
  │      ├─ Display extracted data in editable form fields
  │      ├─ Show original PDF side-by-side
  │      ├─ User can correct any field
  │      │
  │      └─ User clicks "Confirm and Validate"
  │             │
  │             └─ POST /api/invoices/review (save corrections)
  │                └─ Update extraction record with corrections
  │
  ├─▶ Step 3: VALIDATION (POST /api/invoices/validate)
  │      │
  │      ├─ Build XML/CII from extracted data
  │      ├─ Call KoSIT Validator (local JAR)
  │      ├─ Validator checks against XRechnung 3.0 schema
  │      │
  │      └─ Validator returns:
  │          {
  │            "valid": true/false,
  │            "errors": [...],
  │            "warnings": [...]
  │          }
  │
  │      ├─ If VALID → Continue to conversion
  │      └─ If INVALID → Show errors to user, allow correction
  │             │
  │             └─ User corrects and re-validates
  │
  ├─▶ Step 4: CONVERSION (POST /api/invoices/convert)
  │      │
  │      ├─ User selects format (CII or UBL)
  │      ├─ System transforms data to selected format
  │      ├─ Generate XML file
  │      ├─ Deduct 1 credit from user account
  │      ├─ Save conversion record to DB
  │      │
  │      └─ Create signed download URL (24h expiry)
  │
  ├─▶ Step 5: DOWNLOAD & NOTIFICATION
  │      │
  │      ├─ Return download URL to frontend
  │      ├─ Trigger automatic download (or manual)
  │      ├─ Send confirmation email
  │      └─ Show success message
  │
  ├─▶ Step 6: CLEANUP
  │      │
  │      ├─ Delete temporary PDF file
  │      └─ Delete temporary images
  │
  └─▶ END (Conversion complete)

ERROR HANDLING:
  ├─ File upload fails → Show error, allow retry
  ├─ Gemini extraction fails → Fallback to manual entry
  ├─ Validation fails → Show specific errors
  ├─ Credit deduction fails → Rollback conversion
  └─ Download link expires → Regenerate or convert again
```

---

## 8. Security Architecture (MVP - Simplified)

### 8.1 Security Layers (MVP Phase)

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Network Security                              │
│  ├─ HTTPS/TLS 1.3 (all connections)                     │
│  ├─ HSTS headers (force HTTPS)                          │
│  └─ CSP (Content Security Policy)                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Application Security                          │
│  ├─ Input validation (Zod schemas)                      │
│  ├─ CORS policy (restrict origins)                      │
│  └─ CSRF protection (tokens)                            │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Authentication                                │
│  ├─ JWT tokens (1 hour access, 7 days refresh)         │
│  ├─ Secure password hashing (bcrypt)                    │
│  ├─ Email verification required                         │
│  └─ Basic logout functionality                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LAYER 4: Data Security                                 │
│  ├─ Encryption at rest (Supabase)                       │
│  ├─ Encryption in transit (TLS)                         │
│  ├─ No sensitive data storage                           │
│  ├─ PII is minimal (only required fields)               │
│  └─ Temporary files deleted immediately                 │
└─────────────────────────────────────────────────────────┘
```

**Note:** Advanced security features (Device Fingerprinting, Token Rotation, Rate Limiting, Suspicious Activity Detection) will be added in Phase 2 based on production metrics and real-world usage patterns.

### 8.2 Sensitive Data Handling

```
✅ SAFE: Minimal data stored
├─ User name, email, phone, address
├─ Tax ID (masked in logs)
├─ Payment history (amount, date, method - NOT card details)
└─ Credit balance & usage

❌ NEVER STORED:
├─ Full invoice content
├─ Bank account details (IBAN/BIC) from invoices
├─ Credit card details (Stripe/PayPal handles)
├─ Line items details from invoices
├─ Seller bank information
└─ Invoice PDF files (deleted after processing)

🔐 ENCRYPTED:
├─ All data in database (Supabase encryption)
├─ All data in transit (HTTPS)
├─ Sensitive log data is masked
└─ Temporary files are deleted immediately
```

---

## 9. Performance Architecture

### 9.1 Performance Optimization Strategy

```
FRONTEND OPTIMIZATION:
├─ Code Splitting (Next.js automatic)
├─ Image optimization (Next.js Image component)
├─ Lazy loading (React Suspense)
├─ Caching (Service Workers for offline assets)
├─ Minification (Next.js production build)
└─ CDN delivery (Vercel Edge Network)

BACKEND OPTIMIZATION:
├─ Database indexing (on user_id, email, created_at)
├─ Query optimization (avoid N+1 queries)
├─ Caching strategy (Redis for session data)
├─ Connection pooling (Supabase default)
├─ Async processing (for long-running tasks)
└─ Request timeout management

API OPTIMIZATION:
├─ Pagination (limit 50 records per request)
├─ Compression (gzip)
├─ Caching headers (Cache-Control)
├─ Request deduplication (TanStack Query)
├─ Error recovery (automatic retry with exponential backoff)
└─ Rate limiting (prevent abuse)

FILE PROCESSING:
├─ Streaming file uploads (chunked)
├─ Temporary file cleanup (immediate deletion)
├─ Memory efficient PDF processing
└─ Gemini API async calls
```

### 9.2 Performance Targets

| Metric | Requirement |
|--------|-------------|
| Access Token Expiry | 1 hour (short-lived, high security) |
| Refresh Token Expiry | 7 days (seamless user experience) |
| Token Format | JWT (JSON Web Token) |
| Token Storage (Frontend) | access_token in memory, refresh_token in httpOnly cookie |
| Token Validation | On every API request |
| Automatic Refresh | Transparent to user when access_token expires |
| User Impact | No logout for 7 days if actively using app |
| First Input Delay (FID) | <100ms | Chrome DevTools |
| Cumulative Layout Shift (CLS) | <0.1 | Lighthouse |
| Time to First Byte (TTFB) | <200ms | Vercel Analytics |
| Invoice Processing | 5-7 seconds | Custom timer |
| Gemini API latency | <3 seconds | API timing |
| Database query | <100ms (p95) | Supabase Analytics |
| API response | <500ms (p95) | Vercel Analytics |

---

## 10. Scalability Architecture

### 10.1 Horizontal Scalability

```
Stateless Design:
├─ No server-side sessions (JWT tokens)
├─ No in-memory caches (Redis for future)
├─ No file storage (all temporary)
└─ Auto-scaling friendly

Database Scalability:
├─ Read replicas (future enhancement)
├─ Connection pooling (Supabase handles)
├─ Partitioning by date (for large tables)
└─ Archive old data (10+ years → archive)

API Scalability:
├─ Vercel auto-scaling (serverless)
├─ Load balancing (automatic)
├─ Rate limiting per user
└─ Queue system for bulk operations (future)
```

### 10.2 Expected Growth

```
Phase 1 (MVP - Month 1):
├─ Users: 0-100
├─ Daily conversions: 0-500
├─ Concurrent users: 5-20
├─ Database storage: <1GB
└─ Infrastructure: Hobby tier sufficient

Phase 2 (3 months):
├─ Users: 100-1000
├─ Daily conversions: 500-2000
├─ Concurrent users: 20-100
├─ Database storage: 5-10GB
└─ Infrastructure: Pro tier

Phase 3 (6+ months):
├─ Users: 1000+
├─ Daily conversions: 2000+
├─ Concurrent users: 100+
├─ Database storage: 10-50GB
└─ Infrastructure: Enterprise setup (read replicas, Redis)
```

---

## 11. Deployment Architecture

### 11.1 Deployment Pipeline

```
Developer commits code to main branch
        ↓
GitHub Actions CI Pipeline triggers:
├─ Run linting (ESLint)
├─ Run tests (Vitest, React Testing Library)
├─ Build project (Next.js build)
├─ Upload to Vercel (staging environment)
├─ Run E2E tests (Playwright)
└─ Report results
        ↓
If all checks pass → Auto-deploy to production
        ├─ Vercel Blue/Green deployment
        ├─ Health checks on new instance
        ├─ Gradual traffic shift (95% old, 5% new)
        ├─ Monitor error rates
        └─ Full rollout or automatic rollback
        ↓
Post-deployment:
├─ Database migrations (if any)
├─ Cache warming (optional)
├─ Monitoring & alerting enabled
└─ Team notification sent
```

### 11.2 Environments

```
DEVELOPMENT (Local)
├─ Node: Latest LTS
├─ Database: Supabase (shared dev instance)
├─ Environment: .env.local
└─ Secrets: .env.local (not in git)

STAGING (Vercel Preview)
├─ Branch: develop
├─ Database: Supabase staging
├─ Environment: Same as production
├─ External APIs: Real (limited quota)
└─ Testing: Full QA suite

PRODUCTION (Vercel)
├─ Branch: main
├─ Database: Supabase production
├─ Environment: .env.production
├─ External APIs: Real
├─ Monitoring: Full observability
└─ SLA: 99.5% uptime target
```

---

## 12. Monitoring & Observability

### 12.1 Monitoring Stack

```
┌──────────────────────────────────┐
│  Error Tracking: Sentry          │
│  ├─ Exception tracking           │
│  ├─ Stack traces                 │
│  ├─ User context                 │
│  └─ Release tracking             │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│  Performance Monitoring:          │
│  ├─ Vercel Analytics             │
│  ├─ Web Vitals                   │
│  ├─ API latency                  │
│  └─ Database performance         │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│  Uptime Monitoring: Betterstack  │
│  ├─ Endpoint health checks       │
│  ├─ Database connectivity        │
│  ├─ External API health          │
│  └─ Alerts & notifications       │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│  Analytics: PostHog              │
│  ├─ User behavior                │
│  ├─ Feature usage                │
│  ├─ Conversion funnels           │
│  └─ Cohort analysis              │
└──────────────────────────────────┘
```

### 12.2 Key Metrics to Monitor

```
APPLICATION HEALTH:
├─ Error rate (target: <0.1%)
├─ API response time (target: <500ms p95)
├─ Database query time (target: <100ms p95)
├─ Uptime (target: 99.5%)
└─ Crash rate (target: 0%)

BUSINESS METRICS:
├─ Conversions per day
├─ Revenue per day
├─ Credits purchased
├─ User retention (D7, D30)
├─ Customer acquisition cost (CAC)
└─ Lifetime value (LTV)

USER EXPERIENCE:
├─ Page load time (target: <2s)
├─ Invoice processing time (target: 5-7s)
├─ Form submission time
├─ File upload success rate
└─ Validation pass rate

INFRASTRUCTURE:
├─ CPU usage
├─ Memory usage
├─ Database connections
├─ API rate limit usage
└─ Cost tracking
```

---

## 13. Code Quality Standards

### 13.1 Coding Conventions

```
NAMING:
├─ Classes: PascalCase (e.g., InvoiceService)
├─ Functions: camelCase (e.g., extractInvoiceData)
├─ Constants: UPPER_SNAKE_CASE (e.g., MAX_FILE_SIZE)
├─ Files: kebab-case (e.g., invoice-service.ts)
├─ Components: PascalCase (e.g., FileUploader.tsx)
└─ Types: PascalCase with suffix (e.g., InvoiceDataType)

STRUCTURE:
├─ One component per file
├─ Imports organized (React → Libraries → Local)
├─ Props interface defined above component
├─ Comments for complex logic
└─ Exports at bottom of file

TYPE SAFETY:
├─ Strict TypeScript mode enabled
├─ No implicit any
├─ All props typed
├─ All API responses typed
└─ Error types defined

ERROR HANDLING:
├─ Try-catch for async operations
├─ Custom error classes
├─ User-friendly error messages
├─ Error logging for debugging
└─ Retry logic for transient errors
```

### 13.2 Testing Requirements

```
UNIT TESTS (80% coverage):
├─ Services (invoice, auth, payment)
├─ Utils & helpers
├─ Hooks
└─ Complex business logic

INTEGRATION TESTS:
├─ Auth flow (signup, login, logout)
├─ Invoice conversion flow
├─ Payment flow
└─ Database operations

E2E TESTS (Critical paths):
├─ User signup → conversion → download
├─ User login → purchase credits → convert
├─ Payment completion & credit addition
└─ Invoice validation flow

PERFORMANCE TESTS:
├─ Invoice processing speed
├─ API response times
├─ Database query performance
└─ Frontend render performance
```

---

## 14. Deployment Checklist

- [ ] All tests passing
- [ ] Code review approved
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Secrets properly stored
- [ ] SSL/TLS certificates valid
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Monitoring configured
- [ ] Backup systems ready
- [ ] Rollback plan documented
- [ ] Team notified

---

## 15. Future Enhancements (Post-MVP)

```
PHASE 2:
├─ Admin dashboard
├─ Advanced analytics
├─ Batch processing
├─ API for integrations
├─ Invoice templates
└─ Enhanced OCR support

PHASE 3:
├─ Mobile apps (iOS, Android)
├─ Desktop app (Electron)
├─ Advanced search
├─ Custom workflows
├─ Team collaboration
└─ Multi-language support (more languages)

PHASE 4:
├─ Machine learning (auto-categorization)
├─ Integration marketplace
├─ Advanced reporting
├─ White-label solution
└─ Enterprise features
```

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-30  
**Status:** Ready for implementation
