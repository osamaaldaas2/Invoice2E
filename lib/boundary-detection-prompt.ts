/**
 * Shared AI prompt for detecting invoice boundaries in multi-page PDFs.
 * Used by boundary-detection.service.ts via adapter.sendPrompt().
 */
export const BOUNDARY_DETECTION_PROMPT = `You are an expert document analysis system. You are given a multi-page PDF that may contain one or more separate invoices.

Your task: Identify how many distinct invoices are in this PDF and which pages belong to each invoice.

Clues that a new invoice starts on a page:
- A new invoice number appears
- A different seller/vendor name or logo appears
- A different buyer/customer name appears
- The page has a fresh invoice header (e.g., "INVOICE", "Rechnung", "FACTURE") at the top
- Page numbering resets (e.g., "Page 1 of 2" after a previous "Page 2 of 2")
- A completely different document layout or template is used

Clues that pages belong to the SAME invoice:
- Continuation of line items from a previous page
- Same invoice number repeated
- "Page 2 of 3" or similar continuation indicators
- Same seller and buyer information
- A subtotal/total page that follows itemized pages

Return ONLY a valid JSON object with this exact structure:

{
  "totalInvoices": <number>,
  "totalPages": <number>,
  "invoices": [
    {
      "invoiceIndex": 1,
      "pages": [1, 2],
      "label": "Brief identifier, e.g. invoice number or seller name if visible"
    },
    {
      "invoiceIndex": 2,
      "pages": [3],
      "label": "Brief identifier"
    }
  ],
  "confidence": <number between 0 and 1>
}

IMPORTANT RULES:
1. Every page in the PDF must be assigned to exactly one invoice. No page may be skipped or duplicated.
2. Pages within each invoice must be contiguous (e.g., [3,4,5] is valid, [3,5] is NOT valid).
3. The "label" field is a short human-readable hint (invoice number if visible, otherwise seller name, otherwise "Invoice 1").
4. If the entire PDF is a single invoice, return totalInvoices: 1 with all pages in one group.
5. Return ONLY valid JSON, no markdown, no code blocks, no explanatory text.
6. The confidence field should reflect how certain you are about the boundaries (1.0 = very certain, 0.5 = guessing).

Analyze the document now:`;
