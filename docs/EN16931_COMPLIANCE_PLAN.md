# Invoice2E — EN 16931 Compliance Transformation Plan

**Version:** 1.0
**Date:** 2026-02-11
**Scope:** Full EN 16931 conformity (XRechnung CII profile for Germany), with forward compatibility for Peppol UBL
**Approach:** Minimal architectural disruption, additive modular refactoring

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Architecture Blueprint](#2-current-system-architecture-blueprint)
3. [Data Flow Diagram](#3-data-flow-diagram)
4. [Current Domain Model Analysis](#4-current-domain-model-analysis)
5. [XML Rendering Pipeline Analysis](#5-xml-rendering-pipeline-analysis)
6. [EN 16931 Gap Assessment (P0/P1/P2)](#6-en-16931-gap-assessment)
7. [Target Compliance Architecture](#7-target-compliance-architecture)
8. [Validation Engine Integration Plan](#8-validation-engine-integration-plan)
9. [Incremental Refactoring Roadmap](#9-incremental-refactoring-roadmap)
10. [Regression-Safe Testing Strategy](#10-regression-safe-testing-strategy)

---

## 1. Executive Summary

Invoice2E is a Next.js SaaS application that extracts invoice data from PDFs/images using AI (Gemini/DeepSeek), allows user review, and generates XRechnung CII or UBL XML. The system is **architecturally sound** with clean separation (Routes → Services → Adapters → Lib), DRY extraction logic, atomic credit management, and robust batch processing.

**Current Compliance Status: ~65% toward full EN 16931 / XRechnung 3.0 conformity.**

The system correctly implements the CII document structure, multi-rate tax grouping, and most BR-DE rules. However, **26 compliance gaps** were identified across three priority levels:

| Priority            | Count | Description                                                  |
| ------------------- | ----- | ------------------------------------------------------------ |
| **P0 — Blockers**   | 8     | Will cause XRechnung Schematron validation failure           |
| **P1 — Important**  | 10    | Compliance risks affecting real-world acceptance             |
| **P2 — Structural** | 8     | Extensibility for future profiles (Peppol UBL, credit notes) |

**Key architectural insight:** The system can reach full XRechnung CII compliance through **additive refactoring** — no invasive rewrites needed. The 5-phase roadmap below introduces a canonical invoice model, decimal-safe monetary handling, a validation engine, and profile-based XML rendering while maintaining production stability.

---

## 2. Current System Architecture Blueprint

### 2.1 Runtime Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  /invoices/extract   /invoices/review   /invoices/convert    │
│  /invoices/bulk-upload   /internal/batch-worker              │
│  /auth/*  /payments/*  /admin/*                              │
└────────┬────────────────────┬─────────────────────┬──────────┘
         │                    │                     │
    ┌────▼────┐         ┌────▼─────┐          ┌────▼────┐
    │Services │         │Services  │          │Services │
    │(AI)     │         │(Review)  │          │(XML)    │
    ├─────────┤         ├──────────┤          ├─────────┤
    │Extractor│         │Review    │          │XRechnung│
    │Factory  │         │Service   │          │Service  │
    │Gemini   │         │Analytics │          │UBL      │
    │DeepSeek │         │Credits   │          │Service  │
    │Batch    │         │Invoice DB│          │         │
    └────┬────┘         └────┬─────┘          └────┬────┘
         │                    │                     │
    ┌────▼────┐         ┌────▼─────┐          ┌────▼────┐
    │Adapters │         │  Lib     │          │Adapters │
    ├─────────┤         ├──────────┤          ├─────────┤
    │Gemini   │         │Normalizer│          │Supabase │
    │DeepSeek │         │Prompt    │          │Stripe   │
    │         │         │Constants │          │PayPal   │
    └────┬────┘         └──────────┘          └─────────┘
         │
    ┌────▼──────────────────────────────────────────┐
    │           External Services                    │
    │  Google Gemini · DeepSeek · Supabase (PG+S3)  │
    │  SendGrid · Stripe · PayPal                    │
    └───────────────────────────────────────────────┘
```

### 2.2 Entry Points

| Entry Point                         | Method | Async?                           | Purpose                         |
| ----------------------------------- | ------ | -------------------------------- | ------------------------------- |
| `POST /api/invoices/extract`        | POST   | Conditional (202 if >3 invoices) | Single/multi-file AI extraction |
| `POST /api/invoices/bulk-upload`    | POST   | Always (202)                     | ZIP batch upload                |
| `POST /api/invoices/review`         | POST   | No                               | Save single review              |
| `POST /api/invoices/review/bulk`    | POST   | No                               | Save bulk reviews (≤100)        |
| `POST /api/invoices/convert`        | POST   | No                               | Generate XRechnung/UBL XML      |
| `POST /api/internal/batch-worker`   | POST   | No                               | Process pending batch jobs      |
| `POST /api/invoices/batch-download` | POST   | No                               | Generate ZIP of XMLs            |

### 2.3 External Service Dependencies

| Service      | Purpose                   | Integration                  | Rate Limiting                |
| ------------ | ------------------------- | ---------------------------- | ---------------------------- |
| **Gemini**   | AI extraction (secondary) | Google Generative AI SDK     | Token bucket: 5 burst, 2/sec |
| **DeepSeek** | AI extraction (DEFAULT)   | REST API (OpenAI-compatible) | Adapter-level timeout 60s    |
| **Supabase** | PostgreSQL + Storage      | Admin client (bypasses RLS)  | DB timeout 10s               |
| **Stripe**   | Payments                  | Checkout sessions + webhooks | Standard                     |
| **PayPal**   | Payments (alternative)    | REST API                     | Standard                     |
| **SendGrid** | Transactional email       | REST API                     | Timeout 10s                  |

### 2.4 Module Coupling Assessment

**Strengths:**

- No circular dependencies detected
- Clean adapter pattern (constructor injection)
- Factory + singleton pattern for AI providers
- Single source of truth for extraction prompt and normalizer

**Coupling Risks for EN 16931 refactoring:**

- `ExtractedInvoiceData` type is used directly throughout (no intermediate canonical model)
- XRechnung builder directly consumes extraction data (no domain layer separation)
- Monetary calculations are distributed across 3 locations (frontend, review service, builder)
- Tax grouping is only performed during XML generation, not during validation

---

## 3. Data Flow Diagram

### 3.1 Complete Document Lifecycle

```
PDF/Image Upload
      │
      ▼
┌─────────────────┐    ┌──────────────────┐
│  AI Extraction   │───▶│  Shared Prompt   │  lib/extraction-prompt.ts
│  (Gemini/Deep)   │    │  + Normalizer    │  lib/extraction-normalizer.ts
└────────┬────────┘    └──────────────────┘
         │
         ▼
┌─────────────────┐
│ ExtractedInvoice │    types/index.ts (canonical type)
│     Data         │    Stored as JSONB in invoice_extractions
│ (camelCase)      │    DB stores snake_case (recursive conversion)
└────────┬────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐
│  User Review     │───▶│ ReviewService    │  Validates required fields
│  Form (UI)       │    │ validateReviewed │  NO monetary recalculation
└────────┬────────┘    │ Data()           │  Persists as-is
         │              └──────────────────┘
         ▼
┌─────────────────┐    ┌──────────────────┐
│ XRechnung/UBL    │───▶│ XRechnungBuilder │  Recalculates tax groups
│ XML Generation   │    │ (string concat)  │  from line items
└────────┬────────┘    └──────────────────┘
         │
         ▼
┌─────────────────┐
│  XML Download    │    Cached in invoice_conversions.xml_content
│  (single/ZIP)    │
└─────────────────┘
```

### 3.2 Critical Observation: No Domain Layer

The current flow passes `ExtractedInvoiceData` (an AI-extraction DTO) directly through the entire pipeline. There is **no intermediate canonical invoice model** that separates extraction concerns from domain/compliance concerns. This is the single most impactful architectural gap for EN 16931 compliance.

---

## 4. Current Domain Model Analysis

### 4.1 Primary Invoice DTO: `ExtractedInvoiceData`

**Location:** `types/index.ts` (canonical), also in `services/gemini.service.ts` (Zod), `services/ai/IAIExtractor.ts` (re-export)

**Total fields:** 38 (excluding line item internals)

| Category        | Fields                                                                                 | Type           | Notes                     |
| --------------- | -------------------------------------------------------------------------------------- | -------------- | ------------------------- |
| **Metadata**    | invoiceNumber, invoiceDate                                                             | string \| null | Date as YYYY-MM-DD string |
| **Buyer** (8)   | name, email, address, city, postalCode, countryCode, taxId, phone                      | string \| null | Address = street only     |
| **Seller** (11) | name, email, address, city, postalCode, countryCode, taxId, iban, bic, phone, bankName | string \| null | IBAN normalized           |
| **Line Items**  | Array of {description, quantity, unitPrice, totalPrice, taxRate?}                      | number         | taxRate as percentage     |
| **Totals**      | subtotal, taxRate, taxAmount, totalAmount                                              | number         | Plain JS numbers          |
| **Other**       | currency, paymentTerms, notes, confidence, processingTimeMs                            | mixed          | Currency default EUR      |

### 4.2 Monetary Field Assessment

| Question                               | Answer                                                   | Risk                                 |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Are monetary values net or gross?      | Line items are net (pre-tax); totalAmount is gross       | Low — consistent                     |
| Are totals computed or passed through? | **Passed through** from AI, then recalculated in builder | **Medium** — mismatch possible       |
| Is there per-line tax?                 | Yes, fully supported                                     | Low                                  |
| Is there a tax breakdown structure?    | Only during XML generation (Map-based grouping)          | **High** — not in domain model       |
| Rounding policy?                       | `Math.round(value * 100) / 100` everywhere               | **Medium** — no decimal library      |
| Floating-point risk?                   | IEEE 754 doubles; post-summation rounding mitigates      | **Medium** — adequate for 2 decimals |

### 4.3 Implicit Assumptions (Domain Leakage)

| Assumption                  | EN 16931 Reality                                                           | Impact                            |
| --------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Single VAT rate per invoice | Multiple rates per invoice required (BG-23)                                | **Handled** — per-line rates work |
| No allowances/charges       | EN 16931 defines BG-20/BG-21 (document-level) and BG-27/BG-28 (line-level) | **P1 gap**                        |
| No credit notes             | Document type 381 (credit note) required                                   | **P1 gap**                        |
| buyerTaxId = VAT ID         | EN 16931 separates VAT ID (BT-48) from Tax Number                          | **P0 gap**                        |
| Single payment means        | Multiple payment means possible (BG-16)                                    | **P1 gap**                        |
| No invoice period           | BG-14 (invoicing period) required for service invoices                     | **P1 gap**                        |
| No preceding invoice ref    | BG-3 (preceding invoice reference) needed for credit notes                 | **P1 gap**                        |
| totalAmount always positive | Credit notes have negative or zero totals                                  | **P1 gap**                        |

### 4.4 Database Schema Implications

The `invoice_extractions.extraction_data` column stores the complete `ExtractedInvoiceData` as JSONB with **recursive camelCase→snake_case conversion**. This means:

- Adding new fields to `ExtractedInvoiceData` automatically propagates to DB (no migration needed for JSONB)
- However, existing records lack new fields (must handle `undefined` gracefully)
- The conversion table `invoice_conversions` has denormalized fields + cached XML

---

## 5. XML Rendering Pipeline Analysis

### 5.1 Architecture

| Component        | File                                      | Lines | Purpose                        |
| ---------------- | ----------------------------------------- | ----- | ------------------------------ |
| **Orchestrator** | `services/xrechnung/xrechnung.service.ts` | 45    | Validate → Build → Return      |
| **Validator**    | `services/xrechnung/validator.ts`         | 42    | 11 business rule checks        |
| **Builder**      | `services/xrechnung/builder.ts`           | 574   | String concatenation XML       |
| **Types**        | `services/xrechnung/types.ts`             | 57    | XRechnungInvoiceData interface |
| **UBL Service**  | `services/ubl.service.ts`                 | 336   | UBL 2.1 alternative            |

### 5.2 XML Format Details

| Property             | Value                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| **Format**           | UN/CEFACT CII (CrossIndustryInvoice)                                    |
| **Version**          | XRechnung 3.0                                                           |
| **Guideline ID**     | `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` |
| **Business Process** | `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`                           |
| **Document Type**    | 380 (hardcoded — only commercial invoice)                               |
| **Payment Means**    | 58 (SEPA credit transfer) or 1 (unspecified)                            |

### 5.3 XML Construction Method

**String concatenation** via template literals. No XML DOM builder, no template engine.

```typescript
// Example from builder.ts
buildXml(data: XRechnungInvoiceData): string {
    const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
    const rootElement = `
<rsm:CrossIndustryInvoice ...>
    ${this.buildExchangedDocumentContext()}
    ${this.buildExchangedDocument(data)}
    ${this.buildSupplyChainTradeTransaction(data)}
</rsm:CrossIndustryInvoice>`;
    return xmlDeclaration + rootElement;
}
```

**Safety mechanisms:** `escapeXml()` for special characters + control char removal, `safeNumber()` for NaN prevention, `formatDate()` for multi-format parsing, `normalizeCurrency()` for ISO 4217.

### 5.4 Profile Configurability

**All profile identifiers are hardcoded as class constants:**

- `xrechnungVersion` — Guideline ID
- Business process ID — inline string
- Document type code — hardcoded `380`
- Payment means code — hardcoded `58`

**Impact:** Cannot switch to different XRechnung versions or Peppol profiles without code changes.

### 5.5 EN 16931 Business Term Coverage

| Category                            | Mapped      | Missing     | Coverage                  |
| ----------------------------------- | ----------- | ----------- | ------------------------- |
| Document metadata (BT-1 to BT-8)    | 5           | 3           | 63%                       |
| Seller info (BT-27 to BT-35)        | 10          | 3           | 77%                       |
| Buyer info (BT-44 to BT-52)         | 7           | 4           | 64%                       |
| Line items (BT-126 to BT-154)       | 7           | 6           | 54%                       |
| Totals (BT-106 to BT-115)           | 5           | 2           | 71%                       |
| Tax breakdown (BG-23)               | 4           | 2           | 67%                       |
| Payment (BG-16 to BG-19)            | 3           | 5           | 38%                       |
| Allowances/Charges (BG-20/21/27/28) | 0           | 8           | 0%                        |
| **Overall**                         | **~25 BTs** | **~33 BTs** | **~43% of mandatory BTs** |

### 5.6 BR-DE Compliance Status

| Rule       | Requirement                    | Status                          |
| ---------- | ------------------------------ | ------------------------------- |
| BR-DE-1    | Complete seller address        | ✅ Validated                    |
| BR-DE-2    | Seller contact (phone + email) | ⚠️ Warning only, not blocking   |
| BR-DE-3    | Seller city                    | ✅ Validated                    |
| BR-DE-4    | Seller postal code             | ✅ Validated                    |
| BR-DE-5/9  | Seller country code            | ✅ Validated (default DE)       |
| BR-DE-11   | Buyer country code             | ✅ Validated (default DE)       |
| BR-DE-15   | Buyer reference (Leitweg-ID)   | ✅ Fallback to invoice#         |
| BR-DE-17   | Payment means type code        | ❌ Only 58, missing other codes |
| BR-DE-21   | Specification identifier       | ✅ Hardcoded constant           |
| BR-DE-23-a | IBAN for bank transfer         | ⚠️ Warning only                 |
| BR-CO-25   | Payment terms OR due date      | ✅ Validated                    |

---

## 6. EN 16931 Gap Assessment

### 6.1 P0 — Compliance Blockers (Schematron validation WILL fail)

| #        | Gap                                | EN 16931 Ref                                       | Current State                                                                           | Required Change                                                                                                                                                                            | Files Affected                                                                     |
| -------- | ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **P0-1** | No VAT ID / Tax Number separation  | BT-31 (Seller VAT ID) vs BT-32 (Seller Tax Number) | Single `sellerTaxId` field used for both                                                | Add `sellerVatId` (DE-prefixed) and `sellerTaxRegistration` (local number) as separate fields. Map `sellerTaxId` → `schemeID="VA"` (VAT) or `schemeID="FC"` (fiscal code) based on format. | `types/index.ts`, `extraction-prompt.ts`, `extraction-normalizer.ts`, `builder.ts` |
| **P0-2** | No Buyer VAT ID                    | BT-48                                              | `buyerTaxId` exists but not mapped to XML                                               | Map to `ram:SpecifiedTaxRegistration` with `schemeID="VA"` under BuyerTradeParty                                                                                                           | `builder.ts`                                                                       |
| **P0-3** | BR-DE-2 not enforced               | BR-DE-2                                            | Seller contact (PersonName + Phone + Email) logs warning but generates XML without them | Enforce: block XML generation if seller contact info is missing, or provide sensible placeholder text. XRechnung Schematron WILL reject missing contact.                                   | `validator.ts`, `builder.ts`                                                       |
| **P0-4** | BR-DE-23-a not enforced            | BR-DE-23-a                                         | IBAN warning-only; falls back to TypeCode=1                                             | When TypeCode=58 (bank transfer), IBAN is **mandatory** per Schematron. Either enforce IBAN or use TypeCode=1 with clear user notice.                                                      | `validator.ts`, `builder.ts`                                                       |
| **P0-5** | Missing Buyer Electronic Address   | BT-49 (PEPPOL-EN16931-R010)                        | `buyerEmail` is optional, often omitted                                                 | XRechnung requires `ram:URIUniversalCommunication` under BuyerTradeParty. Must provide email OR GLN OR other endpoint.                                                                     | `builder.ts`, `validator.ts`                                                       |
| **P0-6** | Missing Seller Electronic Address  | BT-34                                              | `sellerEmail` not mapped as `ram:URIUniversalCommunication` at party level              | Must add `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">` for seller                                                                                                             | `builder.ts`                                                                       |
| **P0-7** | Tax category codes incomplete      | BT-118, BT-151                                     | Only `S` (standard) and `E` (exempt)                                                    | Must support: `S`, `Z` (zero-rated), `E` (exempt), `AE` (reverse charge), `K` (intra-community), `G` (export). Each has different Schematron rules.                                        | `builder.ts`, `types/index.ts`                                                     |
| **P0-8** | No monetary cross-check validation | BR-CO-10 to BR-CO-16                               | Totals are passed through without cross-checking                                        | Schematron validates: `sum(line net amounts) = invoice total net` (BR-CO-10), `tax basis = net total` (BR-CO-13), `total = net + tax` (BR-CO-15). System must compute and verify.          | `validator.ts`, new `monetary-validator.ts`                                        |

### 6.2 P1 — Important Compliance Risks

| #         | Gap                                          | EN 16931 Ref                 | Current State                                                 | Required Change                                                                                                   |
| --------- | -------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| **P1-1**  | No document type code selection              | BT-3                         | Hardcoded `380` (invoice only)                                | Support 380 (invoice), 381 (credit note), 384 (corrected invoice), 389 (self-billing)                             |
| **P1-2**  | No allowance/charge support                  | BG-20, BG-21, BG-27, BG-28   | Not implemented                                               | Add document-level and line-level allowances/charges to domain model + XML                                        |
| **P1-3**  | No invoice period                            | BG-14 (BT-73, BT-74)         | Not tracked                                                   | Add `invoicePeriodStart`, `invoicePeriodEnd` fields (mandatory for service invoices)                              |
| **P1-4**  | No preceding invoice reference               | BG-3 (BT-25, BT-26)          | Not tracked                                                   | Required for credit notes (381) and corrected invoices (384)                                                      |
| **P1-5**  | Single payment means only                    | BG-16                        | Only bank transfer (58) or unspecified (1)                    | Support: 30 (credit transfer), 48 (bank card), 49 (direct debit), 57 (standing order), 58 (SEPA CT), 59 (SEPA DD) |
| **P1-6**  | No delivery information                      | BG-13 (BT-70 to BT-72)       | Only delivery date (= invoice date)                           | Add delivery party name, delivery address (separate from buyer)                                                   |
| **P1-7**  | Floating-point monetary arithmetic           | —                            | `Math.round(n*100)/100` with JS `number`                      | Introduce decimal-safe computation for tax breakdown (mitigate rounding drift on large invoices)                  |
| **P1-8**  | No server-side monetary validation in review | —                            | Review accepts totals as-is from client                       | Add cross-check: `                                                                                                | subtotal + taxAmount - totalAmount | ≤ 0.01` in review service |
| **P1-9**  | No item classification codes                 | BT-158 (scheme), BT-157 (ID) | Items identified by description only                          | Support CPV, UNSPSC, or custom classification codes                                                               |
| **P1-10** | No invoice notes (BT-22)                     | BT-22                        | `notes` field exists but not mapped to XML `ram:IncludedNote` | Map to `rsm:ExchangedDocument/ram:IncludedNote/ram:Content`                                                       |

### 6.3 P2 — Structural Improvements for Extensibility

| #        | Gap                                   | Description                                                    | Impact                              |
| -------- | ------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| **P2-1** | No canonical invoice model            | Extraction DTO used through entire pipeline                    | Blocks clean domain separation      |
| **P2-2** | Profile identifiers hardcoded         | Cannot switch XRechnung version or to Peppol                   | Blocks multi-profile support        |
| **P2-3** | No XSD validation                     | XML structure not validated against schema                     | Cannot guarantee well-formed output |
| **P2-4** | No Schematron validation              | Business rules not machine-verified                            | Cannot guarantee compliance         |
| **P2-5** | String concatenation for XML          | Fragile, hard to test individual elements                      | Maintenance risk at scale           |
| **P2-6** | 3 copies of ExtractedInvoiceData type | `types/index.ts`, `gemini.service.ts` (Zod), `IAIExtractor.ts` | Divergence risk                     |
| **P2-7** | No unit code vocabulary               | Default `C62` (piece) for everything                           | Should map to UN/ECE Rec 20 codes   |
| **P2-8** | No multi-currency support             | Single currency per invoice, no rounding rules per currency    | Blocks international expansion      |

---

## 7. Target Compliance Architecture

### 7.1 Layered Architecture (After Transformation)

```
┌──────────────────────────────────────────────────────────────┐
│                    API Routes (unchanged)                     │
└───────────┬──────────────────────────────────�┬───────────────┘
            │                                  │
   ┌────────▼─────────┐              ┌────────▼─────────┐
   │ Extraction Layer  │              │ Conversion Layer  │
   │ (AI + Normalizer) │              │ (Review + XML)    │
   └────────┬─────────┘              └────────┬─────────┘
            │                                  │
            │         ┌───────────────┐        │
            └────────▶│  CANONICAL    │◀───────┘
                      │  INVOICE      │
                      │  MODEL        │   ← NEW
                      │  (domain/)    │
                      └───────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼──────┐ ┌─────▼─────┐ ┌──────▼────────┐
     │  Monetary     │ │ Validation│ │  Profile      │
     │  Calculator   │ │ Engine    │ │  Registry     │
     │  (decimal-    │ │ (XSD +    │ │  (XRechnung,  │
     │   safe)       │ │ Schematron│ │   Peppol)     │
     │               │ │ + custom) │ │               │   ← ALL NEW
     └───────────────┘ └───────────┘ └──────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │  Syntax Renderer │
                                   │  ├─ CII Renderer │
                                   │  └─ UBL Renderer │
                                   └─────────────────┘
```

### 7.2 Canonical Invoice Model

**Location:** `domain/canonical-invoice.ts` (NEW)

```typescript
// ─── Value Objects ───
interface Money {
  amount: number; // Decimal-safe (see MonetaryCalculator)
  currency: string; // ISO 4217
}

interface TaxCategory {
  code: 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O' | 'L'; // UNCL5305
  rate: number; // percentage (e.g. 19)
  exemptionReason?: string;
  exemptionReasonCode?: string;
}

interface PostalAddress {
  streetName?: string; // BT-35/50
  additionalStreet?: string; // BT-36/51
  city?: string; // BT-37/52
  postalCode?: string; // BT-38/53
  countryCode: string; // BT-40/55 — ISO 3166-1 alpha-2
  countrySubdivision?: string; // BT-39/54
}

interface PartyIdentification {
  id: string;
  schemeId?: string; // e.g. "0088" for GLN
}

interface TaxRegistration {
  id: string;
  schemeId: 'VA' | 'FC'; // VA=VAT ID, FC=Tax Number
}

// ─── Aggregate Entities ───
interface CanonicalParty {
  name: string;
  tradingName?: string;
  identifications: PartyIdentification[];
  taxRegistrations: TaxRegistration[];
  postalAddress: PostalAddress;
  electronicAddress?: { uri: string; schemeId: string };
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

interface CanonicalLineItem {
  lineId: string; // BT-126
  note?: string; // BT-127
  quantity: number; // BT-129
  unitCode: string; // BT-130 (UN/ECE Rec 20)
  netAmount: Money; // BT-131
  unitNetPrice: Money; // BT-146
  unitGrossPrice?: Money; // BT-148
  priceDiscount?: Money; // BT-147
  itemName: string; // BT-153
  itemDescription?: string; // BT-154
  itemClassifications?: { code: string; schemeId: string }[]; // BT-158
  itemTaxCategory: TaxCategory; // BG-30
  allowances?: AllowanceCharge[]; // BG-27
  charges?: AllowanceCharge[]; // BG-28
}

interface AllowanceCharge {
  isCharge: boolean;
  amount: Money;
  baseAmount?: Money;
  percentage?: number;
  reasonCode?: string; // UNCL5189 (allowance) or UNCL7161 (charge)
  reason?: string;
  taxCategory?: TaxCategory;
}

interface TaxBreakdown {
  taxCategory: TaxCategory;
  taxableAmount: Money; // BT-116
  taxAmount: Money; // BT-117
}

// ─── Aggregate Root ───
interface CanonicalInvoice {
  // Document metadata
  id: string; // BT-1
  issueDate: string; // BT-2 (YYYY-MM-DD)
  typeCode: 380 | 381 | 384 | 389; // BT-3
  currencyCode: string; // BT-5
  taxCurrencyCode?: string; // BT-6
  buyerReference?: string; // BT-10 (Leitweg-ID)
  notes?: string[]; // BT-22

  // Period
  invoicePeriod?: {
    startDate?: string; // BT-73
    endDate?: string; // BT-74
  };

  // Preceding reference (for credit notes)
  precedingInvoiceRef?: {
    id: string; // BT-25
    issueDate?: string; // BT-26
  };

  // Parties
  seller: CanonicalParty; // BG-4
  buyer: CanonicalParty; // BG-7
  payee?: CanonicalParty; // BG-10
  deliveryParty?: {
    // BG-13
    name?: string;
    address?: PostalAddress;
    deliveryDate?: string; // BT-72
  };

  // Payment
  paymentMeans: {
    typeCode: number; // BT-81 (UNCL4461)
    paymentId?: string; // BT-83
    iban?: string; // BT-84
    bic?: string; // BT-86
    cardNumber?: string; // BT-87 (masked)
    mandateReference?: string; // BT-89 (for direct debit)
    bankName?: string;
  }[];
  paymentTerms?: string; // BT-20
  paymentDueDate?: string; // BT-9

  // Line items
  lineItems: CanonicalLineItem[]; // BG-25

  // Document-level allowances/charges
  documentAllowances?: AllowanceCharge[]; // BG-20
  documentCharges?: AllowanceCharge[]; // BG-21

  // Tax breakdown (computed)
  taxBreakdowns: TaxBreakdown[]; // BG-23

  // Monetary totals (all computed and cross-checked)
  totals: {
    sumOfLineNetAmounts: Money; // BT-106
    sumOfAllowances?: Money; // BT-107
    sumOfCharges?: Money; // BT-108
    invoiceTotalWithoutTax: Money; // BT-109
    invoiceTotalTax: Money; // BT-110
    invoiceTotalWithTax: Money; // BT-112
    prepaidAmount?: Money; // BT-113
    roundingAmount?: Money; // BT-114
    amountDue: Money; // BT-115
  };
}
```

**Key Design Decisions:**

1. **Syntax-agnostic** — No CII/UBL concepts leak into the model
2. **Tax breakdown is explicit** — Not computed on-the-fly during rendering
3. **Monetary values wrapped in `Money`** — Currency always travels with amount
4. **VAT ID vs Tax Number separated** — Via `TaxRegistration.schemeId`
5. **AllowanceCharge** — Unified structure for both levels
6. **Multiple payment means** — Array, not single value

### 7.3 Module Placement

```
domain/
├── canonical-invoice.ts      ← Aggregate root + value objects
├── monetary-calculator.ts    ← Decimal-safe arithmetic
├── tax-engine.ts            ← Tax breakdown computation
└── invoice-mapper.ts        ← ExtractedInvoiceData → CanonicalInvoice

validation/
├── validation-pipeline.ts    ← Orchestrator (schema → business → profile)
├── schema-validator.ts       ← XSD validation
├── schematron-validator.ts   ← Schematron rules
├── business-rules.ts         ← Cross-field monetary rules
├── profile-rules/
│   ├── xrechnung-rules.ts    ← BR-DE rules
│   └── peppol-rules.ts       ← Peppol rules (future)
└── validation-result.ts      ← Structured error model

rendering/
├── profile-registry.ts       ← Profile configuration
├── renderer-factory.ts       ← Create renderer by profile
├── cii/
│   ├── cii-renderer.ts       ← CII XML builder (replaces builder.ts)
│   └── cii-namespace.ts      ← Namespace constants
└── ubl/
    ├── ubl-renderer.ts       ← UBL XML builder (replaces ubl.service.ts)
    └── ubl-namespace.ts      ← Namespace constants
```

---

## 8. Validation Engine Integration Plan

### 8.1 Validation Pipeline Architecture

```
CanonicalInvoice
      │
      ▼
┌──────────────────┐
│ Stage 1: Schema  │    Structural correctness
│ (required fields,│    "Is the data well-formed?"
│  types, ranges)  │
└────────┬─────────┘
         │ pass
         ▼
┌──────────────────┐
│ Stage 2: Business│    Monetary integrity
│ (BR-CO-10..16,   │    "Do the numbers add up?"
│  cross-checks)   │
└────────┬─────────┘
         │ pass
         ▼
┌──────────────────┐
│ Stage 3: Profile │    Profile-specific rules
│ (BR-DE-1..23,    │    "Does this pass XRechnung?"
│  PEPPOL rules)   │
└────────┬─────────┘
         │ pass
         ▼
┌──────────────────┐
│ Stage 4: XML     │    Generated XML verification
│ (XSD + optional  │    "Is the XML schema-valid?"
│  Schematron)     │
└────────┬─────────┘
         │
         ▼
   ValidationResult
   ├─ valid: boolean
   ├─ errors: ValidationError[]
   ├─ warnings: ValidationWarning[]
   └─ profile: string
```

### 8.2 Structured Validation Error Model

```typescript
// validation/validation-result.ts

interface ValidationError {
  level: 'error' | 'warning' | 'info';
  ruleId: string; // e.g. "BR-CO-10", "BR-DE-2", "XSD-001"
  location: string; // e.g. "invoice.seller.contact.phone"
  message: string; // User-readable description
  messageKey?: string; // i18n key for localization
  expected?: string; // What was expected
  actual?: string; // What was found
  suggestion?: string; // How to fix
}

interface ValidationResult {
  valid: boolean;
  profile: string; // e.g. "xrechnung-3.0-cii"
  errors: ValidationError[];
  warnings: ValidationError[];
  timestamp: string;
}
```

### 8.3 Profile-Based Rule Sets

```typescript
// validation/profile-rules/xrechnung-rules.ts

const XRECHNUNG_CII_RULES: ProfileRuleSet = {
  profileId: 'xrechnung-3.0-cii',
  guidelineId: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  businessProcessId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  rules: [
    { id: 'BR-DE-1',  check: (inv) => !!inv.seller.postalAddress.streetName, ... },
    { id: 'BR-DE-2',  check: (inv) => !!inv.seller.contact?.name && !!inv.seller.contact?.phone && !!inv.seller.contact?.email, ... },
    { id: 'BR-DE-3',  check: (inv) => !!inv.seller.postalAddress.city, ... },
    { id: 'BR-DE-4',  check: (inv) => !!inv.seller.postalAddress.postalCode, ... },
    { id: 'BR-DE-15', check: (inv) => !!inv.buyerReference, ... },
    { id: 'BR-DE-17', check: (inv) => inv.paymentMeans.some(pm => [30,48,54,55,58,59].includes(pm.typeCode)), ... },
    { id: 'BR-DE-23-a', check: (inv) => inv.paymentMeans.every(pm => pm.typeCode !== 58 || !!pm.iban), ... },
  ],
};
```

### 8.4 XSD/Schematron Integration Strategy

**Phase 1 (Recommended):** Server-side custom validation (TypeScript rules) — covers 90% of Schematron checks.

**Phase 2 (Optional):** External validation via:

- **Option A:** KoSIT Validator API (Java-based, can be hosted as microservice)
- **Option B:** `xslt3` npm package for Schematron XSLT transformation
- **Option C:** `libxmljs2` for XSD validation

**Recommendation:** Start with custom TypeScript rules (Phase 1). They're fast, testable, and cover the critical BR-DE and BR-CO rules. Add external Schematron validation as a quality gate in Phase 2 when the volume justifies the infrastructure cost.

---

## 9. Incremental Refactoring Roadmap

### Phase 1: Stabilize Monetary and Tax Logic

**Goal:** Fix P0 monetary validation gaps without changing architecture.

**Duration:** ~3-5 days

#### Files to Modify

| File                              | Change                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `services/xrechnung/validator.ts` | Add monetary cross-check rules (BR-CO-10 to BR-CO-16)                                              |
| `services/xrechnung/builder.ts`   | Fix tax category codes (add Z, AE, K, G); enforce BR-DE-2; map buyerTaxId to XML; map notes to XML |
| `services/review.service.ts`      | Add `validateMonetaryConsistency()`: check totals match                                            |
| `lib/extraction-normalizer.ts`    | Add `taxCategoryCode` derivation logic                                                             |
| `lib/extraction-prompt.ts`        | Request tax category (standard/exempt/reverse-charge) per line item                                |
| `lib/constants.ts`                | Add `TAX_CATEGORY_CODES` mapping                                                                   |

#### Files to Introduce

| File                                    | Purpose                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/monetary-validator.ts`             | Pure functions: `validateTotals()`, `validateTaxBreakdown()`, `crossCheckLineAmounts()` |
| `tests/unit/monetary-validator.test.ts` | Golden master tests for monetary rules                                                  |

#### Backward Compatibility

- No API changes
- No DB migration needed
- Review form unaffected (validation is additive)
- Existing extractions remain valid

#### Testing Requirements

- Unit tests for each BR-CO rule
- Edge case: 100+ line items with mixed rates
- Edge case: rounding at 0.005 boundary
- Edge case: zero-tax (exempt) invoices
- Regression: existing unit tests must pass

---

### Phase 2: Introduce Canonical Invoice Domain Layer

**Goal:** Create the `CanonicalInvoice` aggregate root and mapper from `ExtractedInvoiceData`.

**Duration:** ~5-7 days

#### Files to Introduce

| File                                     | Purpose                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `domain/canonical-invoice.ts`            | Type definitions (interfaces only, no classes)                                              |
| `domain/invoice-mapper.ts`               | `mapExtractedToCanonical(data: ExtractedInvoiceData): CanonicalInvoice`                     |
| `domain/monetary-calculator.ts`          | Decimal-safe: `add()`, `multiply()`, `round()`, `sumLineAmounts()`, `computeTaxBreakdown()` |
| `domain/tax-engine.ts`                   | `groupByTaxCategory()`, `computeTaxBreakdowns()`, `determineTaxCategory()`                  |
| `tests/unit/invoice-mapper.test.ts`      | Map AI output to canonical model                                                            |
| `tests/unit/monetary-calculator.test.ts` | Decimal precision tests                                                                     |
| `tests/unit/tax-engine.test.ts`          | Multi-rate grouping tests                                                                   |

#### Files to Modify

| File                                      | Change                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `types/index.ts`                          | Add new optional fields to `ExtractedInvoiceData` (taxCategoryCode, documentTypeCode, invoicePeriod, buyerReference) — **additive only** |
| `services/xrechnung/xrechnung.service.ts` | Convert: `ExtractedInvoiceData → CanonicalInvoice → XML` (add mapping step)                                                              |
| `app/api/invoices/convert/route.ts`       | Pass through canonical model to service                                                                                                  |

#### Backward Compatibility

- `ExtractedInvoiceData` gains optional fields only — existing data works
- `CanonicalInvoice` construction has sensible defaults for missing fields
- Old API responses unchanged
- No DB migration needed

#### Testing Requirements

- Mapper tests: known AI output → expected canonical form
- Tax engine: 1-rate, 2-rate, 3-rate, exempt, reverse-charge scenarios
- Calculator: known IEEE 754 problem pairs (e.g., `0.1 + 0.2`)
- Golden master: existing test invoices through new pipeline = same XML output

---

### Phase 3: Decouple XML Rendering

**Goal:** Extract CII/UBL rendering from current builder into profile-aware renderers consuming `CanonicalInvoice`.

**Duration:** ~5-7 days

#### Files to Introduce

| File                              | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `rendering/profile-registry.ts`   | Profile configuration (XRechnung 3.0 CII, Peppol UBL, etc.) |
| `rendering/renderer-factory.ts`   | `createRenderer(profile: string): InvoiceRenderer`          |
| `rendering/invoice-renderer.ts`   | Interface: `render(invoice: CanonicalInvoice): string`      |
| `rendering/cii/cii-renderer.ts`   | CII-specific XML generation from `CanonicalInvoice`         |
| `rendering/ubl/ubl-renderer.ts`   | UBL-specific XML generation from `CanonicalInvoice`         |
| `tests/unit/cii-renderer.test.ts` | CII output structure tests                                  |
| `tests/unit/ubl-renderer.test.ts` | UBL output structure tests                                  |

#### Files to Modify

| File                                      | Change                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `services/xrechnung/xrechnung.service.ts` | Delegate to `rendererFactory.createRenderer('xrechnung-3.0-cii').render(canonical)` |
| `services/ubl.service.ts`                 | Delegate to `rendererFactory.createRenderer('peppol-ubl').render(canonical)`        |

#### Files to Deprecate (but keep for compatibility)

| File                            | Reason                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| `services/xrechnung/builder.ts` | Replaced by `cii-renderer.ts` — keep as fallback during transition |
| `services/xrechnung/types.ts`   | Replaced by `domain/canonical-invoice.ts`                          |

#### Backward Compatibility

- API contract unchanged
- Generated XML should be byte-equivalent to current output for existing data
- New fields (allowances, credit notes) produce new XML elements only when populated
- Feature flag: `RENDERER_VERSION=v2` to switch between old/new renderer

#### Testing Requirements

- **Golden master test:** For each existing test invoice, old builder and new renderer must produce identical XML
- New renderer tests: allowance/charge elements, credit note type codes, multiple payment means
- Profile registry tests: correct identifiers for each profile

---

### Phase 4: Integrate Validation Engine

**Goal:** Add structured validation pipeline that runs before XML rendering.

**Duration:** ~4-6 days

#### Files to Introduce

| File                                          | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `validation/validation-pipeline.ts`           | Orchestrate schema → business → profile → (optional) XML validation |
| `validation/validation-result.ts`             | `ValidationError` and `ValidationResult` types                      |
| `validation/schema-validator.ts`              | Required field checks, type checks, range checks                    |
| `validation/business-rules.ts`                | BR-CO-10 to BR-CO-16 (monetary cross-checks)                        |
| `validation/profile-rules/xrechnung-rules.ts` | All BR-DE rules                                                     |
| `tests/unit/validation-pipeline.test.ts`      | Full pipeline tests                                                 |
| `tests/unit/xrechnung-rules.test.ts`          | Each BR-DE rule individually                                        |

#### Files to Modify

| File                                      | Change                                        |
| ----------------------------------------- | --------------------------------------------- |
| `services/xrechnung/xrechnung.service.ts` | Run validation pipeline BEFORE rendering      |
| `services/xrechnung/validator.ts`         | Deprecate in favor of `validation/` modules   |
| `app/api/invoices/convert/route.ts`       | Return structured validation errors to client |
| `messages/en.json` + `messages/de.json`   | Add i18n keys for each validation error       |

#### Backward Compatibility

- API response gains `validationErrors` array with structured objects (additive)
- Old `validationErrors: string[]` format still populated for backward compat
- Validation is "report all errors" mode (not fail-fast)

#### Testing Requirements

- Each BR-DE rule: positive and negative test
- Each BR-CO rule: boundary cases
- Pipeline integration: invoice with 5 errors → all 5 reported
- Performance: validation of 100-item invoice < 50ms

---

### Phase 5: Activate XRechnung Compliance Mode

**Goal:** All P0 and P1 gaps resolved. System generates Schematron-valid XRechnung CII.

**Duration:** ~3-5 days

#### Files to Modify

| File                                    | Change                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `lib/extraction-prompt.ts`              | Request: document type, tax category, buyer reference, invoice period, seller VAT ID vs tax number, payment means code           |
| `lib/extraction-normalizer.ts`          | Normalize new fields, map tax categories                                                                                         |
| `types/index.ts`                        | Add all new optional fields to `ExtractedInvoiceData`                                                                            |
| `components/forms/invoice-review/*`     | Add form fields: document type, buyer reference (Leitweg-ID), invoice period, payment means selector, tax category per line item |
| `messages/en.json` + `messages/de.json` | Labels for new form fields                                                                                                       |
| `rendering/cii/cii-renderer.ts`         | Generate all new XML elements (allowances, charges, credit note refs, periods)                                                   |

#### Files to Introduce

| File                            | Purpose                            |
| ------------------------------- | ---------------------------------- |
| `domain/unit-codes.ts`          | UN/ECE Rec 20 unit code vocabulary |
| `domain/payment-means-codes.ts` | UNCL4461 payment means vocabulary  |
| `domain/tax-category-codes.ts`  | UNCL5305 tax category vocabulary   |

#### Backward Compatibility

- All new extraction fields are optional (existing data unaffected)
- New form fields have sensible defaults
- Feature flag: `STRICT_COMPLIANCE=true` to enforce all rules (can be off initially)

#### Testing Requirements

- **End-to-end golden master:** 5 test PDFs → extract → review → convert → validate with KoSIT
- Credit note scenario: negative amounts, type 381, preceding reference
- Reverse charge scenario: AE tax category, 0% rate
- Intra-community scenario: K tax category
- Maximum complexity: 50 line items, 4 tax rates, 2 allowances, 1 charge

---

### Phase Summary

| Phase     | Focus               | Duration       | P0 Fixed          | P1 Fixed      | P2 Fixed         |
| --------- | ------------------- | -------------- | ----------------- | ------------- | ---------------- |
| **1**     | Monetary stability  | 3-5 days       | 3 (P0-3,4,8)      | 2 (P1-7,8)    | 0                |
| **2**     | Canonical model     | 5-7 days       | 2 (P0-1,7)        | 0             | 2 (P2-1,6)       |
| **3**     | Renderer decoupling | 5-7 days       | 0                 | 1 (P1-10)     | 3 (P2-2,5,7)     |
| **4**     | Validation engine   | 4-6 days       | 1 (P0-8 hardened) | 0             | 2 (P2-3,4)       |
| **5**     | Full compliance     | 3-5 days       | 2 (P0-2,5,6)      | 7 (P1-1..6,9) | 1 (P2-8 partial) |
| **Total** |                     | **20-30 days** | **8/8**           | **10/10**     | **8/8**          |

---

## 10. Regression-Safe Testing Strategy

### 10.1 Test Categories

| Category                      | Purpose                          | Tool                     | Count Target          |
| ----------------------------- | -------------------------------- | ------------------------ | --------------------- |
| **Golden Master**             | PDF → Canonical → XML end-to-end | Vitest + snapshot        | 10 test invoices      |
| **Monetary Precision**        | Arithmetic edge cases            | Vitest                   | 30+ assertions        |
| **Tax Breakdown**             | Multi-VAT-rate grouping          | Vitest                   | 15 scenarios          |
| **Allowance/Charge**          | Document + line level            | Vitest                   | 10 scenarios          |
| **Credit Note**               | Negative amounts, type 381       | Vitest                   | 5 scenarios           |
| **Rounding Edge Cases**       | 0.005 boundary, large invoices   | Vitest                   | 20 assertions         |
| **Invalid Invoice Detection** | Missing fields, bad data         | Vitest                   | 15 scenarios          |
| **BR-DE Rules**               | Each rule individually           | Vitest                   | 23 tests (1 per rule) |
| **BR-CO Rules**               | Monetary cross-checks            | Vitest                   | 16 tests (1 per rule) |
| **XML Structure**             | Element presence/order/namespace | Vitest + string matching | 20 assertions         |
| **Profile Switching**         | CII vs UBL from same canonical   | Vitest                   | 5 tests               |

### 10.2 Golden Master Test Approach

```typescript
// tests/golden-master/invoice-pipeline.test.ts

describe('Golden Master: PDF → Canonical → XML', () => {
  const testInvoices = [
    'simple-single-rate-19pct',
    'mixed-rate-19-7-0',
    'credit-note-381',
    'reverse-charge-AE',
    'intra-community-K',
    'with-allowances-charges',
    'minimal-required-fields-only',
    'maximum-complexity-50-items',
    'international-buyer-FR',
    'zero-tax-exempt-E',
  ];

  for (const testCase of testInvoices) {
    it(`should produce stable XML for ${testCase}`, () => {
      const input = loadTestData(`${testCase}.json`);
      const canonical = mapExtractedToCanonical(input);
      const validation = validationPipeline.validate(canonical, 'xrechnung-3.0-cii');
      expect(validation.valid).toBe(true);

      const xml = rendererFactory.createRenderer('xrechnung-3.0-cii').render(canonical);

      expect(xml).toMatchSnapshot();
    });
  }
});
```

### 10.3 Monetary Precision Tests

```typescript
describe('Monetary Calculator', () => {
  it('handles IEEE 754 problem pair 0.1 + 0.2', () => {
    expect(add(0.1, 0.2)).toBe(0.3); // NOT 0.30000000000000004
  });

  it('rounds 19% of 33.33 correctly', () => {
    expect(computeTax(33.33, 19)).toBe(6.33); // NOT 6.3327
  });

  it('accumulates 100 items without drift', () => {
    const items = Array(100).fill({ netAmount: 33.33, taxRate: 19 });
    const total = sumLineAmounts(items);
    expect(total).toBe(3333.0);
    const tax = computeTotalTax(items);
    expect(tax).toBe(633.27);
  });

  it('cross-checks: sum(lines) = subtotal', () => {
    // BR-CO-10
    const invoice = createTestInvoice([
      { amount: 100, rate: 19 },
      { amount: 200, rate: 7 },
    ]);
    const canonical = mapExtractedToCanonical(invoice);
    expect(canonical.totals.sumOfLineNetAmounts.amount).toBe(300);
  });
});
```

### 10.4 Validation Rule Tests

```typescript
describe('BR-DE Rules', () => {
  it('BR-DE-2: rejects invoice without seller contact', () => {
    const invoice = createValidCanonical();
    invoice.seller.contact = undefined;
    const result = validate(invoice, 'xrechnung-3.0-cii');
    expect(result.errors).toContainEqual(expect.objectContaining({ ruleId: 'BR-DE-2' }));
  });

  it('BR-DE-15: accepts invoice with Leitweg-ID', () => {
    const invoice = createValidCanonical();
    invoice.buyerReference = '04011000-12345-67';
    const result = validate(invoice, 'xrechnung-3.0-cii');
    expect(result.errors.filter((e) => e.ruleId === 'BR-DE-15')).toHaveLength(0);
  });

  it('BR-DE-23-a: rejects TypeCode=58 without IBAN', () => {
    const invoice = createValidCanonical();
    invoice.paymentMeans = [{ typeCode: 58 }]; // No IBAN
    const result = validate(invoice, 'xrechnung-3.0-cii');
    expect(result.errors).toContainEqual(expect.objectContaining({ ruleId: 'BR-DE-23-a' }));
  });
});
```

### 10.5 Continuous Integration Integration

```yaml
# Addition to existing GitHub Actions workflow
- name: Run compliance tests
  run: npx vitest run tests/golden-master tests/unit/validation tests/unit/monetary

- name: Type check (including new domain types)
  run: npx tsc --noEmit

- name: Coverage check (maintain 60% threshold)
  run: npx vitest run --coverage
```

---

## Appendix A: File Impact Matrix

| File                                          | Phase 1 | Phase 2 | Phase 3   | Phase 4   | Phase 5 |
| --------------------------------------------- | ------- | ------- | --------- | --------- | ------- |
| `types/index.ts`                              | —       | Modify  | —         | —         | Modify  |
| `lib/extraction-prompt.ts`                    | Modify  | —       | —         | —         | Modify  |
| `lib/extraction-normalizer.ts`                | Modify  | —       | —         | —         | Modify  |
| `lib/constants.ts`                            | Modify  | —       | —         | —         | Modify  |
| `lib/monetary-validator.ts`                   | **New** | —       | —         | —         | —       |
| `domain/canonical-invoice.ts`                 | —       | **New** | —         | —         | —       |
| `domain/invoice-mapper.ts`                    | —       | **New** | —         | —         | Modify  |
| `domain/monetary-calculator.ts`               | —       | **New** | —         | —         | —       |
| `domain/tax-engine.ts`                        | —       | **New** | —         | —         | —       |
| `rendering/profile-registry.ts`               | —       | —       | **New**   | —         | —       |
| `rendering/renderer-factory.ts`               | —       | —       | **New**   | —         | —       |
| `rendering/cii/cii-renderer.ts`               | —       | —       | **New**   | —         | Modify  |
| `rendering/ubl/ubl-renderer.ts`               | —       | —       | **New**   | —         | Modify  |
| `validation/validation-pipeline.ts`           | —       | —       | —         | **New**   | —       |
| `validation/business-rules.ts`                | —       | —       | —         | **New**   | —       |
| `validation/profile-rules/xrechnung-rules.ts` | —       | —       | —         | **New**   | —       |
| `services/xrechnung/xrechnung.service.ts`     | —       | Modify  | Modify    | Modify    | —       |
| `services/xrechnung/validator.ts`             | Modify  | —       | —         | Deprecate | —       |
| `services/xrechnung/builder.ts`               | Modify  | —       | Deprecate | —         | —       |
| `services/review.service.ts`                  | Modify  | —       | —         | —         | —       |
| `app/api/invoices/convert/route.ts`           | —       | Modify  | —         | Modify    | —       |
| `components/forms/invoice-review/*`           | —       | —       | —         | —         | Modify  |
| `messages/en.json`                            | —       | —       | —         | Modify    | Modify  |
| `messages/de.json`                            | —       | —       | —         | Modify    | Modify  |

## Appendix B: EN 16931 Business Term Quick Reference

| BT/BG    | Name                    | Required?     | Current Status               |
| -------- | ----------------------- | ------------- | ---------------------------- |
| BT-1     | Invoice number          | ✅            | ✅ Mapped                    |
| BT-2     | Issue date              | ✅            | ✅ Mapped                    |
| BT-3     | Type code               | ✅            | ⚠️ Hardcoded 380             |
| BT-5     | Currency code           | ✅            | ✅ Mapped                    |
| BT-9     | Payment due date        | Conditional   | ✅ Mapped                    |
| BT-10    | Buyer reference         | ✅ XRechnung  | ✅ Mapped (fallback)         |
| BT-20    | Payment terms           | Conditional   | ✅ Mapped                    |
| BT-22    | Invoice note            | Optional      | ❌ Not mapped                |
| BT-25    | Preceding invoice ref   | Cond (credit) | ❌ Not mapped                |
| BT-31    | Seller VAT ID           | ✅            | ⚠️ No scheme separation      |
| BT-34    | Seller electronic addr  | ✅ XRechnung  | ❌ Not mapped at party level |
| BT-40    | Seller country          | ✅            | ✅ Mapped                    |
| BT-44    | Buyer name              | ✅            | ✅ Mapped                    |
| BT-48    | Buyer VAT ID            | Conditional   | ❌ Not mapped to XML         |
| BT-49    | Buyer electronic addr   | ✅ XRechnung  | ⚠️ Optional                  |
| BT-73/74 | Invoice period          | Conditional   | ❌ Not mapped                |
| BT-81    | Payment means code      | ✅            | ⚠️ Hardcoded 58              |
| BT-84    | IBAN                    | Cond (bank)   | ⚠️ Warning only              |
| BG-23    | Tax breakdown           | ✅            | ✅ Grouping works            |
| BG-20/21 | Doc allowances/charges  | Optional      | ❌ Not supported             |
| BG-27/28 | Line allowances/charges | Optional      | ❌ Not supported             |

---

_End of EN 16931 Compliance Transformation Plan_
