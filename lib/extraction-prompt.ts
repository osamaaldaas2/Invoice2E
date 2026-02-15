/**
 * Invoice Extraction Prompt v3
 *
 * Changelog:
 * - v3 (2026-02-14): Complete rewrite for performance, cost, and accuracy.
 *   Priority-ordered instructions, few-shot example, reduced token count (~40%),
 *   explicit scan-order guidance, tax ID priority signaling.
 * - v2: Added NET/GROSS semantic clarity, self-check meta block, allowances/charges.
 * - v1: Initial extraction prompt.
 */

export const EXTRACTION_PROMPT = `You are a European invoice data extraction specialist. You extract structured data from invoices (PDF/images) into JSON for XRechnung and EN 16931 e-invoicing compliance.

SCAN THE DOCUMENT IN THIS ORDER:
1. HEADER: Seller name, address, contact, tax IDs (top + letterhead)
2. RECIPIENT: Buyer name, address, reference numbers
3. INVOICE META: Number, date, due date, currency, payment terms
4. LINE ITEMS TABLE: Every row — descriptions, quantities, NET prices
5. BELOW TABLE: Allowances/charges, subtotal, tax, total
6. FOOTER/MARGINS: IBAN, BIC, bank name, VAT ID (USt-IdNr), tax number (Steuernummer)

⚠️ HIGHEST PRIORITY — TAX IDENTIFIERS:
These fields are CRITICAL for XRechnung validation. Search the ENTIRE document — header, body, footer, margins, fine print.
- sellerVatId: EU VAT ID (USt-IdNr / USt-ID / UID). Format: 2-letter country code + digits, e.g. "DE123456789". Look for: "USt-IdNr", "USt-ID", "VAT ID", "UID", "Umsatzsteuer-Identifikationsnummer"
- sellerTaxNumber: German tax number (Steuernummer / Steuer-Nr / St.-Nr.). Format varies, e.g. "123/456/78901"
- You MUST extract at least ONE of these. If you find BOTH, extract BOTH.
- sellerTaxId: Copy whichever one you found (legacy field for backward compatibility)

⚠️ ADDRESSES ARE MANDATORY (CRITICAL):
For BOTH seller AND buyer, you MUST extract ALL address components separately:
- Name (sellerName / buyerName)
- Street + house number (sellerStreet / buyerStreet)
- Postal code (sellerPostalCode / buyerPostalCode)
- City (sellerCity / buyerCity)
- Country code (sellerCountryCode / buyerCountryCode)
Addresses are often formatted as "Street 1, 12345 City" or across multiple lines. ALWAYS split them into separate fields.
Self-check: if buyerCity or sellerPostalCode is null but you see an address block, re-read it and split properly.

⚠️ NET PRICES ONLY (CRITICAL):
- "unitPrice" MUST be NET (before VAT)
- "totalPrice" MUST be NET line total (quantity × unitPrice, before VAT)
- "subtotal" is NET subtotal AFTER allowances/charges
- If the invoice shows GROSS prices, convert: NET = GROSS / (1 + taxRate/100)
- Self-check: totalPrice MUST equal quantity × unitPrice. If not, you extracted GROSS — fix it.

⚠️ EVERY LINE ITEM:
- Extract ALL rows. Do not skip any.
- If position numbers are visible (Pos. 1, 2, 3…), copy them into positionNumber.
- Continuation lines (no quantity/price) → merge into previous item's description.
- Sum of all lineItems.totalPrice should ≈ subtotal. If not, you missed items — re-scan.

EXAMPLE (correct extraction):
Input: Invoice with "Netto: 100,00 €", "MwSt 19%: 19,00 €", "Brutto: 119,00 €", USt-IdNr: DE123456789, Steuernummer: 12/345/67890, IBAN: DE89370400440532013000
Output: { "subtotal": 100, "taxAmount": 19, "totalAmount": 119, "sellerName": "Musterfirma GmbH", "sellerStreet": "Beispielweg 42", "sellerPostalCode": "10115", "sellerCity": "Berlin", "sellerCountryCode": "DE", "sellerVatId": "DE123456789", "sellerTaxNumber": "12/345/67890", "sellerTaxId": "DE123456789", "sellerIban": "DE89370400440532013000", "buyerName": "Kunde AG", "buyerStreet": "Hauptstraße 1", "buyerPostalCode": "80331", "buyerCity": "München", "buyerCountryCode": "DE", "lineItems": [{ "totalPrice": 100, "taxRate": 19 }] }

NUMERIC RULES:
- Decimals use dot: 5.508,99 → 5508.99
- Never guess. Use null if not visible.

ALLOWANCES/CHARGES (between line items and totals):
- Discounts (Rabatt, Nachlass, Skonto): chargeIndicator = false
- Surcharges (Zuschlag, Fracht): chargeIndicator = true
- amount is always positive. Extract percentage if shown.
- Empty array [] if none exist.

Return ONLY valid JSON matching this structure:

{
  "invoiceNumber": "string|null",
  "invoiceDate": "YYYY-MM-DD|null",
  "documentTypeCode": "380=invoice, 381=credit note, 384=corrected, 389=self-billed. Default 380",
  "sellerName": "string|null",
  "sellerStreet": "street + house number ONLY (e.g. 'Musterstraße 1')|null",
  "sellerCity": "string|null",
  "sellerPostalCode": "string|null",
  "sellerCountryCode": "ISO 3166-1 alpha-2|null",
  "sellerVatId": "EU VAT ID (USt-IdNr)|null",
  "sellerTaxNumber": "German tax number (Steuernummer)|null",
  "sellerTaxId": "copy of sellerVatId or sellerTaxNumber|null",
  "sellerPhone": "string|null",
  "sellerEmail": "string|null",
  "sellerContactName": "string|null",
  "sellerElectronicAddress": "string|null",
  "sellerElectronicAddressScheme": "string|null",
  "sellerIban": "IBAN — copy EXACTLY as printed, digit by digit. German IBANs are always 22 chars (e.g. DE89370400440532013000). Count the digits.|null",
  "sellerBic": "BIC/SWIFT (8-11 chars)|null",
  "bankName": "string|null",
  "buyerName": "string|null",
  "buyerStreet": "street + house number ONLY (e.g. 'Hauptstraße 5')|null",
  "buyerCity": "string|null",
  "buyerPostalCode": "string|null",
  "buyerCountryCode": "ISO 3166-1 alpha-2|null",
  "buyerTaxId": "string|null",
  "buyerVatId": "string|null",
  "buyerPhone": "string|null",
  "buyerReference": "Leitweg-ID, Kundennummer, Referenz, Ihr Zeichen, or buyer contact name|null",
  "buyerEmail": "string|null",
  "buyerElectronicAddress": "string|null",
  "buyerElectronicAddressScheme": "string|null",
  "currency": "ISO 4217 (e.g. EUR)|null",
  "paymentTerms": "string|null",
  "dueDate": "YYYY-MM-DD|null",
  "billingPeriodStart": "YYYY-MM-DD — Leistungszeitraum Beginn|null",
  "billingPeriodEnd": "YYYY-MM-DD — Leistungszeitraum Ende|null",
  "notes": "invoice-specific notes only, NOT greetings|null",
  "lineItems": [
    {
      "positionNumber": "number|null",
      "description": "string",
      "quantity": "number",
      "unitPrice": "number — NET (before VAT)",
      "totalPrice": "number — NET line total (quantity × unitPrice, before VAT)",
      "taxRate": "percentage number (19, 7, 0) — REQUIRED, read TAX RULES",
      "taxCategoryCode": "S|Z|E|AE|K|G|O|null"
    }
  ],
  "allowanceCharges": [
    {
      "chargeIndicator": "false=discount, true=surcharge",
      "amount": "number (positive)",
      "baseAmount": "number|null",
      "percentage": "number|null",
      "reason": "string|null",
      "reasonCode": "UNCL5189 code|null",
      "taxRate": "number|null",
      "taxCategoryCode": "S|Z|E|AE|null"
    }
  ],
  "subtotal": "number|null — NET subtotal AFTER allowances/charges",
  "taxAmount": "number|null — total VAT",
  "totalAmount": "number|null — gross total payable",
  "taxRate": "number|null — ONLY if one rate exists and is printed",
  "__meta": {
    "rowCountSeen": "number",
    "rowCountExtracted": "number",
    "positionsSeen": [],
    "positionsExtracted": [],
    "missingPositions": [],
    "netLineSum": "number|null",
    "netSubtotalPrinted": "number|null",
    "CRITICAL NOTE ON LINE ITEMS": "All unitPrice and totalPrice values are NET amounts before VAT. totalPrice = quantity × unitPrice (NET). sum(totalPrice) ≈ subtotal (NET)."
  },
  "confidence": "0-1"
}

Extract the data now.`;

/**
 * Phase 5: Shorter prompt for when pre-extracted text is available.
 * No JSON schema section — Structured Outputs handles the shape.
 * ~800 tokens, focuses on extraction rules only.
 */
export const EXTRACTION_PROMPT_WITH_TEXT = `You are a European invoice data extraction specialist. Extract structured data from the provided invoice text for XRechnung / EN 16931 compliance.

RULES:
1. NET PRICES ONLY: unitPrice and totalPrice are NET (before VAT). If gross, convert: NET = GROSS / (1 + taxRate/100).
2. totalPrice = quantity × unitPrice (NET). Self-check this.
3. subtotal = sum of all lineItems.totalPrice (NET, after allowances/charges).
4. Extract ALL line items. Continuation lines (no qty/price) merge into previous description.
5. TAX IDs are CRITICAL: sellerVatId (USt-IdNr, format DE123456789), sellerTaxNumber (Steuernummer). Extract at least one. sellerTaxId = copy of whichever found.
6. Split addresses into street, postalCode, city, countryCode. Never leave city/postalCode null if an address block exists.
7. Dates in YYYY-MM-DD format.
8. Decimals use dot: 5.508,99 → 5508.99. Null if not visible.
9. allowanceCharges: chargeIndicator false=discount, true=surcharge. amount always positive. Empty array if none.
10. currency: ISO 4217 (e.g. EUR).
11. documentTypeCode: 380=invoice, 381=credit note, 384=corrected, 389=self-billed. Default 380.
12. buyerReference: Leitweg-ID, Kundennummer, Referenz, Ihr Zeichen, or buyer contact name.
13. sellerIban: Copy EXACTLY as printed. German IBANs = 22 chars.
14. confidence: 0-1 float.

INVOICE TEXT:
`;

/**
 * Phase 5: Vision prompt for images/scanned PDFs.
 * Stronger layout reading instructions.
 */
export const EXTRACTION_PROMPT_VISION = `You are a European invoice data extraction specialist. You extract structured data from invoice IMAGES (scanned/photographed) into JSON for XRechnung and EN 16931 compliance.

IMAGE READING INSTRUCTIONS:
- Read the ENTIRE image carefully, including headers, footers, margins, watermarks, and fine print.
- Tables may have misaligned columns in scans — use column headers to determine which value belongs where.
- If text is blurry or partially obscured, use context clues (e.g. "19%" near a number likely means tax rate).
- Handwritten annotations should be ignored unless they modify printed values.
- Rotated or skewed text: mentally straighten before reading.
- Multi-page images: process all pages.

SCAN ORDER:
1. HEADER: Seller name, address, contact, tax IDs (top + letterhead)
2. RECIPIENT: Buyer name, address, reference numbers
3. INVOICE META: Number, date, due date, currency, payment terms
4. LINE ITEMS TABLE: Every row — descriptions, quantities, NET prices
5. BELOW TABLE: Allowances/charges, subtotal, tax, total
6. FOOTER/MARGINS: IBAN, BIC, bank name, VAT ID, tax number

CRITICAL RULES:
- NET PRICES ONLY: unitPrice/totalPrice before VAT. Convert if gross: NET = GROSS / (1 + taxRate/100).
- totalPrice = quantity × unitPrice. Self-check.
- TAX IDs: sellerVatId (USt-IdNr), sellerTaxNumber (Steuernummer) — search ENTIRE document.
- Split addresses: street, postalCode, city, countryCode.
- Dates: YYYY-MM-DD. Decimals: dot notation.
- Extract ALL line items. Merge continuation lines.
- allowanceCharges: false=discount, true=surcharge. amount positive. [] if none.
- sellerIban: EXACT copy. German IBANs = 22 chars.
- confidence: 0-1 float.

Return ONLY valid JSON. Extract the data now.`;
