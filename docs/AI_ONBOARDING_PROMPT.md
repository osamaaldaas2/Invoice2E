# Invoice2E - AI Assistant Onboarding Prompt

Use this prompt to onboard a new AI assistant to the Invoice2E project.

---

## Project Overview

**Invoice2E** is a SaaS web application that converts PDF invoices to XRechnung/ZUGFeRD format (German e-invoicing standards). Users upload PDF invoices, the system extracts data using AI (Google Gemini), and generates compliant XML files.

### Business Model
- Credit-based system: Users buy credit packages to convert invoices
- 1 credit = 1 invoice conversion
- Payment via Stripe and PayPal
- Admin dashboard for user/transaction management

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Custom JWT sessions (not Supabase Auth) |
| Payments | Stripe, PayPal |
| AI/OCR | Google Gemini API |
| Styling | Tailwind CSS |
| Validation | Zod |
| i18n | next-intl (German/English) |

---

## Project Structure

```
Invoice2E.1/
├── app/
│   ├── [locale]/              # Internationalized pages (de/en)
│   │   ├── (auth)/            # Login, signup, forgot-password
│   │   ├── admin/             # Admin dashboard pages
│   │   ├── dashboard/         # User dashboard
│   │   ├── upload/            # Invoice upload flow
│   │   ├── review/            # Review extracted data
│   │   ├── convert/           # Conversion process
│   │   ├── pricing/           # Credit packages
│   │   └── checkout/          # Payment flow
│   └── api/
│       ├── auth/              # Login, signup, logout, me
│       ├── admin/             # Admin-only endpoints
│       ├── invoices/          # Invoice CRUD
│       ├── payments/          # Stripe/PayPal webhooks
│       └── files/             # File upload/download
├── components/
│   ├── admin/                 # Admin UI components
│   ├── dashboard/             # User dashboard components
│   ├── forms/                 # Form components
│   ├── layout/                # Header, Footer, layouts
│   └── payment/               # Payment UI
├── services/
│   ├── admin/                 # Admin business logic
│   ├── ai/                    # Gemini integration
│   ├── auth.service.ts        # Authentication
│   ├── credits.db.service.ts  # Credit management
│   ├── stripe.service.ts      # Stripe integration
│   ├── paypal.service.ts      # PayPal integration
│   ├── xrechnung.service.ts   # XML generation
│   └── gemini.service.ts      # AI extraction
├── adapters/                  # External API adapters
├── lib/
│   ├── session.ts             # JWT session management
│   ├── authorization.ts       # Role-based access control
│   ├── supabase.server.ts     # Supabase client
│   └── logger.ts              # Winston logger
├── db/migrations/             # SQL migrations
├── types/                     # TypeScript types
└── messages/                  # i18n translations (de.json, en.json)
```

---

## Database Schema (Supabase/PostgreSQL)

### Core Tables

```sql
-- Users (extends Supabase auth.users)
users (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE,
    password_hash VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    role user_role DEFAULT 'user',  -- 'user' | 'admin' | 'super_admin'
    is_banned BOOLEAN DEFAULT FALSE,
    banned_at TIMESTAMP,
    banned_reason TEXT,
    last_login_at TIMESTAMP,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- User Credits
user_credits (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    available_credits INTEGER DEFAULT 0,
    used_credits INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Credit Packages (purchasable)
credit_packages (
    id UUID PRIMARY KEY,
    name VARCHAR,
    description TEXT,
    credits INTEGER,
    price DECIMAL,
    currency VARCHAR DEFAULT 'EUR',
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Payment Transactions
payment_transactions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    package_id UUID REFERENCES credit_packages(id),
    stripe_payment_id VARCHAR,      -- Payment Intent ID (pi_...)
    paypal_order_id VARCHAR,
    amount DECIMAL,
    currency VARCHAR,
    credits_purchased INTEGER,
    payment_method VARCHAR,         -- 'stripe' | 'paypal'
    payment_status VARCHAR,         -- 'pending' | 'completed' | 'failed' | 'refunded'
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Invoice Conversions
invoice_conversions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    original_filename VARCHAR,
    original_file_path VARCHAR,
    extracted_data JSONB,
    output_format VARCHAR,          -- 'xrechnung' | 'zugferd'
    output_file_path VARCHAR,
    validation_status VARCHAR,
    validation_errors JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Credit Transactions (audit trail)
credit_transactions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    amount INTEGER,
    transaction_type VARCHAR,       -- 'credit' | 'debit'
    source VARCHAR,                 -- 'purchase' | 'conversion' | 'admin' | 'refund'
    reference_id VARCHAR,
    balance_after INTEGER,
    created_at TIMESTAMP
)

-- Admin Audit Logs
admin_audit_logs (
    id UUID PRIMARY KEY,
    admin_user_id UUID REFERENCES users(id),
    target_user_id UUID REFERENCES users(id),
    action VARCHAR,
    resource_type VARCHAR,
    resource_id VARCHAR,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP
)
```

### Key Database Functions

```sql
-- Credit operations (with row-level locking)
add_credits(user_id, amount, source, reference_id)
deduct_credits(user_id, amount, source, reference_id)
safe_deduct_credits(user_id, amount)  -- Returns boolean

-- Admin functions
is_admin(user_id) -> boolean
is_super_admin(user_id) -> boolean
admin_modify_credits(admin_id, target_user_id, amount, reason, ip, user_agent)

-- Conversion helper
convert_invoice_with_credit_deduction(user_id, invoice_id)
```

### Row Level Security (RLS)
- All tables have RLS enabled
- Users can only access their own data
- Admins bypass RLS via `is_admin()` function check
- SECURITY DEFINER functions handle privileged operations

---

## Authentication & Authorization

### Session System (lib/session.ts)
- Custom JWT-based sessions (not using Supabase Auth)
- Tokens stored in HTTP-only cookies
- Session payload includes: userId, email, firstName, lastName, role

### Authorization (lib/authorization.ts)
```typescript
// Middleware functions
requireAdmin(request)      // Throws if not admin/super_admin
requireSuperAdmin(request) // Throws if not super_admin

// Helper functions
getClientIp(request)
getUserAgent(request)
```

### Security Layers (5-layer model)
1. **Route Protection**: Middleware checks for protected routes
2. **Authentication**: Valid session required
3. **Authorization**: Role check (user/admin/super_admin)
4. **Database RLS**: Row-level security policies
5. **Audit Logging**: All admin actions logged

---

## API Endpoints

### Auth
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/me` - Get current user

### User
- `GET /api/invoices` - List user's invoices
- `POST /api/invoices/upload` - Upload PDF
- `POST /api/invoices/[id]/convert` - Convert invoice
- `GET /api/files/[id]/download` - Download converted file

### Payments
- `POST /api/payments/stripe/create-session` - Create Stripe checkout
- `POST /api/payments/stripe/webhook` - Stripe webhook
- `POST /api/payments/paypal/create-order` - Create PayPal order
- `POST /api/payments/paypal/capture` - Capture PayPal payment

### Admin (all require admin role)
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/[id]` - User detail
- `POST /api/admin/users/[id]/ban` - Ban/unban user
- `POST /api/admin/users/[id]/credits` - Modify credits
- `GET /api/admin/transactions` - All transactions
- `POST /api/admin/transactions/[id]/refund` - Refund (super_admin only)
- `GET/POST /api/admin/packages` - Package management
- `PUT/DELETE /api/admin/packages/[id]` - Update/delete package
- `GET /api/admin/audit-logs` - View audit logs

---

## Current Implementation Status

### ✅ Completed
- [x] Project setup (Next.js 14, TypeScript, Tailwind)
- [x] Database schema and migrations (001-012)
- [x] User authentication (login, signup, sessions)
- [x] Credit system (purchase, deduction, balance)
- [x] Stripe integration (checkout, webhooks, refunds)
- [x] PayPal integration (orders, capture)
- [x] Admin dashboard backend (all API routes)
- [x] Admin services (users, transactions, stats, audit)
- [x] Role-based authorization
- [x] Security fixes (RLS policies, function search paths)
- [x] Gemini AI integration for PDF extraction
- [x] XRechnung XML generation

### 🔄 In Progress / Needs Testing
- [ ] Admin dashboard frontend pages
- [ ] Invoice upload and conversion flow
- [ ] Email notifications
- [ ] Batch processing

### 📋 Pending
- [ ] User dashboard UI
- [ ] Invoice review/edit UI
- [ ] Template management
- [ ] Analytics and reporting
- [ ] Rate limiting
- [ ] Production deployment

---

## Key Files to Read First

1. **Database Schema**: `db/migrations/009_admin_system.sql`
2. **Auth System**: `lib/session.ts`, `services/auth.service.ts`
3. **Authorization**: `lib/authorization.ts`
4. **Types**: `types/index.ts`, `types/admin.ts`
5. **Admin Services**: `services/admin/index.ts`
6. **Payment Flow**: `services/stripe.service.ts`, `adapters/stripe.adapter.ts`

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Session
SESSION_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# PayPal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=

# Google Gemini
GEMINI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

---

## Coding Conventions

1. **Services**: Business logic in `services/`, return typed objects
2. **Adapters**: External API calls in `adapters/`, handle raw HTTP
3. **API Routes**: Thin controllers, delegate to services
4. **Error Handling**: Use custom error classes (AppError, NotFoundError)
5. **Logging**: Use `logger` from `lib/logger.ts`
6. **Validation**: Use Zod schemas for request validation
7. **Database**: Use Supabase client, respect RLS policies

---

## Common Tasks

### Add a new API endpoint
1. Create route file in `app/api/`
2. Add Zod validation schema
3. Use `requireAdmin()` if admin-only
4. Call service methods
5. Return JSON response

### Add a new database table
1. Create migration in `db/migrations/`
2. Add RLS policies
3. Create TypeScript types
4. Create service file

### Add admin functionality
1. Add to `services/admin/`
2. Create API route in `app/api/admin/`
3. Add to audit logging
4. Create frontend page in `app/[locale]/admin/`

---

## Questions to Ask Before Starting

1. What specific feature or bug are we working on?
2. Should changes be made to frontend, backend, or both?
3. Are there any new database tables needed?
4. What role permissions are required?
5. Should actions be logged in audit trail?
