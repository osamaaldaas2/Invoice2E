/**
 * Shared AI prompt for detecting invoice boundaries in multi-page PDFs.
 * Used by boundary-detection.service.ts via adapter.sendPrompt().
 */
export const BOUNDARY_DETECTION_PROMPT = `You are an expert document analysis system. You are given a multi-page PDF that may contain one or more separate invoices.

Your task: Identify how many distinct invoices are in this PDF and which pages belong to each invoice.

⚠️ CRITICAL: Many PDFs contain ONE INVOICE PER PAGE. If each page has its own invoice number, its own seller/buyer, and its own total — each page is a SEPARATE invoice. Do NOT group them together just because they look similar or come from the same company.

How to decide if a page is a NEW invoice:
- The page has its own invoice number (even if format is similar to other pages)
- The page has its own total/amount
- The page has a complete invoice header ("INVOICE", "Rechnung", "FACTURE")
- Different buyer/customer name than the previous page
- Different invoice date than the previous page
- A new seller/vendor name or different template/layout

How to decide if pages belong to the SAME invoice:
- Explicit continuation: "Page 2 of 3", "Fortsetzung", "continued"
- Same invoice number on both pages
- The second page has NO invoice header — only line items continuing from previous page
- A subtotal/total page that references the same invoice number

⚠️ DEFAULT ASSUMPTION: If a page has its own invoice number AND its own total amount, it is a SEPARATE invoice — even if the layout is identical to other pages. A PDF with 29 pages where each page is a complete invoice = 29 separate invoices.

Return ONLY a valid JSON object with this exact structure:

{
  "totalInvoices": <number>,
  "totalPages": <number>,
  "invoices": [
    {
      "invoiceIndex": 1,
      "pages": [1],
      "label": "Brief identifier, e.g. invoice number or seller name if visible"
    },
    {
      "invoiceIndex": 2,
      "pages": [2],
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
7. When in doubt, SPLIT rather than merge. It is better to have too many invoices than too few.

Analyze the document now:`;
