# Invoice2E Technical Documentation
## AI-Powered Invoice to XRechnung Converter

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Language** | TypeScript |
| **Framework** | Next.js 14 |

---

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## Documentation Index

### 01 - Product Documentation

| Document | Description |
|----------|-------------|
| [PRD](./01-product/01-prd.md) | Product requirements, features, roadmap |
| [UX Design](./01-product/02-ux-design.md) | Design system, components, user flows |

### 02 - Architecture Documentation

| Document | Description |
|----------|-------------|
| [Software Architecture](./02-architecture/01-software-architecture.md) | System overview, layers, patterns |
| [Technical Design](./02-architecture/02-technical-design.md) | Implementation details, types, services |
| [Database](./02-architecture/03-database.md) | Schema, tables, RLS policies |

### 03 - Development Documentation

| Document | Description |
|----------|-------------|
| [Source Code](./03-development/01-source-code.md) | Codebase structure, modules |
| [API Reference](./03-development/02-api-reference.md) | REST API endpoints |
| [Quality Assurance](./03-development/03-quality-assurance.md) | Testing strategy, coverage |

### 04 - Operations Documentation

| Document | Description |
|----------|-------------|
| [Deployment](./04-operations/01-deployment.md) | Vercel, Supabase, environments |
| [Operations](./04-operations/02-operations-maintenance.md) | Monitoring, backups, incidents |
| [Security](./04-operations/03-security-compliance.md) | Authentication, GDPR, XRechnung |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  Next.js App Router • React Components • Tailwind CSS   │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                      API LAYER                           │
│      REST Endpoints • Validation • Error Handling        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                          │
│   AI Extractors • XRechnung • UBL • Payments • Email    │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                            │
│        Supabase PostgreSQL • RLS • Migrations           │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

- **AI Invoice Extraction**: Gemini/DeepSeek Vision API
- **XRechnung 3.0 Generation**: EN16931 CII format
- **UBL 2.1 Support**: OASIS standard
- **Bulk Processing**: Up to 100 PDFs from ZIP
- **Credit System**: Pay-per-use with packages
- **Multi-language**: English & German

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Next.js API Routes, TypeScript |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini, DeepSeek |
| Payments | Stripe, PayPal |
| Hosting | Vercel |

---

## Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=

# Optional
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=

# Phase 4
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
SENDGRID_API_KEY=
```

---

## Project Structure

```
Invoice2E.1/
├── app/                   # Next.js App Router
│   ├── [locale]/          # Internationalized pages
│   └── api/               # REST API endpoints
├── components/            # React components
├── services/              # Business logic
├── lib/                   # Utilities
├── types/                 # TypeScript types
├── db/migrations/         # SQL migrations
├── messages/              # i18n translations
├── tests/                 # Test files
└── docs/                  # This documentation
```

---

## Contributing

1. Fork the repository
2. Create feature branch
3. Run tests: `npm test`
4. Submit pull request

---

## License

Proprietary - All rights reserved
