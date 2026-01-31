# Invoice2E - Comprehensive Requirements Document

**Project Name:** Invoice2E  
**Domain:** Invoice2E.de  
**Language:** English & German (Deutsch)  
**Target Audience:** SMBs (Small & Medium Businesses), Government Agencies  
**Timeline:** 1 Month (4 Weeks)  
**Status:** In Requirements Phase

---

## 1. Executive Summary

Invoice2E is a web-based invoice conversion platform that transforms standard PDF/JPG/PNG invoices into compliant digital e-invoice formats. The system extracts invoice data using Google Gemini AI, allows user review/correction, validates using KoSIT validator, and converts to multiple format standards (XRechnung 3.0, UBL 2.1, EN 16931, UN/CEFACT CII).

**USP (Unique Selling Point):**
- No software subscriptions or expensive contracts required
- Single-file upload to multi-format conversion
- AI-powered accuracy with human verification
- German e-invoice compliance (XRechnung 3.0)
- Fast processing (5-7 seconds per invoice)

---

## 2. Project Scope

### 2.1 MVP (Minimum Viable Product) - Phase 1 (4 Weeks)

**Core Feature:** Invoice Conversion Pipeline
1. PDF/Image upload (JPG, PNG)
2. AI-powered data extraction (Gemini)
3. User review/correction interface
4. Validation (KoSIT validator)
5. Format conversion (CII/UBL selection)
6. File download

**Supported Platforms:**
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Android)
- Tablets (iPad, Android tablets)
- Responsive design for all screen sizes

**Out of Scope for MVP:**
- Admin dashboard
- Advanced analytics
- API access for third-party integrations
- Batch processing
- OCR for handwritten invoices

### 2.2 Future Phases (Post-MVP)

- Admin dashboard
- Advanced user analytics
- API for enterprise customers
- Batch invoice processing
- Multi-format export options
- Invoice templates library
- Integration with accounting software

---

## 3. User Stories & Features

### 3.1 Authentication & Profile

**US-1: User Signup**
- User signs up with email and password
- Email verification required
- User profile with:
  - First name, Last name
  - Address (street, postal code, city, country)
  - Phone number
  - Tax ID (optional)
  - Email for notifications

**US-2: User Login**
- Email/password authentication
- Persistent session (token-based)
- "Forgot Password" functionality

**US-3: User Dashboard**
- View available credits
- View credit usage history
- View past conversions (invoice number, buyer name, date, format)
- Update profile information
- View payment history

---

### 3.2 Core Conversion Feature

**US-4: Invoice Upload**
- Drag-and-drop or file picker
- Supported formats: PDF, JPG, PNG
- File size limit: 25MB
- Progress indicator during upload

**US-5: Data Extraction (AI)**
- Gemini API extracts structured data
- Fields extracted:
  - Invoice number & issue date
  - Seller info (name, address, tax ID, email, bank details)
  - Buyer info (name, address, routing ID)
  - Line items (description, quantity, unit price, VAT)
  - Totals (net, VAT, gross amounts)
  - Payment terms & delivery date
  - Currency (default EUR)

**US-6: Data Review & Correction**
- Display extracted data in editable form fields
- User can review accuracy
- User can correct any field
- Show original PDF on one side, extracted data on other
- Inline validation while editing
- Submit for validation

**US-7: Invoice Validation**
- KoSIT validator integration (XRechnung 3.0 compliance)
- Display validation results:
  - Valid / Invalid status
  - List of errors (if any)
  - List of warnings
  - Detailed validation report
- On failure: Show specific fields that caused error
- Option to retry after correction

**US-8: Format Selection & Conversion**
- User selects format: CII (CEFACT) or UBL 2.1
- System validates against selected format
- Conversion to XML/target format
- Generates downloadable file
- File expires after 24 hours

**US-9: File Download & Email**
- ✅ Automatic immediate download to browser (no click needed)
- File is generated in memory, not stored on server
- User receives XML file immediately in browser
- Email with XML attachment sent simultaneously to user's email
- File automatically deleted from memory after both complete
- No server storage (cost & GDPR optimization)
- Success message: "✅ File downloaded + Email sent to your@email.com"
- User can also download again from email if needed

---

### 3.3 Credits/Points System

**US-10: Credits Purchase**
- Packages: 10, 50, 100 credits (pricing TBD)
- Discount tiers for larger packages
- Multiple payment methods: PayPal, Credit Card (Stripe)
- Credits valid for 1 year from purchase
- Receipt email after purchase

**US-11: Credits Usage**
- 1 credit = 1 invoice conversion
- Credit deducted after successful conversion
- Display available credits in header
- Warning if insufficient credits (before conversion)
- Purchase more credits inline option

---

### 3.4 Landing Page & Public Sections

**US-12: Landing Page**
- Clear value proposition
- Feature highlights
- Pricing information
- Call-to-action buttons
- Statistics (number of conversions processed)

**US-13: Pricing Page**
- Clear credit package pricing
- Feature comparison table
- FAQ section
- Contact CTA

**US-14: About Page**
- Company mission
- Features overview
- Legal compliance info

**US-15: Contact Page**
- Contact form
- Email address
- Support request handling

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Invoice Processing Time | 5-7 seconds per invoice |
| PDF Upload Time | <2 seconds for typical invoice (1-5 MB) |
| Page Load Time | <2 seconds (desktop), <3 seconds (mobile) |
| Form Response Time | <100ms |
| Validation Response | <2 seconds |
| Conversion Response | <1 second |
| API Response Time (p95) | <500ms |
| Database Query Response | <100ms average |

### 4.2 Scalability

- Expected concurrent users (MVP phase): Unknown (market gap indicates high demand)
- Database: Supabase (auto-scaling)
- File storage: Not stored (cost optimization)
- Signed download URLs: 24-hour expiry
- Queue system for high volume: Consider for Phase 2

### 4.3 Security (MVP - Simplified)

- **Data Protection:**
  - No sensitive invoice data stored (only invoice number + buyer name for history)
  - GDPR compliant
  - Encrypted connection (HTTPS only)
  - Input validation on all fields
  - SQL injection prevention

- **Authentication & Authorization (Simple):**
  - Password hashing (bcrypt)
  - JWT tokens for API authentication
  - Access token expiry: 1 hour
  - Refresh token expiry: 7 days
  - Session management via Supabase Auth
  - Basic logout functionality

- **File Handling:**
  - File size validation (max 25MB)
  - MIME type validation
  - Secure temporary file deletion after processing

- **Compliance:**
  - GDPR compliance
  - German data protection laws
  - No payment card data stored (Stripe/PayPal handles PCI-DSS)
  - Basic action logging for audit trail

**Advanced Security (Phase 2 & Beyond):**
  - Device fingerprinting
  - Token rotation
  - Rate limiting per IP
  - Email notifications for suspicious activity
  - Two-factor authentication
  - Advanced audit logs with detailed analytics

### 4.4 Reliability

- Uptime: 99.5% (with Vercel + Supabase)
- Error recovery: Automatic retry for transient failures
- Data backup: Supabase handles automated backups
- Status page: Public status dashboard

### 4.5 Accessibility

- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader friendly
- Color contrast ratio: WCAG AA minimum
- Responsive design: Mobile-first approach

### 4.6 Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile: iOS Safari (iOS 14+), Chrome Android (latest)

---

## 5. Data Requirements

### 5.1 User Data Stored

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "password_hash": "bcrypted",
  "first_name": "John",
  "last_name": "Doe",
  "address": {
    "street": "Hauptstraße 123",
    "postal_code": "10115",
    "city": "Berlin",
    "country": "DE"
  },
  "phone": "+49 30 123456",
  "tax_id": "DE123456789",
  "created_at": "2024-01-30T10:00:00Z",
  "updated_at": "2024-01-30T10:00:00Z"
}
```

### 5.2 Credits Data Stored

```json
{
  "user_id": "uuid",
  "available_credits": 50,
  "credits_expiry_date": "2025-01-30T00:00:00Z",
  "usage_history": [
    {
      "invoice_number": "INV-2024-001",
      "credits_used": 1,
      "conversion_date": "2024-01-25T14:30:00Z",
      "format": "CII"
    }
  ]
}
```

### 5.3 Payment Data Stored

```json
{
  "transaction_id": "uuid",
  "user_id": "uuid",
  "stripe_payment_id": "pi_123456",
  "amount": 9.99,
  "currency": "EUR",
  "credits_purchased": 10,
  "payment_method": "card",
  "status": "completed",
  "created_at": "2024-01-25T14:30:00Z"
}
```

### 5.4 Invoice Conversion History (Minimal Storage)

```json
{
  "conversion_id": "uuid",
  "user_id": "uuid",
  "invoice_number": "INV-2024-001",
  "buyer_name": "ABC Company GmbH",
  "conversion_date": "2024-01-25T14:30:00Z",
  "format": "CII",
  "validation_status": "valid",
  "conversion_status": "completed"
}
```

### 5.5 Data NOT Stored

- Invoice content/lines (after conversion)
- Invoice PDF/images (deleted after processing)
- Seller/buyer details from invoice
- Bank account details
- Line item details
- Payment terms details

---

## 6. Technical Requirements

### 6.1 Frontend Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js | 14.x |
| React | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | TailwindCSS + shadcn/ui | - |
| State Management | TanStack Query + Zustand | - |
| Form Handling | React Hook Form + Zod | - |
| File Upload | React Dropzone | - |
| PDF Processing | pdf-lib, pdfjs-dist | - |
| Image Processing | Sharp (server), Canvas (client) | - |
| HTTP Client | Axios | - |
| i18n | next-intl | - |
| Icons | Lucide React | - |

### 6.2 Backend Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend | Next.js API Routes | Full-stack |
| Database | Supabase (PostgreSQL) | Managed |
| Auth | Supabase Auth | OAuth + Email/Password |
| File Storage | Temporary (deleted after use) | No persistence |
| AI/ML | Google Gemini API | Data extraction |
| Validation | KoSIT Validator (JAR) | XRechnung validation |
| Payments | Stripe + PayPal | Credit card & PayPal |
| Email | SendGrid | Transactional emails |
| Hosting | Vercel | Serverless deployment |
| CDN | Vercel Edge Network | Global distribution |
| Monitoring | Sentry + Vercel Analytics | Error tracking & performance |

### 6.3 External APIs

| Service | Purpose | API Type |
|---------|---------|----------|
| Google Gemini API | Invoice data extraction | REST API |
| Stripe API | Payment processing | REST API |
| PayPal API | Payment processing | REST API |
| SendGrid API | Email sending | REST API |
| Supabase | Database + Auth | REST + Real-time |

---

## 7. API Endpoints Summary

### Authentication
```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/verify-email
POST /api/auth/refresh-token
POST /api/auth/forgot-password
```

### Invoice Processing
```
POST /api/invoices/extract
POST /api/invoices/review
POST /api/invoices/validate
POST /api/invoices/convert
GET /api/invoices/history
```

### User Profile
```
GET /api/user/profile
PUT /api/user/profile
GET /api/user/credits
```

### Payments
```
POST /api/payments/create-checkout
POST /api/payments/webhook
GET /api/payments/history
```

### System Health
```
GET /api/health
GET /api/status
```

---

## 8. Localization

### Supported Languages
- English (en)
- German (de)

### Localized Content
- UI labels and buttons
- Error messages
- Success messages
- Help text
- Email templates
- Landing page content
- Legal documents (Terms, Privacy - future)

### Implementation
- URL-based routing: `/en/...` and `/de/...`
- Language selector in header
- Persistent language preference (localStorage)
- Backend returns localized emails

---

## 9. Compliance & Legal

### 9.1 Regulatory Compliance

- **GDPR:** EU data protection regulation compliance
- **German Law:** Compliance with German e-invoice standards
- **XRechnung 3.0:** Official German CIUS standard
- **Payment Card Industry (PCI):** Handled by Stripe/PayPal

### 9.2 Standards & Specifications

- **EN 16931:** European standard for e-invoicing
- **XRechnung 3.0.x:** German CIUS implementation
- **UBL 2.1:** Universal Business Language standard
- **UN/CEFACT CII D16B:** Cross Industry Invoice format

### 9.3 Data Retention

- User profile: Until account deletion
- Credit transactions: 10 years (legal requirement)
- Conversion history: 10 years
- Email logs: 1 year
- Audit logs: 1 year

### 9.4 Required Legal Documents (Phase 2)

- Terms of Service
- Privacy Policy
- Cookie Policy
- Data Processing Agreement (DPA)
- Disclaimer

---

## 10. Project Timeline (1 Month)

### Week 1: Foundation & Setup
- Next.js project setup with all dependencies
- Database schema creation & migration
- Authentication implementation (Supabase)
- Initial UI components (shadcn/ui setup)
- Environment configuration

### Week 2: Core Feature - Part 1
- Invoice upload component
- Gemini API integration
- Data extraction pipeline
- Data review/correction form
- Testing extraction accuracy

### Week 3: Core Feature - Part 2
- KoSIT validator integration
- Format conversion (CII/UBL)
- File generation
- Payment integration (Stripe)
- Credit system implementation

### Week 4: Polish & Deployment
- UI/UX refinement
- Performance optimization
- Testing (unit, integration, E2E)
- Localization (English, German)
- Deployment to production (Vercel)
- Documentation

---

## 11. Success Criteria

### Technical Success
- ✅ Invoice conversion success rate: 95%+ (validation pass)
- ✅ Processing time: 5-7 seconds average
- ✅ Page load time: <2 seconds (desktop), <3 seconds (mobile)
- ✅ Uptime: 99%+ during first month
- ✅ Zero data loss
- ✅ GDPR compliant
- ✅ Full responsive design

### User Experience Success
- ✅ Intuitive conversion process (3 clicks to convert)
- ✅ Clear error messages
- ✅ Fast payment process
- ✅ Bilingual interface (English, German)
- ✅ Mobile-friendly

### Business Success
- ✅ Functional product ready for initial users
- ✅ Revenue generation via credit purchases
- ✅ Positive user feedback
- ✅ Foundation for scalability

---

## 12. Assumptions & Constraints

### Assumptions
1. Internet connection always available (online-only)
2. PDF invoices are in standard formats
3. Gemini API accuracy sufficient for initial launch
4. Supabase sufficient for MVP scale
5. No OCR needed for scanned invoices (initially)
6. Users will manually verify extracted data

### Constraints
1. 1-month development timeline
2. Single developer (you + AI agents)
3. Budget limited to tool subscriptions + hosting
4. No heavy infrastructure investment
5. MVP feature set only
6. No offline functionality
7. No payment card data storage (handled by Stripe/PayPal)
8. Limited file storage (no persistence)

---

## 13. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Gemini API accuracy issues | Medium | High | Manual review step, fallback to manual entry |
| KoSIT validator failures | Low | High | Comprehensive testing, error handling |
| Payment integration delays | Low | Medium | Use Stripe/PayPal proven integrations |
| Supabase capacity issues | Very Low | Medium | Supabase auto-scaling, monitoring |
| Regulatory compliance gaps | Low | High | Legal review Phase 2, compliance audit |
| User adoption slow | Medium | Medium | Strong product, good UX, marketing Phase 2 |

---

## 14. Deliverables

### Phase 1 Deliverables (End of Month)

1. **Functional Web Application**
   - Production-ready code
   - Deployed to Invoice2E.de
   - All MVP features working

2. **Documentation**
   - System Architecture Document
   - Database Schema Document
   - API Specification
   - Deployment Guide
   - User Documentation
   - Admin Guide

3. **Testing**
   - Unit test coverage: 80%+
   - Integration tests for core flows
   - Manual testing checklist
   - Performance testing results

4. **Monitoring & Analytics**
   - Error tracking (Sentry)
   - Performance monitoring
   - User analytics setup
   - Status dashboard

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-30  
**Next Review:** After Architecture Document completion
