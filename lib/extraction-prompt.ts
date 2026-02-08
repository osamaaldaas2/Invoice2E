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
  "buyerTaxId": "string or null",
  "buyerPhone": "string or null",
  "sellerName": "string or null",
  "sellerEmail": "string or null",
  "sellerAddress": "string or null",
  "sellerCity": "string or null",
  "sellerPostalCode": "string or null",
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
      "taxRate": number or null
    }
  ],
  "subtotal": number,
  "taxRate": number or null,
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
3. If tax is not separate, calculate based on total and subtotal
4. Return ONLY valid JSON, no markdown, no code blocks
5. Use null for missing fields
6. Ensure all numbers are valid numbers, not strings
7. Be accurate with dates (YYYY-MM-DD format)
8. CRITICAL: buyerAddress & sellerAddress must contain ONLY the street address. Extract city and postal code as SEPARATE fields in buyerCity/sellerCity and buyerPostalCode/sellerPostalCode. For example, "Herrenstr. 18d, 24768 Rendsburg" should become: sellerAddress="Herrenstr. 18d", sellerCity="Rendsburg", sellerPostalCode="24768"
9. Extract phone numbers into sellerPhone/buyerPhone if visible on the invoice
10. CRITICAL: All monetary values (subtotal, taxAmount, totalAmount, unitPrice, totalPrice) must be plain decimal numbers using a dot (.) as the decimal separator. Never use a comma as a decimal separator. Never omit digits. For example: 5508.99 is correct, while 5.508,99 or 5508,99 or 5.50899 are all WRONG. Double-check that totalAmount = subtotal + taxAmount.

Extract the data now:`;
