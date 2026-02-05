# Quality Assurance Documentation
## Invoice2E - Testing & Quality Standards

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Test Framework** | Vitest 1.x |
| **Coverage Target** | 80% |

---

## 1. Test Framework

### 1.1 Technology Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit test runner (fast, ESM-native) |
| **React Testing Library** | Component testing |
| **jsdom** | Browser environment simulation |
| **MSW** | API mocking |

### 1.2 Configuration

**File:** [vitest.config.ts](file:///c:/Users/osama/Desktop/Invoice2E.1/vitest.config.ts)

```typescript
export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
```

---

## 2. Test Structure

### 2.1 Directory Layout

```
tests/
├── setup.ts                      # Global test setup
├── unit/                         # Unit tests
│   ├── ai/                       # AI extractor tests
│   ├── auth.service.test.ts      # Authentication
│   ├── database.service.test.ts  # Database operations
│   ├── database-helpers.test.ts  # Case conversion
│   ├── file.service.test.ts      # File handling
│   ├── gemini.service.test.ts    # Gemini AI
│   ├── review.service.test.ts    # Review flow
│   ├── xrechnung.service.test.ts # XML generation
│   └── utils.test.ts             # Utilities
└── integration/                  # Integration tests
    └── api/                      # API route tests
```

### 2.2 Test Files

| File | Size | Tests |
|------|------|-------|
| `auth.service.test.ts` | 3.9KB | Login, signup, validation |
| `database.service.test.ts` | 5.6KB | CRUD operations |
| `database-helpers.test.ts` | 4.4KB | Case conversion |
| `file.service.test.ts` | 5.7KB | File upload, validation |
| `gemini.service.test.ts` | 9.1KB | AI extraction |
| `review.service.test.ts` | 10.3KB | Review + conversion |
| `xrechnung.service.test.ts` | 5.2KB | XML generation |
| `utils.test.ts` | 1.4KB | Helper functions |

---

## 3. Running Tests

### 3.1 Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- tests/unit/xrechnung.service.test.ts

# Run in watch mode
npm run test:watch

# Run UI mode
npm run test:ui
```

### 3.2 NPM Scripts

```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
        "test:ui": "vitest --ui"
    }
}
```

---

## 4. Coverage Targets

### 4.1 Overall Targets

| Metric | Target | Current |
|--------|--------|---------|
| Statements | 80% | TBD |
| Branches | 75% | TBD |
| Functions | 80% | TBD |
| Lines | 80% | TBD |

### 4.2 Critical Path Coverage

| Component | Target | Priority |
|-----------|--------|----------|
| XRechnung Service | 90%+ | Critical |
| AI Extractors | 85%+ | High |
| Database Service | 85%+ | High |
| Auth Service | 80%+ | High |
| API Routes | 75%+ | Medium |
| Components | 60%+ | Medium |

---

## 5. Test Categories

### 5.1 Unit Tests

Test individual functions and classes in isolation.

**Example: XRechnung Service**
```typescript
describe('XRechnungService', () => {
    it('should generate valid XML for complete invoice', () => {
        const invoiceData = {
            invoiceNumber: 'INV-001',
            invoiceDate: '2026-02-01',
            // ... complete data
        };
        
        const result = xrechnungService.generateXRechnung(invoiceData);
        
        expect(result.xmlContent).toContain('<?xml version="1.0"');
        expect(result.validationStatus).toBe('valid');
    });
    
    it('should fail validation without buyer reference', () => {
        const incompleteData = { /* missing buyerReference */ };
        
        expect(() => xrechnungService.generateXRechnung(incompleteData))
            .toThrow('BR-DE-15');
    });
});
```

### 5.2 Integration Tests

Test API routes with mocked database.

**Example: Extract Route**
```typescript
describe('POST /api/invoices/extract', () => {
    it('should extract data from PDF and save to database', async () => {
        const formData = new FormData();
        formData.append('file', pdfBlob);
        formData.append('userId', 'test-user');
        
        const response = await POST(mockRequest);
        
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true,
            data: { extractionId: expect.any(String) }
        });
    });
});
```

### 5.3 Component Tests

Test React components with user interactions.

**Example: FileUploadForm**
```typescript
describe('FileUploadForm', () => {
    it('should show error for oversized files', () => {
        render(<FileUploadForm userId="test" availableCredits={10} />);
        
        const input = screen.getByTestId('file-input');
        fireEvent.change(input, { target: { files: [largeFile] } });
        
        expect(screen.getByText(/file too large/i)).toBeInTheDocument();
    });
});
```

---

## 6. Test Data

### 6.1 Sample Invoice Data

```typescript
export const mockInvoiceData = {
    invoiceNumber: 'TEST-001',
    invoiceDate: '2026-02-01',
    buyerName: 'Test Buyer GmbH',
    buyerAddress: 'Buyer Street 123',
    buyerCity: 'Berlin',
    buyerPostalCode: '10115',
    buyerCountryCode: 'DE',
    buyerReference: '991-12345-67',
    sellerName: 'Test Seller GmbH',
    sellerEmail: 'test@seller.de',
    sellerAddress: 'Seller Ave 456',
    sellerCity: 'Munich',
    sellerPostalCode: '80331',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE123456789',
    sellerIban: 'DE89370400440532013000',
    lineItems: [
        {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100.00,
            totalPrice: 100.00,
            taxRate: 19
        }
    ],
    subtotal: 100.00,
    taxAmount: 19.00,
    totalAmount: 119.00,
    currency: 'EUR'
};
```

### 6.2 Mock Users

```typescript
export const mockUser = {
    id: 'test-user-uuid',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User'
};

export const mockCredits = {
    userId: 'test-user-uuid',
    availableCredits: 50,
    usedCredits: 10
};
```

---

## 7. Mocking Strategy

### 7.1 Supabase Mocks

```typescript
vi.mock('@/lib/supabase.server', () => ({
    createServerClient: () => ({
        from: () => ({
            select: () => ({ data: mockData, error: null }),
            insert: () => ({ data: newRecord, error: null }),
            update: () => ({ data: updatedRecord, error: null })
        })
    })
}));
```

### 7.2 AI Provider Mocks

```typescript
vi.mock('@/services/ai/extractor.factory', () => ({
    ExtractorFactory: {
        create: () => ({
            extractFromFile: async () => mockExtractedData,
            getProviderName: () => 'mock',
            validateConfiguration: () => true
        })
    }
}));
```

---

## 8. Quality Gates

### 8.1 Pre-commit Checks

```bash
# Lint check
npm run lint

# Type check
npm run type-check

# Run tests
npm test
```

### 8.2 CI Pipeline Checks

| Stage | Command | Failure Condition |
|-------|---------|-------------------|
| Lint | `npm run lint` | Any error |
| Types | `npm run type-check` | Any error |
| Tests | `npm run test:coverage` | Coverage < 80% |
| Build | `npm run build` | Build failure |

---

## 9. Manual Testing

### 9.1 Smoke Test Checklist

- [ ] Landing page loads
- [ ] Login/signup works
- [ ] File upload accepts PDF
- [ ] AI extraction returns data
- [ ] Review form displays data
- [ ] XRechnung download works
- [ ] Credit deduction occurs

### 9.2 XRechnung Validation

External validation using KoSIT Validator:

```bash
java -jar validationtool.jar \
    -s scenarios.xml \
    -o /output \
    invoice.xml
```

---

## 10. Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| Flaky AI tests | Open | Retry mechanism |
| Slow extraction | Open | Increase timeout |

---

## Document References

| Document | Path |
|----------|------|
| Source Code | [03-development/01-source-code.md](../03-development/01-source-code.md) |
| API Reference | [03-development/02-api-reference.md](../03-development/02-api-reference.md) |
