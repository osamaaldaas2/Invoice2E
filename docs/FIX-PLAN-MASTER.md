# Master Fix Plan — Invoice2E Production Hardening

**Created:** 17.02.2026 | **Status:** In Progress

---

## Execution Order

### 🔴 PHASE 0 — Emergency (Zero/Near-zero risk, max impact)

| #    | Fix                                                        | File(s)                                      | Status  |
| ---- | ---------------------------------------------------------- | -------------------------------------------- | ------- |
| F-20 | Extraction prompt: paymentTerms/dueDate/notes priority     | `lib/extraction-prompt.ts`                   | ✅ Done |
| F-03 | Logger: PII redaction + server-only requestId re-impl      | `lib/logger.ts`, `lib/log-context.server.ts` | ✅ Done |
| F-19 | FORMAT_FIELD_CONFIG — central format requirements config   | `lib/format-field-config.ts`                 | ✅ Done |
| F-02 | Batch processor RLS (admin→user-scoped for extractions)    | `services/batch/batch.processor.ts`          | ✅ Done |
| F-01 | Credit deduction idempotency (single-invoice route)        | `app/api/invoices/extract/route.ts`          | ✅ Done |
| F-04 | Peppol v3.0.20 compliance verification + specVersion field | `validation/peppol-rules.ts`, generators     | ⏳ Next |

### 🟠 PHASE 1 — Foundation (Additive, no behavior change)

| #    | Fix                                                           | File(s)                                                | Status     |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| F-05 | Format generator versioning (`specVersion` on each generator) | `services/format/IFormatGenerator.ts` + all generators | ⏳ Pending |
| F-06 | Audit log immutability (REVOKE + hash chain migration)        | SQL migration + `services/audit.db.service.ts`         | ⏳ Pending |
| F-07 | Feature flags (env-based, zero infra)                         | `lib/feature-flags.ts`                                 | ⏳ Pending |
| F-08 | Business metrics (prom-client counters/histograms)            | `lib/metrics.ts` + `/api/metrics` route                | ⏳ Pending |

### 🎨 PHASE 2 — UI/UX (Depends on F-19)

| #    | Fix                                                             | File(s)                                                               | Status     |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| F-21 | Single invoice review: dynamic fields per format                | `components/forms/invoice-review/*`                                   | ⏳ Pending |
| F-22 | Bulk upload: auto-detect format + global override + per-invoice | `BulkUploadForm.tsx`, `batch-download/route.ts`, `batch.processor.ts` | ⏳ Pending |

### 🏗️ PHASE 3 — Architecture (Controlled risk)

| #    | Fix                                                   | File(s)                                         | Status     |
| ---- | ----------------------------------------------------- | ----------------------------------------------- | ---------- |
| F-09 | Schematron validation in CI (easybill docker sidecar) | `docker-compose.test.yml`, `tests/integration/` | ⏳ Pending |
| F-10 | Virus scan on upload (ClamAV/VirusTotal wrapper)      | `lib/virus-scanner.ts` + route integration      | ⏳ Pending |
| F-11 | Circuit breaker on AI providers (cockatiel)           | `lib/circuit-breaker.ts` + extractor factory    | ⏳ Pending |
| F-12 | Saga/compensation for extraction pipeline             | `services/saga/extraction-saga.ts` + SQL        | ⏳ Pending |
| F-13 | OpenTelemetry distributed tracing                     | `instrumentation.ts` + `lib/telemetry.ts`       | ⏳ Pending |
| F-14 | Architectural boundary enforcement in CI              | `dependency-cruiser.config.cjs` + CI            | ⏳ Pending |

### 🟢 PHASE 4 — Compliance & Operations

| #    | Fix                                                   | File(s)                                               | Status     |
| ---- | ----------------------------------------------------- | ----------------------------------------------------- | ---------- |
| F-15 | Data retention engine (per-jurisdiction)              | `services/retention/` + SQL                           | ⏳ Pending |
| F-16 | Validator lifecycle management (T-90/60/30/0 process) | `docs/VALIDATOR-LIFECYCLE.md` + validation versioning | ⏳ Pending |
| F-17 | E2E tests (Playwright — 4 critical flows)             | `tests/e2e/` + `playwright.config.ts`                 | ⏳ Pending |
| F-18 | SLO definitions + Sentry alerting                     | `docs/SLO.md` + Sentry config                         | ⏳ Pending |

---

## Format Field Requirements (from validators)

| Field                        |  XRechnung  |   Peppol    |   FatturaPA   |   KSeF    |    NLCIUS     | Factur-X EN | Factur-X Basic |  CIUS-RO  |
| ---------------------------- | :---------: | :---------: | :-----------: | :-------: | :-----------: | :---------: | :------------: | :-------: |
| Seller Phone                 |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Seller Email                 |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Seller ContactName           |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Seller VAT ID                |    REQ\*    |     REQ     |   REQ (IT)    | REQ (NIP) | REQ (NL BTW)  |    REQ\*    |     REQ\*      | REQ (RO)  |
| Seller TaxNumber             |    OPT\*    |      —      |       —       |     —     |       —       |      —      |       —        | OPT (CUI) |
| Seller IBAN                  |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Seller ElectronicAddr        | REQ (BT-34) | REQ (BT-34) |       —       |     —     | REQ (OIN/KVK) |      —      |       —        |    REQ    |
| Seller ElectronicScheme      |     REQ     |     REQ     |       —       |     —     |      REQ      |      —      |       —        |    REQ    |
| Buyer Street                 |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Buyer City                   |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Buyer PostalCode             |     REQ     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| Buyer CountryCode            |     REQ     |      —      |       —       |     —     |       —       |     REQ     |      REQ       |     —     |
| Buyer VAT ID                 |      —      |      —      |     REQ\*     | OPT (NIP) |       —       |      —      |       —        |     —     |
| Buyer Reference (Leitweg-ID) |    WARN     |      —      |       —       |     —     |       —       |      —      |       —        |     —     |
| CodiceDestinatario           |      —      |      —      | REQ (7-char)  |     —     |       —       |      —      |       —        |     —     |
| Buyer ElectronicAddr         | REQ (BT-49) | REQ (BT-49) | REQ (PEC/SDI) |     —     | REQ (OIN/KVK) |      —      |       —        |    REQ    |
| Currency = EUR               |   FORCED    |     any     |      any      |    any    |      any      |     any     |      any       |    any    |
| PaymentTerms OR DueDate      |     REQ     |     REQ     |       —       |     —     |      REQ      |     REQ     |       —        |    REQ    |

REQ\* = at least one of multiple options | WARN = warning not error
