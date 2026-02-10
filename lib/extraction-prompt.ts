/**
 * Shared AI extraction prompt — single source of truth.
 * Used by gemini.service.ts (single upload), gemini.adapter.ts, and deepseek.adapter.ts (batch upload).
 */
export const EXTRACTION_PROMPT = `You are an expert invoice extraction system. Extract invoice data from the provided image and return a JSON object with the following structure:

{
  "invoiceNumber": "string or null",
  "invoiceDate": "string (YYYY-MM-DD) or null",
  "buyerName": "string or null",
  "buyerEmail": "string or null",
  "buyerAddress": "string or null",
  "buyerCity": "string or null",
  "buyerPostalCode": "string or null",
  "buyerCountryCode": "string (ISO 3166-1 alpha-2, e.g. DE, AT, CH) or null",
  "buyerTaxId": "string or null",
  "buyerPhone": "string or null",
  "sellerName": "string or null",
  "sellerEmail": "string or null",
  "sellerAddress": "string or null",
  "sellerCity": "string or null",
  "sellerPostalCode": "string or null",
  "sellerCountryCode": "string (ISO 3166-1 alpha-2, e.g. DE, AT, CH) or null",
  "sellerTaxId": "string or null",
  "sellerIban": "string or null",
  "sellerBic": "string or null",
  "sellerPhone": "string or null",
  "bankName": "string or null",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "taxRate": number as percentage (e.g. 19 for 19%, 7 for 7%, NOT 0.19) or null
    }
  ],
  "subtotal": number,
  "taxRate": number as percentage (e.g. 19 for 19%, NOT 0.19) or null,
  "taxAmount": number,
  "totalAmount": number,
  "currency": "string (e.g., EUR, USD)",
  "paymentTerms": "string or null",
  "notes": "string or null",
  "confidence": number (0-1)
}

IMPORTANT:
1. Extract ALL visible information from the invoice
2. For prices, use the exact values shown as numbers
3. If the tax rate is not explicitly shown on the invoice, return taxRate as null — do NOT calculate it yourself
4. Return ONLY valid JSON, no markdown, no code blocks
5. Use null for missing fields
6. Ensure all numbers are valid numbers, not strings
7. Be accurate with dates (YYYY-MM-DD format)
8. CRITICAL: buyerAddress & sellerAddress must contain ONLY the street address. Extract city and postal code as SEPARATE fields in buyerCity/sellerCity and buyerPostalCode/sellerPostalCode. For example, "Herrenstr. 18d, 24768 Rendsburg" should become: sellerAddress="Herrenstr. 18d", sellerCity="Rendsburg", sellerPostalCode="24768"
9. Extract phone numbers into sellerPhone/buyerPhone if visible on the invoice
10. CRITICAL: All monetary values (subtotal, taxAmount, totalAmount, unitPrice, totalPrice) must be plain decimal numbers using a dot (.) as the decimal separator. Never use a comma as a decimal separator. Never omit digits. For example: 5508.99 is correct, while 5.508,99 or 5508,99 or 5.50899 are all WRONG. Double-check that totalAmount = subtotal + taxAmount.
11. CRITICAL: Each lineItem MUST have its own correct taxRate. Do NOT assume all items share the same tax rate. Invoices often mix different VAT rates (e.g. 19% for goods, 7% for food/books, 0% for tax-exempt items like travel costs/Reisekosten, insurance, exports). Look carefully at the tax breakdown section, footnotes, annotations, and any text outside the main table that indicates a different tax rate for specific items. Items marked as "steuerfrei", "0% MwSt", "exempt", typically have taxRate 0.
12. CRITICAL for sellerIban/sellerBic/bankName: These fields must contain the SELLER's (invoice issuer's) bank details, NOT the buyer's. On invoices with SEPA direct debit (Lastschrift/Abbuchung), the text "Abbuchung von Ihrem Konto" or "wird eingezogen von" refers to the BUYER's bank account — do NOT use that IBAN as sellerIban. The seller's bank details are typically in the invoice footer, header, or a dedicated "Bankverbindung" section. If only the buyer's IBAN is visible (e.g. in a direct debit notice), set sellerIban to null.
13. CRITICAL for lineItems: Product descriptions sometimes span multiple rows/lines in the invoice table. If a row has NO unit price or a unit price of 0 and appears directly below another item, it is almost certainly a CONTINUATION of the previous item's description — merge it into one lineItem. Indicators of a continuation line: no quantity, no price, same article/position number, or the text is clearly part of the product name above (e.g. "Lexware elektronisches" + "Fahrtenbuch" = one product "Lexware elektronisches Fahrtenbuch"). Never create a lineItem with unitPrice 0 unless it is genuinely a free item explicitly marked as such.

Extract the data now:`;
