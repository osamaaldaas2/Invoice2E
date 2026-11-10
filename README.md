# Invoice2E

**AI-powered SaaS that turns PDF and image invoices into legally compliant EU e-invoices.**

Users upload an invoice (single file or a multi-invoice PDF batch). The app extracts all fields with an LLM, lets the user review and correct them, validates the result against the EN 16931 business rules plus country-specific rules, and generates one of 9 e-invoice formats, including XRechnung, ZUGFeRD/Factur-X and PEPPOL. It has credit-based billing, an admin backend and GDPR tooling.

🔗 Live: [invoice2-e-5o9v.vercel.app](https://invoice2-e-5o9v.vercel.app)

---

## Highlights

- **9 EU e-invoice formats** from a single canonical data model. Each format has its own generator and validation rules.
- **Multi-provider AI extraction**: Gemini, OpenAI and Mistral behind one adapter interface, with one shared prompt and one shared normalizer.
- **Batch processing**: AI detects where each invoice starts and ends in a multi-invoice PDF. The PDF is split, and a background worker processes it in chunks and tracks progress.
- **Review step**: humans check and correct the extracted data before conversion. Monetary values are cross-checked (line totals, tax, gross).
- **Credit-based billing** with Stripe and PayPal, vouchers and refunds. Payments and credit bookings run in a single atomic database transaction.
- **Security by design**: server-side sessions, field-level AES-256 encryption, Row Level Security, rate limiting and an audit log protected by a hash chain.
- **GDPR**: data export, data-deletion request queue and retention policies.
- **Admin panel**: users, credits, packages, vouchers, transactions and audit logs.
- **i18n**: German and English (next-intl).

## Supported Formats

| Format              | Standard           | Countries              | Output        |
| ------------------- | ------------------ | ---------------------- | ------------- |
| XRechnung CII       | EN 16931 / CII     | DE                     | XML           |
| XRechnung UBL       | EN 16931 / UBL     | DE                     | XML           |
| PEPPOL BIS 3.0      | PEPPOL BIS Billing | 30 EU/EEA              | XML           |
| Factur-X EN 16931   | ZUGFeRD 2.x        | FR, DE, AT, CH, LU, BE | PDF/A-3 + XML |
| Factur-X Basic      | ZUGFeRD 2.x        | FR, DE, AT, CH, LU, BE | PDF/A-3 + XML |
| FatturaPA           | FatturaPA 1.2.2    | IT                     | XML           |
| KSeF FA(2)          | KSeF               | PL                     | XML           |
| NLCIUS / SI-UBL 2.0 | Dutch CIUS         | NL                     | XML           |
| CIUS-RO             | Romanian CIUS      | RO                     | XML           |

Generated invoices are validated in CI against the official **KoSIT validator** and the XSD schemas.

## Tech Stack

| Area           | Technology                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router), React, TypeScript (strict)                                                  |
| Styling        | Tailwind CSS                                                                                         |
| Database       | Supabase / PostgreSQL with Row Level Security, 75+ SQL migrations, RPC functions                     |
| AI             | Google Gemini, OpenAI, Mistral (adapter pattern)                                                     |
| PDF / XML      | pdf-lib, unpdf, custom CII/UBL/FatturaPA/KSeF generators                                             |
| Payments       | Stripe, PayPal (webhooks + verification, idempotent)                                                 |
| Infrastructure | Vercel (cron and background worker via `after()`), Upstash Redis rate limiting                       |
| Architecture   | Dependency injection (Awilix), CASL permissions, XState, Zod validation                              |
| Observability  | Sentry, Prometheus metrics (`prom-client`), health/readiness endpoints                               |
| Testing        | Vitest (1,481 tests), Playwright E2E, PGlite database security tests                                 |
| CI/CD          | GitHub Actions (lint, type-check, test, build, KoSIT validation), CodeQL, Gitleaks, SBOM, Dependabot |

## Architecture

```
Upload ─► AI extraction ─► Normalizer ─► Review (user) ─► Validation ─► Format generator ─► Download
            │                                              │
            ├─ Gemini / OpenAI / Mistral adapters          ├─ EN 16931 business rules
            └─ Boundary detection + PDF splitter (batch)   └─ Country rules (XRechnung, PEPPOL, NLCIUS, CIUS-RO, FatturaPA, KSeF)
```

- `app/`: pages and API routes (auth, invoices, batch, payments, admin, GDPR, health, metrics)
- `adapters/`: external integrations (AI providers, Stripe, PayPal, Brevo email, Supabase)
- `services/`: business logic (extraction, batch, formats, credits, payments, review)
- `validation/`: EN 16931 and country-specific rule sets
- `lib/`: shared utilities (extraction prompt and normalizer, encryption, sessions, rate limiting)
- `db/migrations/`, `supabase/migrations/`: database schema, RLS policies and RPCs
- `tests/`, `e2e/`: unit/integration tests and Playwright E2E tests

## Recent Changes (November 2026)

**Security & stability hardening**

- Persistent **server-side sessions**, revoked on logout, password change and account ban. Password reset tokens can be used only once (consumed atomically).
- **Field-level encryption** of extracted invoice data (AES-256, key IDs for key rotation).
- Privileged `SECURITY DEFINER` RPCs locked down for `anon` and `authenticated`.
- **Unified payment booking**: webhook and verify use one locked transaction, so a replayed payment cannot credit twice.
- **Atomic batch credits**: the debit and its marker are committed together. Refunds are idempotent.
- Rate limiting no longer trusts spoofable forwarding headers. Login is rate-limited per account and per IP.
- **Background batch worker** using Next.js `after()`, a cron fallback, chunked processing and persisted progress.
- New **migration CLI** using a direct PostgreSQL connection, migration history and an advisory lock.
- RLS performance tuning (Supabase advisor warnings resolved).
- **GDPR** data-deletion queue for admins and fixed retention jobs.
- Dependencies updated, Node 22. No high or critical npm audit findings.

**Redesign**

- New landing page with an interactive invoice demo, new brand mark, header and footer.
- Reworked login, sign-up, pricing and dashboard. Accessibility improvements (keyboard focus, skip link, reduced motion).

## Getting Started

**Prerequisites:** Node.js 22+, npm, a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run db:migrate           # apply database migrations (requires DATABASE_URL)
npm run dev                  # http://localhost:3000
```

### Scripts

| Command                                  | Purpose                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                            | Development server                                               |
| `npm run build`                          | Production build                                                 |
| `npm run lint` / `npm run type-check`    | ESLint / TypeScript                                              |
| `npm run test` / `npm run test:coverage` | Unit tests / coverage                                            |
| `npm run test:e2e`                       | Playwright E2E tests                                             |
| `npm run test:security-db`               | Full migration chain + DB security checks on an empty PostgreSQL |
| `npm run db:migrate:dry-run`             | Show migration order without DB access                           |

### Format validation

```bash
npx tsx scripts/generate-test-invoices.ts   # generate test invoices in all 9 formats
bash scripts/validate-with-kosit.sh         # validate with KoSIT + xmllint (Java 17+)
```

## License

MIT
