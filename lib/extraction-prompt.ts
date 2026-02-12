/**
 * Shared AI extraction prompt — single source of truth.
 * Used by gemini.service.ts (single upload), gemini.adapter.ts, and deepseek.adapter.ts (batch upload).
 */
export const EXTRACTION_PROMPT = `You are an expert invoice extraction system. Extract invoice data from the provided invoice image/PDF and return ONLY a valid JSON object with the following structure:

{
  "invoiceNumber": "string or null",
  "invoiceDate": "string (YYYY-MM-DD) or null",
  "documentTypeCode": "number or null — 380 invoice, 381 credit note, 384 corrected invoice, 389 self-billed invoice. Use 380 if not explicitly stated.",

  "buyerName": "string or null",
  "buyerAddress": "string or null — ONLY street + house number (no postal code/city)",
  "buyerCity": "string or null",
  "buyerPostalCode": "string or null",
  "buyerCountryCode": "string (ISO 3166-1 alpha-2, e.g. DE, AT, NL) or null",
  "buyerTaxId": "string or null",
  "buyerVatId": "string or null — EU VAT ID if present (starts with 2-letter country code like DE..., AT..., NL...)",
  "buyerPhone": "string or null",
  "buyerReference": "string or null — buyer reference (Leitweg-ID / PO / contract reference)",

  "buyerEmail": "string or null — extract if visible (contact email)",
  "buyerElectronicAddress": "string or null — electronic address/endpoint if visible (e.g. email, Leitweg-ID like 04011000-12345-67, Peppol ID like 0204:123456789). If only an email is shown and no endpoint is shown, copy the email here.",
  "buyerElectronicAddressScheme": "string or null — if buyerElectronicAddress contains '@' use 'EM'. If it starts with 4 digits followed by ':' (e.g. 0204:xxx) use those 4 digits as scheme. Otherwise leave null unless the scheme is explicitly stated.",

  "sellerName": "string or null",
  "sellerAddress": "string or null — ONLY street + house number (no postal code/city)",
  "sellerCity": "string or null",
  "sellerPostalCode": "string or null",
  "sellerCountryCode": "string (ISO 3166-1 alpha-2) or null",
  "sellerTaxId": "string or null — IMPORTANT: Check the entire invoice including footer, bottom margins, and company details section for tax identifiers",
  "sellerVatId": "string or null — EU VAT ID (starts with 2-letter country code: DE/AT/NL/FR/IT/ES/BE/PL/SE/DK/FI/etc. + digits). CRITICAL: Look in invoice footer, bottom section, and company details. Common labels: 'VAT ID', 'VAT No', 'VAT Number', 'UID', 'USt-IdNr', 'Umsatzsteuer-ID', 'BTW', 'TVA', 'IVA', 'Partita IVA', 'NIF', 'VAT Reg No', 'Moms', 'ALV'. Example formats: DE123456789, ATU12345678, NL123456789B01, FR12345678901. If only one tax ID exists and starts with a country code, copy it here AND to sellerTaxId.",
  "sellerTaxNumber": "string or null — local tax number (national format, may NOT start with country code). Examples: German Steuernummer (12/345/67890), UK Company Number (12345678), French SIRET (12345678901234). IMPORTANT: Look in footer/bottom section. If only one tax ID exists and does NOT start with a country code, copy it here AND to sellerTaxId.",
  "sellerPhone": "string or null",

  "sellerEmail": "string or null — extract if visible (contact email)",
  "sellerElectronicAddress": "string or null — seller electronic address/endpoint if visible (e.g. email, Leitweg-ID, Peppol ID like 0204:123456789). If only an email is shown and no endpoint is shown, copy the email here.",
  "sellerElectronicAddressScheme": "string or null — if sellerElectronicAddress contains '@' use 'EM'. If it starts with 4 digits followed by ':' (e.g. 0204:xxx) use those 4 digits as scheme. Otherwise leave null unless the scheme is explicitly stated.",

  "sellerIban": "string or null — SELLER (issuer) bank details only",
  "sellerBic": "string or null — SELLER BIC only",
  "bankName": "string or null — SELLER bank name only",

  "currency": "string (ISO 4217, e.g., EUR) or null",
  "paymentTerms": "string or null",
  "notes": "string or null",

  "lineItems": [
    {
      "description": "string",
      "quantity": "number",
      "unitPrice": "number — unit price per item (e.g. price per day, per piece, per km)",
      "totalPrice": "number — line total (quantity × unitPrice, often shown in rightmost column)",
      "taxRate": "number as percentage (e.g. 19, 7, 0) or null — ONLY extract if explicitly printed on the invoice for THIS line item. Do NOT calculate from totals. Do NOT copy from other lines or from an invoice-level rate.",
      "taxCategoryCode": "string or null — S/Z/E/AE/K/G. If explicitly written on invoice, copy it. Otherwise: taxRate>0 => S; taxRate=0 and marked exempt/steuerfrei => E or Z depending on wording."
    }
  ],
  "CRITICAL NOTE ON LINE ITEMS": "Extract EVERY single row from the line items table. Do NOT skip the first row. Do NOT skip any rows. If you see position numbers 1, 2, 3, 4 you MUST extract ALL 4 items. Count the position numbers to verify you extracted all rows. The sum of all line item totalPrice values should approximately equal the invoice subtotal."

  "subtotal": "number or null — net subtotal if shown. If not visible, return null — never guess or use 0.",
  "taxAmount": "number or null — total VAT amount if shown. If not visible, return null — never guess or use 0.",
  "totalAmount": "number or null — total payable/grand total if shown",

  "taxRate": "number or null — invoice-level VAT rate ONLY if a single rate is explicitly stated (e.g. 'MwSt 19%'). Do NOT calculate from subtotal and taxAmount. If multiple rates exist or no rate is shown, return null.",

  "confidence": "number (0-1)"
}

IMPORTANT:
1) Return ONLY valid JSON. No markdown. No code blocks.
2) Use null for missing fields (except lineItems: MUST be a non-empty array).
3) CRITICAL LINE ITEMS: lineItems MUST contain EVERY SINGLE ROW from the items/positions table. If the table shows positions 1, 2, 3, 4 you MUST extract ALL 4 items. DO NOT skip the first row. DO NOT skip any rows. Count the rows carefully and verify you extracted them all. Every item must have a description and a quantity > 0.
4) CRITICAL: totalAmount MUST be present as a number (use the payable/grand total shown on the invoice). Do NOT return null for totalAmount.
5) Do NOT invent data. Extract ONLY what is explicitly visible in the invoice. If a monetary value is not visible, return null — never guess or use 0.
6) Do NOT force totals to match and do NOT modify extracted totals to satisfy subtotal+tax=total. Extract exact printed values.
7) CRITICAL numeric format: all monetary numbers must be plain decimals with a dot '.' as separator. If the invoice uses comma as decimal separator (e.g. 5.508,99), convert it to dot-decimal (5508.99) in your output. Never return comma as decimal separator.
8) CRITICAL address split: buyerAddress & sellerAddress must contain ONLY street + house number. City and postal code must be separate fields.
9) CRITICAL VAT rates: each line item MUST independently extract its own taxRate. Do NOT assume a single VAT rate. Do NOT copy an invoice-level rate to line items unless that rate is explicitly printed on each line.
10) Bank details: sellerIban/sellerBic/bankName must be SELLER's details only. If the invoice describes direct debit from the buyer's account, do NOT use that IBAN as sellerIban — set sellerIban=null.
11) Continuation lines: product descriptions may span multiple lines. If a row has no qty/price and looks like a continuation, merge it into the previous item's description.
12) CRITICAL taxRate policy: Do NOT calculate taxRate from subtotal and taxAmount. Do NOT derive taxRate from any arithmetic. Only extract taxRate if the percentage is explicitly printed on the invoice.
13) Electronic addresses: If the invoice shows a Leitweg-ID, Peppol participant ID (e.g. 0204:123456789), or other electronic endpoint, extract it into buyerElectronicAddress/sellerElectronicAddress with the appropriate scheme. These are separate from email addresses.
14) CRITICAL footer scanning: ALWAYS scan the entire invoice including the footer/bottom section. Tax identifiers (VAT ID, VAT Number, Company Registration Number, Tax Number) are commonly located in the footer or company details section. Do NOT ignore the bottom 20% of the invoice page. European invoices typically show VAT IDs in footer format like "VAT: DExxxxxxxxx", "UID: ATUxxxxxxxx", "BTW: NLxxxxxxxxBxx", "IVA: ESxxxxxxxxx", "TVA: FRxxxxxxxxxx", etc.

Extract the data now:`;
