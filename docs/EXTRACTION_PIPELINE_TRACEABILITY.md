# End-to-End Extraction Pipeline Traceability Report

> **Scope**: `EXTRACTION_PROMPT` → AI response → parsing → normalization → DB persistence → Review UI → Convert route → XRechnung validation → XML builder output
>
> **Mode**: Strict code-only analysis. Every claim includes file path + line range.

---

## 1. Flow Map

```
EXTRACTION_PROMPT (lib/extraction-prompt.ts:5-69)
        │
        ├──► gemini.service.ts:115      (single-file, /api/invoices/extract)
        ├──► gemini.adapter.ts:58       (batch, via ExtractorFactory)
        └──► deepseek.adapter.ts:51     (batch DEFAULT, via ExtractorFactory)
                │
                ▼
        AI API Call (Gemini / DeepSeek)
                │
                ▼
        Raw text response (JSON or code-block-wrapped JSON)
                │
                ▼
        parseJsonFromAiResponse()       (lib/extraction-normalizer.ts:48-87)
                │
                ▼
        normalizeExtractedData()        (lib/extraction-normalizer.ts:121-199)
          ├─ normalizeTaxRate()         (lib/extraction-normalizer.ts:33-42)
          ├─ normalizeIban()            (lib/extraction-normalizer.ts:16-25)
          ├─ normalizeTaxCategoryCode() (lib/extraction-normalizer.ts:95-107)
          ├─ normalizeVatIds()          (lib/extraction-normalizer.ts:205-226)
          ├─ normalizeElectronicAddresses() (lib/extraction-normalizer.ts:232-248)
          └─ normalizeDocumentTypeCode()(lib/extraction-normalizer.ts:253-258)
                │
                ▼
        ExtractedInvoiceData            (types/index.ts)
                │
                ▼
        invoiceDbService.createExtraction()
          INSERT INTO invoice_extractions
            (user_id, extraction_data [JSONB], confidence_score, status)
                │
                ▼
        GET /api/invoices/extractions/{id}
          SELECT extraction_data FROM invoice_extractions
                │
                ▼
        useInvoiceReviewForm            (components/forms/invoice-review/useInvoiceReviewForm.ts)
          initialData → defaultValues   (lines 111-156)
          Form sections render fields   (BuyerInfoSection, SellerInfoSection, etc.)
                │
                ▼
        User edits → form.handleSubmit → onSubmit payload
          items→lineItems rename        (useInvoiceReviewForm.ts:220)
          nested address→flat           (useInvoiceReviewForm.ts:205-212)
          electronic address derivation (useInvoiceReviewForm.ts:214-218)
                │
                ▼
        POST /api/invoices/review       (app/api/invoices/review/route.ts)
          reviewService.validateReviewedData()  (services/review.service.ts:68-123)
          UPDATE invoice_extractions SET extraction_data = reviewedData
          INSERT/UPDATE invoice_conversions
                │
                ▼
        POST /api/invoices/convert      (app/api/invoices/convert/route.ts)
          serviceData mapping           (route.ts:87-96)
          xrechnungService.generateXRechnung()
                │
                ├──► validator.validateInvoiceData()
                │      validateForXRechnung()    (validation/validation-pipeline.ts:56-72)
                │        Stage 1: validateSchema (lines 22-50)
                │        Stage 2: validateBusinessRules → monetary-validator.ts
                │        Stage 3: validateXRechnungRules (validation/xrechnung-rules.ts:12-114)
                │
                └──► builder.buildXml()          (services/xrechnung/builder.ts:13-27)
                       ├─ buildExchangedDocumentContext (lines 29-39)
                       ├─ buildExchangedDocument       (lines 41-55)
                       └─ buildSupplyChainTradeTransaction (lines 57-67)
                            ├─ buildLineItems          (lines 73-127)
                            ├─ buildTradeAgreement     (lines 129-139)
                            │   ├─ buildSellerTradeParty (lines 208-225)
                            │   └─ buildBuyerTradeParty  (lines 263-285)
                            ├─ buildTradeDelivery      (lines 287-296)
                            └─ buildTradeSettlement    (lines 344-412)
                                ├─ buildPaymentMeans   (lines 306-330)
                                ├─ buildTaxGroups      (lines 419-442)
                                └─ buildPaymentTerms   (lines 489-505)
                │
                ▼
        XRechnungGenerationResult
          { xmlContent, fileName, validationStatus, validationErrors, validationWarnings }
```

---

## 2. Sequence Diagram

```
┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐
│ Client │  │ Extract │  │ AI API   │  │ Norm │  │ DB        │  │ Review  │  │ Convert │  │ Validator│  │ Builder │
│        │  │ Route   │  │ (Gemini/ │  │      │  │ (Supabase)│  │ Route   │  │ Route   │  │ Pipeline │  │ (XML)   │
│        │  │         │  │ DeepSeek)│  │      │  │           │  │         │  │         │  │          │  │         │
└───┬────┘  └────┬────┘  └────┬─────┘  └──┬───┘  └─────┬─────┘  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬────┘
    │            │            │           │            │             │            │            │            │
    │ POST /extract           │           │            │             │            │            │            │
    │───────────>│            │           │            │             │            │            │            │
    │            │ EXTRACTION_PROMPT      │            │             │            │            │            │
    │            │───────────>│           │            │             │            │            │            │
    │            │            │ AI processes PDF       │             │            │            │            │
    │            │   raw JSON │           │            │             │            │            │            │
    │            │<───────────│           │            │             │            │            │            │
    │            │ parseJsonFromAiResponse│            │             │            │            │            │
    │            │───────────────────────>│            │             │            │            │            │
    │            │ normalizeExtractedData │            │             │            │            │            │
    │            │───────────────────────>│            │             │            │            │            │
    │            │  ExtractedInvoiceData  │            │             │            │            │            │
    │            │<──────────────────────-│            │             │            │            │            │
    │            │ createExtraction(data)  │           │             │            │            │            │
    │            │────────────────────────────────────>│             │            │            │            │
    │            │        { extractionId }             │             │            │            │            │
    │            │<───────────────────────────────────-│             │            │            │            │
    │ { extractionId, extractedData }     │           │             │            │            │            │
    │<───────────│            │           │            │             │            │            │            │
    │            │            │           │            │             │            │            │            │
    │ GET /extractions/{id}   │           │            │             │            │            │            │
    │───────────────────────────────────────────────-->│             │            │            │            │
    │ { extractionData }      │           │            │             │            │            │            │
    │<────────────────────────────────────────────────-│             │            │            │            │
    │            │            │           │            │             │            │            │            │
    │ User reviews & edits in form        │            │             │            │            │            │
    │            │            │           │            │             │            │            │            │
    │ POST /review { reviewedData }       │            │             │            │            │            │
    │─────────────────────────────────────────────────>│             │            │            │            │
    │            │            │           │            │ validateReviewedData()   │            │            │
    │            │            │           │            │ UPDATE extraction_data   │            │            │
    │            │            │           │            │ UPSERT conversion        │            │            │
    │ { conversionId, accuracy }          │            │             │            │            │            │
    │<─────────────────────────────────────────────────│             │            │            │            │
    │            │            │           │            │             │            │            │            │
    │ POST /convert { conversionId, invoiceData }      │             │            │            │            │
    │──────────────────────────────────────────────────────────────>│            │            │            │
    │            │            │           │            │             │  serviceData mapping    │            │
    │            │            │           │            │             │ generateXRechnung()     │            │
    │            │            │           │            │             │──────────>│            │            │
    │            │            │           │            │             │           │ Stage 1-3  │            │
    │            │            │           │            │             │           │ validate() │            │
    │            │            │           │            │             │           │───────────>│            │
    │            │            │           │            │             │           │  result    │            │
    │            │            │           │            │             │           │<───────────│            │
    │            │            │           │            │             │  if valid: buildXml()  │            │
    │            │            │           │            │             │───────────────────────>│            │
    │            │            │           │            │             │   xmlContent           │            │
    │            │            │           │            │             │<───────────────────────│            │
    │            │            │           │            │             │            │            │            │
    │            │            │           │            │             │ UPDATE conversion      │            │
    │            │            │           │            │             │─────────────────────────────────────>│
    │ { xmlContent, fileName, validationStatus }       │             │            │            │            │
    │<─────────────────────────────────────────────────────────────-│            │            │            │
```

---

## 3. Prompt Contract Table

**Source**: `lib/extraction-prompt.ts:5-69`

| #   | Field Name          | Prompt Type                           | Line  | Normalizer Transform                                                              | Normalizer Line | DB Column (JSONB key)                 |
| --- | ------------------- | ------------------------------------- | ----- | --------------------------------------------------------------------------------- | --------------- | ------------------------------------- |
| 1   | `invoiceNumber`     | `string \| null`                      | 8     | `String(v) \|\| null`                                                             | 149             | `invoice_number` (via extractionData) |
| 2   | `invoiceDate`       | `string (YYYY-MM-DD) \| null`         | 9     | `String(v) \|\| null`                                                             | 150             | `invoice_date`                        |
| 3   | `buyerName`         | `string \| null`                      | 10    | `String(v) \|\| null`                                                             | 151             | `buyer_name`                          |
| 4   | `buyerEmail`        | `string \| null`                      | 11    | `String(v) \|\| null`                                                             | 152             | `buyer_email`                         |
| 5   | `buyerAddress`      | `string \| null`                      | 12    | `String(v) \|\| null`                                                             | 153             | `buyer_address`                       |
| 6   | `buyerCity`         | `string \| null`                      | 13    | `String(v) \|\| null`                                                             | 154             | `buyer_city`                          |
| 7   | `buyerPostalCode`   | `string \| null`                      | 14    | `String(v) \|\| null` (number→string coercion)                                    | 155             | `buyer_postal_code`                   |
| 8   | `buyerCountryCode`  | `string (ISO 3166-1 alpha-2) \| null` | 15    | `String(v) \|\| null`                                                             | 156             | `buyer_country_code`                  |
| 9   | `buyerTaxId`        | `string \| null`                      | 16    | `String(v) \|\| null`                                                             | 157             | `buyer_tax_id`                        |
| 10  | `buyerPhone`        | `string \| null`                      | 17    | `String(v) \|\| null`                                                             | 158             | `buyer_phone`                         |
| 11  | `sellerName`        | `string \| null`                      | 18    | `String(v) \|\| null`                                                             | 159             | `seller_name`                         |
| 12  | `sellerEmail`       | `string \| null`                      | 19    | `String(v) \|\| null`                                                             | 160             | `seller_email`                        |
| 13  | `sellerAddress`     | `string \| null`                      | 20    | `String(v) \|\| null`                                                             | 161             | `seller_address`                      |
| 14  | `sellerCity`        | `string \| null`                      | 21    | `String(v) \|\| null`                                                             | 162             | `seller_city`                         |
| 15  | `sellerPostalCode`  | `string \| null`                      | 22    | `String(v) \|\| null` (number→string)                                             | 163             | `seller_postal_code`                  |
| 16  | `sellerCountryCode` | `string (ISO 3166-1 alpha-2) \| null` | 23    | `String(v) \|\| null`                                                             | 164             | `seller_country_code`                 |
| 17  | `sellerTaxId`       | `string \| null`                      | 24    | `String(v) \|\| null`                                                             | 165             | `seller_tax_id`                       |
| 18  | `sellerVatId`       | `string \| null`                      | 25    | normalizeVatIds(): auto-split from sellerTaxId if EU pattern                      | 205-226         | `seller_vat_id`                       |
| 19  | `sellerTaxNumber`   | `string \| null`                      | 26    | normalizeVatIds(): auto-split from sellerTaxId if NOT EU                          | 205-226         | `seller_tax_number`                   |
| 20  | `sellerIban`        | `string \| null`                      | 27    | normalizeIban(): strip whitespace, uppercase, validate `^[A-Z]{2}\d{2}[A-Z0-9]+$` | 16-25           | `seller_iban`                         |
| 21  | `sellerBic`         | `string \| null`                      | 28    | `String(v) \|\| null`                                                             | 167             | `seller_bic`                          |
| 22  | `sellerPhone`       | `string \| null`                      | 29    | `String(v) \|\| null`                                                             | 168             | `seller_phone`                        |
| 23  | `bankName`          | `string \| null`                      | 30    | `String(v) \|\| null`                                                             | 169             | `bank_name`                           |
| 24  | `buyerVatId`        | `string \| null`                      | 31    | normalizeVatIds(): derive from buyerTaxId if EU pattern                           | 219-223         | `buyer_vat_id`                        |
| 25  | `buyerReference`    | `string \| null`                      | 32    | `String(v) \|\| null`                                                             | 197             | `buyer_reference`                     |
| 26  | `documentTypeCode`  | `number \| null`                      | 33    | normalizeDocumentTypeCode(): validate ∈{380,381,384,389}                          | 253-258         | `document_type_code`                  |
| 27  | `lineItems`         | `array`                               | 34-43 | Per-item normalization (see below)                                                | 170-184         | `line_items`                          |
| 28  | `subtotal`          | `number`                              | 44    | `Number(v) \|\| 0`                                                                | 122,185         | `subtotal`                            |
| 29  | `taxRate`           | `number (%) \| null`                  | 45    | normalizeTaxRate(): 0.19→19, reject >30%                                          | 33-42,137-139   | `tax_rate`                            |
| 30  | `taxAmount`         | `number`                              | 46    | Derived if 0 and total>subtotal                                                   | 126-134         | `tax_amount`                          |
| 31  | `totalAmount`       | `number`                              | 47    | `Number(v) \|\| 0`                                                                | 123,188         | `total_amount`                        |
| 32  | `currency`          | `string`                              | 48    | Default `'EUR'`                                                                   | 189             | `currency`                            |
| 33  | `paymentTerms`      | `string \| null`                      | 49    | `String(v) \|\| null`                                                             | 190             | `payment_terms`                       |
| 34  | `notes`             | `string \| null`                      | 50    | `String(v) \|\| null`                                                             | 191             | `notes`                               |
| 35  | `confidence`        | `number (0-1)`                        | 51    | `Number(v) \|\| 0.7`                                                              | 192             | `confidence`                          |

**Line Item Fields** (prompt lines 34-43, normalizer lines 170-184):

| Field             | Prompt Type          | Normalizer Transform                                                |
| ----------------- | -------------------- | ------------------------------------------------------------------- |
| `description`     | `string`             | `String(v) \|\| ''`                                                 |
| `quantity`        | `number`             | `Number(v) \|\| 1`                                                  |
| `unitPrice`       | `number`             | `Number(v) \|\| 0`                                                  |
| `totalPrice`      | `number`             | `Number(v) \|\| 0`                                                  |
| `taxRate`         | `number (%) \| null` | normalizeTaxRate(), fallback to invoice-level rate                  |
| `taxCategoryCode` | `string \| null`     | normalizeTaxCategoryCode(): validate UNCL5305, derive S/E from rate |

**Derived Fields** (NOT in prompt, added by normalizer):

| Field                           | Normalizer Source                                    | Line    |
| ------------------------------- | ---------------------------------------------------- | ------- |
| `buyerElectronicAddress`        | `buyerElectronicAddress \|\| buyerEmail \|\| null`   | 234     |
| `buyerElectronicAddressScheme`  | Explicit or default `'EM'`                           | 240-241 |
| `sellerElectronicAddress`       | `sellerElectronicAddress \|\| sellerEmail \|\| null` | 236     |
| `sellerElectronicAddressScheme` | Explicit or default `'EM'`                           | 243-244 |

---

## 4. Transformation Inventory

### 4.1 AI Response → Parsed JSON

| Stage            | Function                               | File:Lines                     | Input                 | Output      | Error Handling              |
| ---------------- | -------------------------------------- | ------------------------------ | --------------------- | ----------- | --------------------------- |
| Direct parse     | `JSON.parse()`                         | extraction-normalizer.ts:52-55 | Raw text              | JSON object | Falls through to next stage |
| Code block strip | Regex `/```(?:json)?\s*([\s\S]*?)```/` | extraction-normalizer.ts:59-66 | Markdown-wrapped JSON | JSON object | Falls through               |
| Balanced brace   | Find first `{`, count depth            | extraction-normalizer.ts:69-84 | Embedded JSON         | JSON object | Throws if no balanced pair  |

### 4.2 Parsed JSON → ExtractedInvoiceData

| Transform                     | Function                         | File:Lines                       | Condition                                       | Effect                                          |
| ----------------------------- | -------------------------------- | -------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Tax rate decimal→%            | `normalizeTaxRate()`             | extraction-normalizer.ts:37-39   | `0 < rate < 1`                                  | `rate * 10000 / 100` (e.g., 0.19→19)            |
| Tax rate >30% rejection       | `normalizeTaxRate()`             | extraction-normalizer.ts:40      | `rate > 30`                                     | Returns NaN                                     |
| Tax amount derivation         | inline                           | extraction-normalizer.ts:126-134 | `taxAmount===0 && total>subtotal`               | `round((total-subtotal)*100)/100`               |
| Tax rate derivation           | inline                           | extraction-normalizer.ts:137-139 | Parsed rate is NaN                              | `round((taxAmount/subtotal)*10000)/100`         |
| Postal code coercion          | `String(v)`                      | extraction-normalizer.ts:155,163 | Value is number                                 | Number→string (e.g., 10115→"10115")             |
| IBAN normalization            | `normalizeIban()`                | extraction-normalizer.ts:16-25   | Any string                                      | Strip whitespace, uppercase, validate structure |
| VAT ID splitting              | `normalizeVatIds()`              | extraction-normalizer.ts:211-217 | `sellerTaxId` provided, vatId/taxNumber missing | isEuVatId→sellerVatId, else→sellerTaxNumber     |
| Electronic address derivation | `normalizeElectronicAddresses()` | extraction-normalizer.ts:234-244 | `*ElectronicAddress` missing                    | Fallback to `*Email`, scheme default `'EM'`     |
| Document type validation      | `normalizeDocumentTypeCode()`    | extraction-normalizer.ts:255-257 | Raw value                                       | ∈{380,381,384,389} or undefined                 |
| Tax category code             | `normalizeTaxCategoryCode()`     | extraction-normalizer.ts:96-106  | Raw code or taxRate                             | Validate UNCL5305 set, or derive S/E from rate  |
| Confidence default            | inline                           | extraction-normalizer.ts:192     | Missing                                         | Default 0.7                                     |
| Currency default              | inline                           | extraction-normalizer.ts:189     | Missing                                         | Default `'EUR'`                                 |

### 4.3 Review Form → API Payload (useInvoiceReviewForm.ts:203-227)

| Transform                    | Line       | Effect                                                  |
| ---------------------------- | ---------- | ------------------------------------------------------- |
| Nested→flat address (seller) | 205-208    | `sellerParsedAddress.street → sellerAddress`            |
| Nested→flat address (buyer)  | 209-212    | `buyerParsedAddress.street → buyerAddress`              |
| Email→electronic address     | 214-218    | `buyerEmail → buyerElectronicAddress`, scheme=EM if `@` |
| `items` → `lineItems` rename | 220        | Form uses `items`, API expects `lineItems`              |
| Number coercion              | 222-225    | `Number(item.quantity)`, etc.                           |
| IBAN normalization           | 129 (init) | `normalizeIban()` on form mount                         |

### 4.4 Convert Route → ServiceData (route.ts:87-96)

| Transform                   | Line  | Effect                                                      |
| --------------------------- | ----- | ----------------------------------------------------------- |
| Country code defaults       | 87-88 | `sellerCountryCode \|\| 'DE'`, `buyerCountryCode \|\| 'DE'` |
| Electronic address fallback | 91-94 | `buyerElectronicAddress \|\| buyerEmail \|\| null`          |
| Scheme derivation           | 92,94 | `buyerElectronicAddressScheme \|\| (email ? 'EM' : null)`   |

### 4.5 Builder Transforms (builder.ts)

| Transform                | Function:Lines                 | Effect                                                     |
| ------------------------ | ------------------------------ | ---------------------------------------------------------- |
| Date format              | `formatDate()`:581-636         | `YYYY-MM-DD → YYYYMMDD`, `DD.MM.YYYY → YYYYMMDD`           |
| XML escaping             | `escapeXml()`:507-516          | `& < > " '` → entities, strip control chars                |
| Currency normalization   | `normalizeCurrency()`:531-563  | `€→EUR`, `$→USD`, regex extract                            |
| Tax rate rounding        | `calculateTaxRate()`:476-487   | Snap to common EU rates (19%, 7%, 0%)                      |
| Tax group aggregation    | `buildTaxGroups()`:419-442     | Group by (rate, categoryCode), sum basis, sort desc        |
| Scheme auto-detection    | 210-211, 265-266               | `@` in address → `'EM'`, else → `'0204'`                   |
| Total recomputation (F1) | 374-377                        | `total = roundMoney(subtotal + taxAmount)` from line items |
| VAT category derivation  | `getVatCategoryCode()`:449-451 | `rate > 0 → 'S'`, `rate === 0 → 'E'`                       |

---

## 5. DB Persistence Model

### Table: `invoice_extractions`

| Column (snake_case)       | Type      | Source                               | Notes                     |
| ------------------------- | --------- | ------------------------------------ | ------------------------- |
| `id`                      | UUID PK   | Auto-generated                       |                           |
| `user_id`                 | UUID FK   | Auth session                         |                           |
| `extraction_data`         | JSONB     | Full AI response after normalization | **Overwritten on review** |
| `confidence_score`        | NUMERIC   | `extractedData.confidence`           |                           |
| `gemini_response_time_ms` | INTEGER   | `Date.now() - startTime`             |                           |
| `status`                  | TEXT      | `'completed'` or `'failed'`          |                           |
| `error_message`           | TEXT      | Exception message                    |                           |
| `created_at`              | TIMESTAMP | Auto                                 |                           |
| `updated_at`              | TIMESTAMP | Auto                                 |                           |

**Key fact**: `extraction_data` is the **single JSONB column** that stores all invoice fields. It is overwritten entirely when the user submits a review (`review/route.ts:65-67`). Original extraction data is lost.

**camelCase↔snake_case conversion**: `camelToSnakeKeys()` on write, `snakeToCamelKeys()` on read — both recursive, so JSONB content keys are also converted. This means `extractionData.buyerEmail` in JS becomes `extraction_data.buyer_email` in PostgreSQL JSONB.

### Table: `invoice_conversions`

| Column (snake_case) | Type      | Source                        | Notes                |
| ------------------- | --------- | ----------------------------- | -------------------- |
| `id`                | UUID PK   | Auto                          |                      |
| `user_id`           | UUID FK   | Auth session                  |                      |
| `extraction_id`     | UUID FK   | → invoice_extractions         | 1:1 relationship     |
| `invoice_number`    | TEXT      | `reviewedData.invoiceNumber`  | Snapshot, not synced |
| `buyer_name`        | TEXT      | `reviewedData.buyerName`      | Snapshot, not synced |
| `conversion_format` | TEXT      | `'xrechnung'`                 |                      |
| `conversion_status` | TEXT      | `'draft'` → `'completed'`     |                      |
| `validation_status` | TEXT      | From validator                |                      |
| `validation_errors` | JSONB     | `{ errors: [...] }`           |                      |
| `xml_content`       | TEXT      | Generated XML                 |                      |
| `xml_file_name`     | TEXT      | e.g., `INV-001_xrechnung.xml` |                      |
| `credits_used`      | INTEGER   | 0 (set by RPC)                |                      |
| `created_at`        | TIMESTAMP | Auto                          |                      |

### Table: `batch_jobs`

| Column (snake_case)     | Type      | Notes                                                    |
| ----------------------- | --------- | -------------------------------------------------------- |
| `id`                    | UUID PK   |                                                          |
| `user_id`               | UUID FK   |                                                          |
| `status`                | TEXT      | pending → processing → completed/failed/partial_success  |
| `total_files`           | INTEGER   | Expanded count (includes multi-invoice segments)         |
| `completed_files`       | INTEGER   | Success count                                            |
| `failed_files`          | INTEGER   | Fail count                                               |
| `results`               | JSON      | `BatchResult[]` with extractionId, status, invoiceNumber |
| `input_file_path`       | TEXT      | Storage bucket path                                      |
| `source_type`           | TEXT      | `'zip_upload'` or `'multi_invoice_split'`                |
| `boundary_data`         | JSONB     | From boundary detection                                  |
| `processing_started_at` | TIMESTAMP | Worker claim time                                        |
| `completed_at`          | TIMESTAMP | Final update                                             |

---

## 6. Review UI Binding Map

### Form Field → initialData Source → Submission Payload

| Form register()                  | initialData Source                           | Default    | Submission Key                        | Notes                                             |
| -------------------------------- | -------------------------------------------- | ---------- | ------------------------------------- | ------------------------------------------------- |
| `invoiceNumber`                  | `.invoiceNumber`                             | `''`       | `invoiceNumber`                       |                                                   |
| `invoiceDate`                    | `.invoiceDate`                               | `''`       | `invoiceDate`                         |                                                   |
| `currency`                       | `.currency`                                  | `'EUR'`    | `currency`                            | readonly in UI                                    |
| `sellerName`                     | `.sellerName`                                | `''`       | `sellerName`                          |                                                   |
| `sellerContactName`              | `.sellerContactName \|\| .sellerContact`     | `''`       | `sellerContactName`                   | Fallback chain                                    |
| `sellerPhone`                    | `.sellerPhone`                               | `''`       | **NOT in payload**                    | **DATA LOSS**: required in form but not submitted |
| `sellerEmail`                    | `.sellerEmail`                               | `''`       | `sellerElectronicAddress` (line 217)  | Renamed on submit                                 |
| `sellerParsedAddress.street`     | `.sellerAddress`                             | `''`       | `sellerAddress` (flattened, line 205) | Nested→flat                                       |
| `sellerParsedAddress.postalCode` | `.sellerPostalCode`                          | `''`       | `sellerPostalCode` (line 207)         |                                                   |
| `sellerParsedAddress.city`       | `.sellerCity`                                | `''`       | `sellerCity` (line 206)               |                                                   |
| `sellerParsedAddress.country`    | `.sellerCountryCode`                         | `'DE'`     | `sellerCountryCode` (line 208)        |                                                   |
| `sellerTaxId`                    | `.sellerTaxId`                               | `''`       | `sellerTaxId`                         |                                                   |
| `sellerIban`                     | `.sellerIban \|\| .iban`                     | `''`       | `sellerIban`                          | Normalized via `normalizeIban()`                  |
| `sellerBic`                      | `.sellerBic \|\| .bic`                       | `''`       | `sellerBic`                           |                                                   |
| `bankName`                       | `.bankName`                                  | `''`       | `bankName`                            |                                                   |
| `buyerName`                      | `.buyerName`                                 | `''`       | `buyerName`                           |                                                   |
| `buyerEmail`                     | `.buyerElectronicAddress \|\| .buyerEmail`   | `''`       | `buyerElectronicAddress` (line 214)   | Source is electronicAddress-first                 |
| `buyerParsedAddress.street`      | `.buyerAddress`                              | `''`       | `buyerAddress` (line 209)             |                                                   |
| `buyerParsedAddress.postalCode`  | `.buyerPostalCode`                           | `''`       | `buyerPostalCode` (line 211)          |                                                   |
| `buyerParsedAddress.city`        | `.buyerCity`                                 | `''`       | `buyerCity` (line 210)                |                                                   |
| `buyerParsedAddress.country`     | `.buyerCountryCode`                          | `'DE'`     | `buyerCountryCode` (line 212)         |                                                   |
| `buyerTaxId`                     | `.buyerTaxId`                                | `''`       | `buyerTaxId`                          |                                                   |
| `buyerReference`                 | `.buyerReference`                            | `''`       | `buyerReference`                      |                                                   |
| `paymentTerms`                   | `.paymentTerms`                              | `'Net 30'` | `paymentTerms`                        | Default applied                                   |
| `paymentDueDate`                 | `.paymentDueDate`                            | `''`       | `paymentDueDate`                      |                                                   |
| `paymentInstructions`            | `.paymentInstructions`                       | `''`       | `paymentInstructions`                 |                                                   |
| `items[n].description`           | `.lineItems[n].description`                  | `''`       | `lineItems[n].description` (line 220) | items→lineItems                                   |
| `items[n].quantity`              | `.lineItems[n].quantity`                     | `1`        | `lineItems[n].quantity`               |                                                   |
| `items[n].unitPrice`             | `.lineItems[n].unitPrice`                    | `0`        | `lineItems[n].unitPrice`              |                                                   |
| `items[n].totalPrice`            | `.lineItems[n].totalPrice \|\| .lineTotal`   | `0`        | `lineItems[n].totalPrice`             |                                                   |
| `items[n].taxRate`               | `.lineItems[n].taxRate \|\| fallbackTaxRate` | `0`        | `lineItems[n].taxRate`                |                                                   |
| `subtotal`                       | `.subtotal`                                  | `0`        | `subtotal`                            | Auto-calculated in TotalsSection                  |
| `taxAmount`                      | Derived (lines 79-81)                        | `0`        | `taxAmount`                           | Auto-calculated                                   |
| `totalAmount`                    | `.totalAmount`                               | `0`        | `totalAmount`                         | Auto-calculated                                   |
| `notes`                          | `.notes`                                     | `''`       | `notes`                               |                                                   |

### Missing Fields Alert (InvoiceReviewForm.tsx:54-63)

Fields checked against `initialData`:

- `invoiceNumber`, `invoiceDate`, `sellerName`, `sellerEmail`, `sellerAddress` (street), `sellerTaxId`
- `buyerName`, `buyerElectronicAddress || buyerEmail` (line 61), `buyerAddress` (street), `buyerTaxId`

**NOT checked** (but required by form or XRechnung): `sellerPhone`, `sellerIban`, `sellerCity`, `sellerPostalCode`, `paymentTerms`

---

## 7. Convert + XML Mapping

### ServiceData (convert route) → XRechnungInvoiceData → XML Element

| ServiceData Field                       | Builder Method                | XML Element Path                                                          | Format                                 |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `invoiceNumber`                         | `buildExchangedDocument`      | `rsm:ExchangedDocument/ram:ID`                                            | Escaped string                         |
| `invoiceDate`                           | `buildExchangedDocument`      | `rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString[@format=102]` | YYYYMMDD                               |
| `documentTypeCode`                      | `buildExchangedDocument`      | `rsm:ExchangedDocument/ram:TypeCode`                                      | 380/381/384/389                        |
| `notes`                                 | `buildExchangedDocument`      | `rsm:ExchangedDocument/ram:IncludedNote/ram:Content`                      | Escaped, optional                      |
| `buyerReference`                        | `buildTradeAgreement`         | `ram:BuyerReference`                                                      | Fallback: invoiceNumber → 'LEITWEG-ID' |
| **Seller**                              |                               |                                                                           |                                        |
| `sellerName`                            | `buildSellerTradeParty`       | `ram:SellerTradeParty/ram:Name`                                           | Escaped                                |
| `sellerContactName / sellerContact`     | `buildSellerContact`          | `ram:DefinedTradeContact/ram:PersonName`                                  | Fallback chain                         |
| `sellerPhone / sellerPhoneNumber`       | `buildSellerContact`          | `ram:TelephoneUniversalCommunication/ram:CompleteNumber`                  | Optional                               |
| `sellerEmail`                           | `buildSellerContact`          | `ram:EmailURIUniversalCommunication/ram:URIID`                            | Optional                               |
| `sellerPostalCode`                      | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:PostcodeCode`                                 | Order: 1st                             |
| `sellerAddress`                         | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:LineOne`                                      | Order: 2nd                             |
| `sellerCity`                            | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:CityName`                                     | Order: 3rd                             |
| `sellerCountryCode`                     | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:CountryID`                                    | Order: 4th, default 'DE'               |
| `sellerElectronicAddress`               | `buildURICommunication`       | `ram:URIUniversalCommunication/ram:URIID`                                 | No empty tags                          |
| `sellerElectronicAddressScheme`         | `buildURICommunication`       | `ram:URIID@schemeID`                                                      | 'EM' or auto-detect '0204'             |
| `sellerVatId`                           | `buildSellerTaxRegistrations` | `ram:SpecifiedTaxRegistration/ram:ID[@schemeID="VA"]`                     | EU VAT                                 |
| `sellerTaxNumber`                       | `buildSellerTaxRegistrations` | `ram:SpecifiedTaxRegistration/ram:ID[@schemeID="FC"]`                     | Local fiscal                           |
| `sellerIban`                            | `buildPaymentMeans`           | `ram:PayeePartyCreditorFinancialAccount/ram:IBANID`                       | TypeCode 58                            |
| `sellerBic`                             | `buildPaymentMeans`           | `ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID`                | Optional                               |
| **Buyer**                               |                               |                                                                           |                                        |
| `buyerName`                             | `buildBuyerTradeParty`        | `ram:BuyerTradeParty/ram:Name`                                            | Escaped                                |
| `buyerPostalCode`                       | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:PostcodeCode`                                 |                                        |
| `buyerAddress`                          | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:LineOne`                                      |                                        |
| `buyerCity`                             | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:CityName`                                     |                                        |
| `buyerCountryCode`                      | `buildPostalAddress`          | `ram:PostalTradeAddress/ram:CountryID`                                    | Default 'DE'                           |
| `buyerElectronicAddress`                | `buildURICommunication`       | `ram:URIUniversalCommunication/ram:URIID`                                 | Required by PEPPOL                     |
| `buyerElectronicAddressScheme`          | `buildURICommunication`       | `ram:URIID@schemeID`                                                      | 'EM' or '0204'                         |
| `buyerVatId`                            | `buildBuyerTradeParty`        | `ram:SpecifiedTaxRegistration/ram:ID[@schemeID="VA"]`                     | If EU pattern                          |
| **Delivery**                            |                               |                                                                           |                                        |
| `invoiceDate`                           | `buildTradeDelivery`          | `ram:OccurrenceDateTime/udt:DateTimeString[@format=102]`                  | YYYYMMDD                               |
| **Settlement**                          |                               |                                                                           |                                        |
| `currency`                              | `buildTradeSettlement`        | `ram:InvoiceCurrencyCode`                                                 | ISO 4217                               |
| Line items grouped                      | `buildTaxGroups`              | `ram:ApplicableTradeTax` (per group)                                      | Multiple elements                      |
| group.basisAmount                       | `buildTradeSettlement`        | `ram:BasisAmount`                                                         | .toFixed(2)                            |
| computeTax(basis,rate)                  | `buildTradeSettlement`        | `ram:CalculatedAmount`                                                    | .toFixed(2)                            |
| group.categoryCode                      | `buildTradeSettlement`        | `ram:CategoryCode`                                                        | S/E/Z/AE/K/G/O/L                       |
| group.rate                              | `buildTradeSettlement`        | `ram:RateApplicablePercent`                                               | .toFixed(2)                            |
| `paymentTerms`                          | `buildPaymentTerms`           | `ram:SpecifiedTradePaymentTerms/ram:Description`                          | Optional                               |
| `paymentDueDate`                        | `buildPaymentTerms`           | `ram:DueDateDateTime/udt:DateTimeString[@format=102]`                     | YYYYMMDD                               |
| **Totals** (recomputed from line items) |                               |                                                                           |                                        |
| subtotal                                | `buildTradeSettlement`        | `ram:LineTotalAmount`                                                     | .toFixed(2)                            |
| subtotal                                | `buildTradeSettlement`        | `ram:TaxBasisTotalAmount`                                                 | .toFixed(2), same value                |
| taxAmount                               | `buildTradeSettlement`        | `ram:TaxTotalAmount[@currencyID]`                                         | .toFixed(2)                            |
| subtotal+taxAmount                      | `buildTradeSettlement`        | `ram:GrandTotalAmount`                                                    | .toFixed(2), recomputed (F1)           |
| subtotal+taxAmount                      | `buildTradeSettlement`        | `ram:DuePayableAmount`                                                    | .toFixed(2), same as Grand             |

### Line Items → XML

| Item Field               | XML Element                                      | Builder Line | Format                              |
| ------------------------ | ------------------------------------------------ | ------------ | ----------------------------------- |
| index+1                  | `ram:LineID`                                     | 98           | Integer                             |
| `description / name`     | `ram:SpecifiedTradeProduct/ram:Name`             | 101          | Escaped, fallback 'Item'            |
| `unitPrice`              | `ram:NetPriceProductTradePrice/ram:ChargeAmount` | 105          | .toFixed(2)                         |
| `quantity`               | `ram:BilledQuantity[@unitCode]`                  | 109          | .toFixed(4), unitCode default 'C62' |
| `taxRate / vatRate`      | `ram:RateApplicablePercent`                      | 115          | .toFixed(2)                         |
| taxCategoryCode          | `ram:CategoryCode`                               | 114          | Derived if missing                  |
| `totalPrice / lineTotal` | `ram:LineTotalAmount`                            | 119          | .toFixed(2)                         |

---

## 8. Failure Points

### 8.1 Extraction Failures

| Point                  | File:Line                   | Trigger             | Effect                                       |
| ---------------------- | --------------------------- | ------------------- | -------------------------------------------- |
| AI timeout             | gemini.service.ts:148-150   | API >60s            | 504 GEMINI_TIMEOUT; credit refunded          |
| AI auth                | gemini.service.ts:153-163   | Invalid API key     | 401 GEMINI_AUTH_ERROR                        |
| AI rate limit          | gemini.service.ts:166-176   | 429 from API        | 429 GEMINI_RATE_LIMIT                        |
| Empty response         | gemini.service.ts:230-236   | AI returns blank    | 500 GEMINI_ERROR                             |
| JSON parse failure     | extraction-normalizer.ts:86 | No valid JSON found | Thrown, caught by caller as EXTRACTION_ERROR |
| Zod validation failure | gemini.service.ts:304-308   | Schema mismatch     | **Warning only** — continues with raw data   |
| Missing totalAmount    | gemini.service.ts:332-334   | Extraction missing  | VALIDATION_ERROR 400                         |
| No lineItems           | gemini.service.ts:336-338   | Extraction missing  | VALIDATION_ERROR 400                         |

### 8.2 Review Validation Failures (services/review.service.ts:68-123)

| Check                | Line    | Trigger                                | Error Message                                         |
| -------------------- | ------- | -------------------------------------- | ----------------------------------------------------- |
| invoiceNumber        | 70      | Empty                                  | "Invoice number is required"                          |
| invoiceDate          | 71      | Empty                                  | "Invoice date is required"                            |
| buyerName            | 72      | Empty                                  | "Buyer name is required"                              |
| sellerName           | 73      | Empty                                  | "Seller name is required"                             |
| Negative amounts     | 82-84   | `< 0`                                  | "Amounts cannot be negative"                          |
| No line items        | 87-88   | Empty array                            | "Invoice must have at least one line item"            |
| Item description     | 92      | Empty                                  | "Each line item must have a description"              |
| Item quantity        | 93      | `<= 0`                                 | "Quantity must be greater than 0"                     |
| Date format          | 101     | Not YYYY-MM-DD                         | "Invoice date must be in YYYY-MM-DD format"           |
| Buyer e-address      | 110-113 | Both email + electronicAddress empty   | "Buyer electronic address is required for XRechnung"  |
| Seller e-address     | 114-117 | Both email + electronicAddress empty   | "Seller electronic address is required for XRechnung" |
| Monetary consistency | 120     | subtotal+tax ≠ total (>0.02 tolerance) | "Monetary inconsistency"                              |

### 8.3 XRechnung Validation Failures (validation pipeline)

**Stage 1: Schema** (validation-pipeline.ts:22-50)

| Rule       | Field         | Condition                               |
| ---------- | ------------- | --------------------------------------- |
| SCHEMA-001 | invoiceNumber | Missing/empty                           |
| SCHEMA-002 | invoiceDate   | Missing/empty                           |
| SCHEMA-003 | sellerName    | Missing/empty                           |
| SCHEMA-004 | buyerName     | Missing/empty                           |
| SCHEMA-005 | totalAmount   | null, NaN, Infinity, or ≤0 (except 381) |
| SCHEMA-006 | lineItems     | Missing/empty array                     |

**Stage 2: Business Rules** (monetary-validator.ts:47-104)

| Rule         | Check                                             | Tolerance |
| ------------ | ------------------------------------------------- | --------- |
| BR-CO-10     | sum(lineItem.netAmount) ≈ subtotal                | 0.02      |
| BR-CO-14     | Per group: computeTax(basis, rate) ≈ reported tax | 0.02      |
| BR-CO-14-SUM | sum(groupTax) ≈ total taxAmount                   | 0.02      |
| BR-CO-15     | subtotal + taxAmount ≈ totalAmount                | 0.02      |

**Stage 3: Profile Rules** (xrechnung-rules.ts:12-114)

| Rule                | Field                   | Severity | Condition                           |
| ------------------- | ----------------------- | -------- | ----------------------------------- |
| BR-DE-1             | sellerAddress           | ERROR    | Missing street                      |
| BR-DE-2             | sellerContact           | ERROR    | Missing any of: name, phone, email  |
| BR-DE-3             | sellerCity              | ERROR    | Missing                             |
| BR-DE-4             | sellerPostalCode        | ERROR    | Missing                             |
| BR-DE-5             | sellerCountryCode       | ERROR    | Missing                             |
| BR-DE-11            | buyerCountryCode        | ERROR    | Missing                             |
| BR-DE-15            | buyerReference          | WARNING  | Missing + no invoiceNumber fallback |
| BR-DE-23-a          | sellerIban              | ERROR    | Missing IBAN                        |
| PEPPOL-EN16931-R010 | buyerElectronicAddress  | ERROR    | Missing                             |
| BR-DE-SELLER-EADDR  | sellerElectronicAddress | ERROR    | Missing                             |
| BR-CO-25            | paymentTerms/DueDate    | ERROR    | All three missing                   |

### 8.4 Builder Failures

| Point                  | File:Line          | Trigger           | Effect                                 |
| ---------------------- | ------------------ | ----------------- | -------------------------------------- |
| Ambiguous date         | builder.ts:616-618 | MM/DD/YYYY format | Throws with suggestion                 |
| Currency normalization | builder.ts:557     | Unrecognized      | Default 'EUR' + warning log            |
| Empty URIID            | builder.ts:164     | Empty address     | Empty string returned (no tag emitted) |

### 8.5 Data Loss Points

| Issue                                   | File:Line                       | Impact                                                                                                                                    |
| --------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sellerPhone` not in submission payload | useInvoiceReviewForm.ts:203-227 | Phone collected in form but lost on submit; however, phone IS in the spread `...data` at line 203 so it may survive as part of the spread |
| Original extraction overwritten         | review/route.ts:65-67           | `UPDATE extraction_data = reviewedData` — original AI output is permanently lost                                                          |
| `items` vs `lineItems`                  | useInvoiceReviewForm.ts:220     | Form uses `items`, API expects `lineItems` — renamed on submit                                                                            |

---

## Appendix: Critical Prompt Rules and Their Downstream Effects

| Prompt Rule # | Prompt Line | Rule                                                      | Downstream Consumer                                   | Effect if Violated                                                                |
| ------------- | ----------- | --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| 3             | 57          | Return taxRate as null if not shown                       | normalizeTaxRate() returns NaN → derived from amounts | Tax rate silently calculated — may be wrong                                       |
| 8             | 62          | Address = street only                                     | Form uses separate fields                             | If AI combines, city/postal in address field, split fields empty                  |
| 10            | 64          | Decimal `.` separator, totalAmount = subtotal + taxAmount | monetary-validator.ts BR-CO-15                        | Comma separator → NaN → 0 → validation failure                                    |
| 11            | 65          | Per-item taxRate, don't assume all items share rate       | builder.ts buildTaxGroups                             | If all items get same rate, mixed-rate invoices produce wrong XML                 |
| 12            | 66          | IBAN is SELLER's, not buyer's                             | xrechnung-rules.ts BR-DE-23-a                         | Wrong IBAN → invalid payment info in XML                                          |
| 13            | 67          | Merge continuation rows                                   | lineItems processing                                  | Spurious 0-price items → SCHEMA validation may still pass but XML has ghost items |
