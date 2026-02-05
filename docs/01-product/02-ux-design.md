# UX Design Documentation
## Invoice2E - Design System & User Experience

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Design System** | Tailwind CSS + Custom HSL Variables |
| **Frameworks** | React 18, Next.js 14 |

---

## 1. Design System

### 1.1 Color Palette

The design uses HSL-based CSS custom properties for consistent theming with light/dark mode support.

#### Light Mode Colors
| Token | HSL Value | Preview | Usage |
|-------|-----------|---------|-------|
| `--primary` | 221.2 83.2% 53.3% | Blue | Primary actions, links |
| `--primary-foreground` | 210 40% 98% | White | Text on primary |
| `--secondary` | 210 40% 96.1% | Light gray | Secondary buttons |
| `--destructive` | 0 84.2% 60.2% | Red | Errors, delete actions |
| `--muted` | 210 40% 96.1% | Light gray | Disabled, subtle |
| `--accent` | 210 40% 96.1% | Light gray | Hover states |
| `--background` | 0 0% 100% | White | Page background |
| `--foreground` | 222.2 84% 4.9% | Near black | Primary text |
| `--border` | 214.3 31.8% 91.4% | Light gray | Borders |

#### Dark Mode Colors
| Token | HSL Value | Preview | Usage |
|-------|-----------|---------|-------|
| `--primary` | 217.2 91.2% 59.8% | Bright blue | Primary actions |
| `--background` | 222.2 84% 4.9% | Near black | Page background |
| `--foreground` | 210 40% 98% | White | Primary text |
| `--muted` | 217.2 32.6% 17.5% | Dark gray | Subtle elements |

### 1.2 Typography

| Element | Tailwind Class | Example |
|---------|----------------|---------|
| H1 | `text-5xl font-bold` | Landing page hero |
| H2 | `text-2xl font-semibold` | Section headers |
| H3 | `text-xl font-bold` | Card titles |
| Body | `text-sm` | Default content |
| Muted | `text-sm text-muted-foreground` | Descriptions |

### 1.3 Spacing

| Size | Value | Usage |
|------|-------|-------|
| sm | `p-3`, `gap-2` | Compact spacing |
| md | `p-4`, `gap-4` | Standard spacing |
| lg | `p-6`, `gap-6` | Card padding |
| xl | `py-20` | Section padding |

### 1.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | 0.5rem (8px) | Default radius |
| `rounded-md` | calc(0.5rem - 2px) | Medium elements |
| `rounded-lg` | 0.5rem | Cards, containers |
| `rounded-xl` | Custom | Landing page cards |

---

## 2. Component Library

### 2.1 UI Primitives

#### Button Component
**File:** [components/ui/button.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/ui/button.tsx)

| Prop | Type | Options | Default |
|------|------|---------|---------|
| `variant` | ButtonVariant | `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` | `default` |
| `size` | ButtonSize | `default`, `sm`, `lg`, `icon` | `default` |

**Variant Styles:**
```
default     → bg-primary text-white, hover:bg-primary/90
destructive → bg-destructive text-white
outline     → border bg-background, hover:bg-accent
secondary   → bg-secondary text-secondary-foreground
ghost       → transparent, hover:bg-accent
link        → text-primary underline-offset-4
```

**Size Styles:**
```
default → h-10 px-4 py-2
sm      → h-9 px-3 rounded-md
lg      → h-11 px-8 rounded-md
icon    → h-10 w-10 (square)
```

---

#### Card Component
**File:** [components/ui/card.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/ui/card.tsx)

| Subcomponent | Usage |
|--------------|-------|
| `Card` | Container - `rounded-lg border shadow-sm` |
| `CardHeader` | Header section - `p-6` |
| `CardTitle` | Title - `text-2xl font-semibold` |
| `CardDescription` | Subtitle - `text-sm text-muted-foreground` |
| `CardContent` | Body content - `p-6 pt-0` |
| `CardFooter` | Footer with actions - `flex p-6 pt-0` |

---

#### Alert Component
**File:** [components/ui/alert.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/ui/alert.tsx)

| Variant | Description |
|---------|-------------|
| `default` | Standard info alert - neutral colors |
| `destructive` | Error alert - red border and icon |

Features:
- `role="alert"` for accessibility
- Icon positioning (absolute left)
- Auto-styles for SVG icons

---

### 2.2 Form Components

#### FileUploadForm
**File:** [components/forms/FileUploadForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/FileUploadForm.tsx)  
**Lines:** 295

| Prop | Type | Description |
|------|------|-------------|
| `userId` | string? | Authenticated user ID |
| `onExtractionComplete` | function | Callback after AI extraction |
| `availableCredits` | number | User's credit balance |

**Features:**
- Drag-and-drop file upload zone
- File type validation (PDF, JPG, PNG)
- Size validation (max 25MB)
- Progress indicator with status messages
- Credit check before upload
- Automatic AI extraction trigger

**States:**
```
idle       → Ready for upload
uploading  → File being sent
extracting → AI processing
success    → Extraction complete
error      → Upload failed
```

---

#### InvoiceReviewForm
**File:** [components/forms/InvoiceReviewForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/InvoiceReviewForm.tsx)  
**Lines:** 703 (largest component)

| Prop | Type | Description |
|------|------|-------------|
| `extractionId` | string | Database extraction record ID |
| `userId` | string | User ID for conversion |
| `initialData` | object | AI-extracted invoice data |
| `confidence` | number | AI confidence score (0-100) |

**Form Sections:**
1. **Invoice Details** - Number, date, currency
2. **Seller Information** - Name, address, tax ID, contact
3. **Buyer Information** - Name, address, reference (Leitweg-ID)
4. **Line Items** - Dynamic table with add/remove
5. **Totals** - Subtotal, tax, grand total
6. **Payment** - IBAN, BIC, payment terms
7. **Conversion Options** - Format selection (CII/UBL)

**Key Functions:**
- `parseAddress()` - Parse combined address into street/postal/city
- `handleLineItemChange()` - Dynamic line item updates
- `addLineItem()` / `removeLineItem()` - Table row management
- `handleSubmit()` - API call for conversion

---

#### LoginForm
**File:** [components/forms/LoginForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/LoginForm.tsx)

| Field | Type | Validation |
|-------|------|------------|
| Email | email input | Required, valid email |
| Password | password input | Required, min 6 chars |

---

#### SignupForm
**File:** [components/forms/SignupForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/SignupForm.tsx)

| Field | Type | Validation |
|-------|------|------------|
| First Name | text | Required |
| Last Name | text | Required |
| Email | email | Required, valid email |
| Password | password | Required, min 8 chars |
| Confirm Password | password | Must match password |

---

#### CreditPurchaseForm (Phase 4)
**File:** [components/forms/CreditPurchaseForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/CreditPurchaseForm.tsx)

Features:
- Package selection (10, 50, 100, 500 credits)
- Price display with discounts
- Payment method toggle (Stripe/PayPal)
- Checkout redirect

---

#### BulkUploadForm (Phase 4)
**File:** [components/forms/BulkUploadForm.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/components/forms/BulkUploadForm.tsx)

Features:
- ZIP file upload (max 100 PDFs)
- Progress tracking per file
- Format selection (CII/UBL)
- Batch status display
- Download result ZIP

---

## 3. User Flows

### 3.1 Authentication Flow
```
┌──────────┐    ┌───────────┐    ┌───────────┐
│  Landing │───▶│  Signup   │───▶│ Dashboard │
│   Page   │    │   Form    │    │   (Auth)  │
└──────────┘    └───────────┘    └───────────┘
     │                                  ▲
     ▼                                  │
┌──────────┐    ┌───────────┐          │
│  Login   │───▶│  Verify   │──────────┘
│   Form   │    │   Creds   │
└──────────┘    └───────────┘
```

### 3.2 Invoice Conversion Flow
```
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  Upload   │───▶│    AI     │───▶│  Review   │───▶│  Convert  │
│  Invoice  │    │ Extraction│    │   Form    │    │ Download  │
└───────────┘    └───────────┘    └───────────┘    └───────────┘
   PDF/JPG         Gemini API      Edit data       XRechnung XML
```

### 3.3 Payment Flow (Phase 4)
```
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  Select   │───▶│  Checkout │───▶│  Payment  │───▶│  Credits  │
│  Package  │    │   Page    │    │  Gateway  │    │  Added    │
└───────────┘    └───────────┘    └───────────┘    └───────────┘
  10-500 creds   Stripe/PayPal    Card/SEPA       Dashboard
```

---

## 4. Page Layouts

### 4.1 Landing Page
**File:** [app/[locale]/page.tsx](file:///c:/Users/osama/Desktop/Invoice2E.1/app/%5Blocale%5D/page.tsx)

```
┌────────────────────────────────────────────┐
│ Header: Logo + Login/Signup buttons        │
├────────────────────────────────────────────┤
│ Hero Section:                              │
│   - "Convert Invoices to XRechnung"        │
│   - Call-to-action buttons                 │
├────────────────────────────────────────────┤
│ Feature Cards (3 columns):                 │
│   [Upload] [AI Extraction] [XRechnung]     │
└────────────────────────────────────────────┘
```

Background: Gradient `from-blue-600 via-blue-700 to-indigo-800`

### 4.2 Dashboard Layout
```
┌────────────────────────────────────────────┐
│ Navigation: Logo + User menu               │
├───────────┬────────────────────────────────┤
│           │                                │
│  Sidebar  │   Main Content Area            │
│  - Stats  │   - File Upload                │
│  - Nav    │   - Recent Conversions         │
│           │   - Analytics                  │
│           │                                │
└───────────┴────────────────────────────────┘
```

---

## 5. Interaction Patterns

### 5.1 Form Validation
- **Real-time validation** using Zod schemas
- **Error display** below fields with red text
- **Required field indicators** with asterisk (*)
- **Submit button disabled** until form valid

### 5.2 Loading States
| Context | Pattern |
|---------|---------|
| Button loading | Spinner + "Processing..." text |
| Page loading | Skeleton components |
| File upload | Progress bar + percentage |
| AI extraction | Animated status messages |

### 5.3 Error Handling
| Error Type | Display |
|------------|---------|
| Field validation | Red text below field |
| Form submission | Alert component (destructive) |
| API error | Toast notification |
| Credit insufficient | Modal dialog |

### 5.4 Success Feedback
- Success Alert with green styling
- Automatic redirect after action
- Confirmation messages

---

## 6. Accessibility

### 6.1 WCAG Compliance
| Requirement | Implementation |
|-------------|----------------|
| Color Contrast | 4.5:1 minimum ratio |
| Focus States | `focus-visible:ring-2 ring-ring` |
| ARIA Labels | All interactive elements |
| Keyboard Nav | Full tab navigation |
| Screen Reader | `role="alert"` for notifications |

### 6.2 Keyboard Navigation
- Tab through all form fields
- Enter to submit forms
- Escape to close modals
- Arrow keys for dropdowns

---

## 7. Responsive Design

### 7.1 Breakpoints (Tailwind Defaults)
| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablets |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |

### 7.2 Component Responsiveness
| Component | Mobile | Desktop |
|-----------|--------|---------|
| Feature cards | 1 column | 3 columns (`md:grid-cols-3`) |
| Navigation | Hamburger menu | Full navbar |
| Dashboard | Stacked | Sidebar + content |
| Forms | Full width | Centered max-width |

---

## 8. Icons

Using **Lucide React** icon library (included via dependency).

Common icons:
- Upload arrow for file upload
- Check mark for success
- X for errors/cancel
- Spinner for loading
- Document for invoices

---

## Document References

| Document | Path |
|----------|------|
| PRD | [01-product/01-prd.md](./01-prd.md) |
| Source Code | [03-development/01-source-code.md](../03-development/01-source-code.md) |
| Component API | See individual component files |
