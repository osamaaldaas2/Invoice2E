# Product Requirement Document (PRD)
## Invoice2E - AI-Powered Invoice to XRechnung Converter

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Status** | Active Development (Phases 1-3 Complete) |
| **Target Market** | German SMEs, Freelancers, Enterprises |

---

## 1. Executive Summary

### 1.1 Product Vision
Invoice2E transforms traditional invoices (PDF, JPG, PNG) into German-compliant XRechnung (EN16931) and UBL 2.1 electronic invoice formats using AI-powered data extraction.

### 1.2 Problem Statement
German businesses face mandatory e-invoicing requirements for public sector contracts (XRechnung). Manual conversion is:
- Time-consuming and error-prone
- Requires technical knowledge of XML standards
- Expensive when using traditional ERP solutions

### 1.3 Proposed Solution
A web-based SaaS platform that:
1. Accepts invoice images/PDFs
2. Extracts data using AI (Gemini/DeepSeek)
3. Generates compliant XRechnung 3.0 or UBL 2.1 XML
4. Validates against official BR-DE rules
5. Delivers via download or email

### 1.4 Success Criteria
- [ ] 95%+ extraction accuracy on standard invoices
- [ ] 100% BR-DE compliance for generated XRechnung
- [ ] < 30 second processing time per invoice
- [ ] 99.9% uptime SLA

---

## 2. Product Overview

### 2.1 Target Users

| User Type | Description | Key Needs |
|-----------|-------------|-----------|
| Freelancers | Individual contractors | Simple, affordable conversion |
| SME Accountants | Small/medium business staff | Bulk processing, templates |
| Enterprise Users | Large organization teams | API access, integrations, analytics |
| Developers | Technical integrators | API documentation, SDKs |

### 2.2 User Journey
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Upload    │───▶│  AI        │───▶│   Review    │───▶│  Download   │
│   Invoice   │    │  Extract   │    │   & Edit    │    │  XRechnung  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     PDF/JPG         Gemini AI        Verify data        XML/ZIP output
```

---

## 3. Functional Requirements

### 3.1 Phase 1: Core Pipeline ✅ COMPLETE

| ID | Feature | Description | Source File |
|----|---------|-------------|-------------|
| F1.1 | User Authentication | Email/password signup & login | `services/auth.service.ts` |
| F1.2 | File Upload | Accept PDF, JPG, PNG (max 10MB) | `components/forms/FileUploadForm.tsx` |
| F1.3 | AI Extraction | Gemini Vision API data extraction | `services/gemini.service.ts` |
| F1.4 | Data Review Form | Edit extracted data before conversion | `components/forms/InvoiceReviewForm.tsx` |
| F1.5 | XRechnung Generation | EN16931/XRechnung 3.0 CII format | `services/xrechnung.service.ts` |
| F1.6 | XML Download | Download generated XRechnung file | API route `/api/invoices/convert` |

**XRechnung Compliance (BR-DE Rules):**
- BR-DE-2: Seller contact mandatory
- BR-DE-3/4: Seller city & postal code required
- BR-DE-15: Buyer reference (Leitweg-ID) mandatory
- BR-DE-21: XRechnung 3.0 specification identifier
- BR-DE-23-a: IBAN required for bank transfer

### 3.2 Phase 2: User Management ✅ COMPLETE

| ID | Feature | Description | Source File |
|----|---------|-------------|-------------|
| F2.1 | Credit System | Purchase-based usage model | `services/credits.db.service.ts` |
| F2.2 | Dashboard | User activity & credit display | `app/[locale]/dashboard/page.tsx` |
| F2.3 | Conversion History | Track past conversions | `services/analytics.service.ts` |
| F2.4 | Multi-language | German/English i18n support | `messages/de.json`, `messages/en.json` |

### 3.3 Phase 3: Validation ✅ COMPLETE

| ID | Feature | Description | Source File |
|----|---------|-------------|-------------|
| F3.1 | XSD Validation | XML schema validation | Planned |
| F3.2 | Schematron Rules | BR-DE business rule validation | Planned |
| F3.3 | Validation Report | Display errors/warnings | `components/forms/InvoiceReviewForm.tsx` |

### 3.4 Phase 4: Premium Features 🔄 IN PROGRESS

| ID | Feature | Description | Source File |
|----|---------|-------------|-------------|
| F4.1 | Payment Integration | Stripe + PayPal credit purchase | `services/payment-processor.ts` |
| F4.2 | UBL 2.1 Format | Alternative to CII format | `services/ubl.service.ts` |
| F4.3 | Bulk Upload | Up to 100 PDFs in ZIP archive | `services/batch.service.ts` |
| F4.4 | Invoice Templates | Save/reuse seller/buyer info | `services/template.db.service.ts` |
| F4.5 | Analytics Dashboard | Charts, stats, export | `services/analytics.service.ts` |
| F4.6 | Email Delivery | Send XRechnung via email | `services/email.service.ts` |
| F4.7 | AI Provider Selection | Gemini or DeepSeek options | `services/ai/extractor.factory.ts` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Invoice Processing | < 30 sec | AI extraction + generation |
| Page Load (LCP) | < 2.5 sec | Next.js optimization |
| API Response | < 500 ms | Excluding AI processing |
| Concurrent Users | 100+ | Vercel serverless scaling |

### 4.2 Scalability
- **Horizontal scaling** via Vercel serverless functions
- **Database scaling** via Supabase managed PostgreSQL
- **File storage** via Supabase Storage (S3-compatible)
- **Batch processing** up to 100 files per job

### 4.3 Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | JWT tokens via Supabase Auth |
| Authorization | Row-Level Security (RLS) policies |
| Data Encryption | TLS 1.3 in transit, AES-256 at rest |
| API Security | Rate limiting, input validation |
| Secrets Management | Environment variables (Vercel) |

### 4.4 Compliance
- **XRechnung 3.0** (urn:xeinkauf.de:kosit:xrechnung_3.0)
- **EN16931** European e-invoicing standard
- **PEPPOL BIS 3.0** for international compatibility
- **GDPR** data protection (user data residency in EU)

### 4.5 Availability
- **Target SLA**: 99.9% uptime
- **Disaster Recovery**: Daily database backups
- **CDN**: Vercel Edge Network global distribution

---

## 5. Credit Packages (Phase 4)

| Package | Credits | Price (EUR) | Per Credit | Discount |
|---------|---------|-------------|------------|----------|
| Starter | 10 | €5.00 | €0.50 | - |
| Basic | 50 | €20.00 | €0.40 | 20% |
| Professional | 100 | €35.00 | €0.35 | 30% |
| Enterprise | 500 | €150.00 | €0.30 | 40% |

**Credit Usage:**
- 1 credit = 1 invoice conversion
- Credits checked at upload (Phase 4)
- Credits deducted after successful conversion

---

## 6. Extracted Data Fields

The AI extraction captures the following invoice data:

```typescript
interface ExtractedInvoiceData {
    // Invoice Identification
    invoiceNumber: string;
    invoiceDate: string; // YYYY-MM-DD
    
    // Buyer (Customer)
    buyerName: string;
    buyerEmail: string;
    buyerAddress: string;
    buyerTaxId: string;
    
    // Seller (Supplier)
    sellerName: string;
    sellerEmail: string;
    sellerAddress: string;
    sellerTaxId: string;
    
    // Line Items
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        taxRate?: number;
    }>;
    
    // Totals
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    
    // Additional
    paymentTerms: string;
    notes: string;
    confidence: number; // AI confidence score
}
```

---

## 7. System Constraints

### 7.1 File Constraints
| Constraint | Value |
|------------|-------|
| Max file size | 10 MB |
| Supported formats | PDF, JPG, JPEG, PNG |
| Max bulk upload | 100 files per ZIP |
| Max templates per user | 50 |

### 7.2 Rate Limits
| Resource | Limit |
|----------|-------|
| API requests | 100/minute per user |
| AI extractions | Based on credits |
| File uploads | 10/minute per user |

### 7.3 Technical Constraints
- Next.js 14 with App Router
- Supabase PostgreSQL (managed)
- Vercel deployment (serverless)
- Gemini API timeout: 60 seconds

---

## 8. Dependencies

### 8.1 External Services

| Service | Purpose | Status |
|---------|---------|--------|
| Google Gemini API | AI invoice extraction | ✅ Active |
| DeepSeek API | Alternative AI provider | ✅ Active |
| Supabase | Database, Auth, Storage | ✅ Active |
| Stripe | Credit card payments | 🔄 Phase 4 |
| PayPal | Alternative payment | 🔄 Phase 4 |
| SendGrid | Email delivery | 🔄 Phase 4 |
| KoSIT Validator | Official XRechnung validation | 🔄 Phase 4 |

### 8.2 Build Dependencies
See [package.json](file:///c:/Users/osama/Desktop/Invoice2E.1/package.json) for complete list:
- Next.js 14.2
- React 18.2
- TypeScript 5.3
- Tailwind CSS 3.3
- Zod (validation)
- React Hook Form
- Zustand (state)
- React Query

---

## 9. Roadmap

### Current Status: Phase 3 Complete

```
Phase 1 ███████████ 100% - Core Pipeline
Phase 2 ███████████ 100% - User Management  
Phase 3 ███████████ 100% - Validation
Phase 4 ████░░░░░░░  40% - Premium Features
```

### Phase 4 Milestones
| Milestone | Target | Status |
|-----------|--------|--------|
| Payment Integration | Q1 2026 | 🔄 In Progress |
| UBL Format Support | Q1 2026 | ✅ Complete |
| Bulk Upload | Q1 2026 | ✅ Complete |
| Templates | Q1 2026 | ✅ Complete |
| Analytics Dashboard | Q2 2026 | ✅ Complete |
| Email Delivery | Q2 2026 | ✅ Complete |
| KoSIT Integration | Q2 2026 | 🔄 In Progress |

---

## 10. Success Metrics

### 10.1 Business Metrics
- Monthly Active Users (MAU)
- Conversion volume (invoices/month)
- Revenue (credit purchases)
- Customer retention rate

### 10.2 Technical Metrics
- Extraction accuracy rate
- XRechnung validation pass rate
- Average processing time
- System uptime percentage

### 10.3 User Experience Metrics
- Time to first conversion
- Form completion rate
- Error rate per session
- NPS score

---

## Document References

| Document | Path |
|----------|------|
| Architecture | [02-architecture/01-software-architecture.md](./02-architecture/01-software-architecture.md) |
| Technical Design | [02-architecture/02-technical-design.md](./02-architecture/02-technical-design.md) |
| API Reference | [03-development/02-api-reference.md](./03-development/02-api-reference.md) |
| Database Schema | [02-architecture/03-database.md](./02-architecture/03-database.md) |
