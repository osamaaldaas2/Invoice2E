# Deployment & Infrastructure Documentation
## Invoice2E - Production Deployment

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Platform** | Vercel |
| **Database** | Supabase (PostgreSQL) |

---

## 1. Infrastructure Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                           VERCEL                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Edge Network                             │  │
│  │  • Global CDN (300+ locations)                                │  │
│  │  • Static asset caching                                       │  │
│  │  • SSL/TLS termination                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Serverless Functions                        │  │
│  │  • API routes (/api/*)                                        │  │
│  │  • SSR pages                                                  │  │
│  │  • Auto-scaling (0 → N)                                       │  │
│  │  • 60s max execution                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
        ┌───────────────────┐      ┌───────────────────┐
        │     SUPABASE      │      │   EXTERNAL APIs   │
        │  • PostgreSQL     │      │  • Gemini         │
        │  • Auth           │      │  • DeepSeek       │
        │  • Storage        │      │  • Stripe         │
        │  • Edge Functions │      │  • PayPal         │
        └───────────────────┘      │  • SendGrid       │
                                   └───────────────────┘
```

---

## 2. Environment Configuration

### 2.1 Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role |
| `GEMINI_API_KEY` | Yes | Google Gemini API |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek API |
| `AI_PROVIDER` | Optional | `gemini` or `deepseek` |
| `STRIPE_SECRET_KEY` | Phase 4 | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Phase 4 | Stripe webhook |
| `PAYPAL_CLIENT_ID` | Phase 4 | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | Phase 4 | PayPal secret |
| `SENDGRID_API_KEY` | Phase 4 | SendGrid API |

### 2.2 Environment Files

```
.env.local          # Local development (not committed)
.env.development    # Development defaults
.env.production     # Production defaults
```

---

## 3. Deployment Process

### 3.1 Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### 3.2 Git Integration

```
main branch    → Production
develop branch → Preview/Staging
```

**Automatic Deployments:**
1. Push to `main` → Production deploy
2. Push to any branch → Preview deploy
3. Pull request → Preview with comment

### 3.3 Build Configuration

**File:** [next.config.js](file:///c:/Users/osama/Desktop/Invoice2E.1/next.config.js)

```javascript
const withNextIntl = require('next-intl/plugin')('./i18n.config.ts');

const nextConfig = {
    reactStrictMode: true,
    pageExtensions: ['ts', 'tsx'],
    swcMinify: true,
    experimental: {
        optimizePackageImports: ['@/lib', '@/components'],
    },
};

module.exports = withNextIntl(nextConfig);
```

---

## 4. Database Setup

### 4.1 Supabase Project Setup

1. Create project at [supabase.com](https://supabase.com)
2. Select region (EU for data residency)
3. Copy connection credentials

### 4.2 Run Migrations

```bash
# Option 1: Supabase CLI
supabase db push

# Option 2: SQL Editor
# Copy content from db/migrations/*.sql
```

### 4.3 Enable RLS

All migrations include RLS policies. Verify:

```sql
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';
```

---

## 5. Build Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint check |
| `npm run type-check` | TypeScript check |

---

## 6. Scaling

### 6.1 Vercel Scaling

| Tier | Concurrent Executions | Execution Timeout |
|------|----------------------|-------------------|
| Hobby | 10 | 10s |
| Pro | 100 | 60s |
| Enterprise | Unlimited | 900s |

### 6.2 Supabase Scaling

| Tier | Database | Connections |
|------|----------|-------------|
| Free | 500MB | 60 |
| Pro | 8GB | 200 |
| Team | 32GB | 500 |

---

## 7. Monitoring

### 7.1 Vercel Analytics

- Core Web Vitals (LCP, FID, CLS)
- Page load times
- Request volume
- Error rates

### 7.2 Supabase Monitoring

- Database metrics
- API request logs
- Storage usage
- Auth events

### 7.3 Custom Logging

Structured JSON logs via `lib/logger.ts`:
```json
{"timestamp":"...","level":"INFO","message":"...","data":{}}
```

---

## 8. Security

### 8.1 SSL/TLS

- Automatic HTTPS via Vercel
- TLS 1.3 encryption
- HSTS headers

### 8.2 Environment Security

- Secrets in Vercel environment variables
- No secrets in codebase
- Separate staging/production keys

### 8.3 API Security

- JWT authentication
- Rate limiting
- Input validation

---

## Document References

| Document | Path |
|----------|------|
| Architecture | [02-architecture/01-software-architecture.md](../02-architecture/01-software-architecture.md) |
| Operations | [02-operations-maintenance.md](./02-operations-maintenance.md) |
