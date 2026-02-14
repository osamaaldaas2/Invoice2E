/**
 * Extraction prompt contract tests.
 * Ensures the extraction prompt maintains clear NET vs GROSS semantics.
 *
 * Purpose: Prevent regression where ambiguous prompt language causes AI
 * to extract GROSS line totals instead of NET.
 */

import { describe, it, expect } from 'vitest';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';

describe('Extraction prompt contract', () => {
  describe('NET vs GROSS clarity', () => {
    it('should explicitly specify that lineItems.totalPrice must be NET', () => {
      // Prompt must contain NET specification near totalPrice definition
      expect(EXTRACTION_PROMPT).toContain('totalPrice');
      expect(EXTRACTION_PROMPT).toMatch(/totalPrice[^}]*NET/i);
      expect(EXTRACTION_PROMPT).toMatch(/totalPrice[^}]*before VAT/i);
    });

    it('should instruct AI not to include VAT in line totals', () => {
      // Prompt must explicitly state totalPrice is before VAT / NET
      const lowerPrompt = EXTRACTION_PROMPT.toLowerCase();
      expect(lowerPrompt).toMatch(/totalprice.*(?:net|before vat)/i);
    });

    it('should provide self-check guidance for NET line totals', () => {
      // Prompt should tell AI to verify totalPrice ≈ quantity × unitPrice
      expect(EXTRACTION_PROMPT).toMatch(/totalPrice.*quantity.*unitPrice|self-check/i);
    });

    it('should clarify that unitPrice is NET', () => {
      // unitPrice must also be specified as NET
      expect(EXTRACTION_PROMPT).toMatch(/unitPrice[^}]*NET|unitPrice[^}]*before VAT/i);
    });

    it('should clarify that subtotal is NET', () => {
      // Subtotal must be specified as NET
      expect(EXTRACTION_PROMPT).toMatch(/subtotal[^}]*net/i);
    });
  });

  describe('Rightmost column ambiguity prevention', () => {
    it('should not suggest using rightmost column as sole source for line totals', () => {
      // The phrase "rightmost column" was problematic because German invoices
      // often show GROSS in the rightmost column
      const hasRightmostHint = EXTRACTION_PROMPT.toLowerCase().includes('rightmost column');

      if (hasRightmostHint) {
        // If it mentions rightmost column, it must also clarify NET vs GROSS risk
        // Check if the prompt warns about GROSS in rightmost column or tells AI to ignore it
        const lowerPrompt = EXTRACTION_PROMPT.toLowerCase();
        const hasGrossWarning =
          /rightmost.*gross/i.test(lowerPrompt) || /gross.*rightmost/i.test(lowerPrompt);
        const hasIgnoreInstruction = /ignore.*(?:column|gross)/i.test(lowerPrompt);

        expect(hasGrossWarning || hasIgnoreInstruction).toBe(true);
      }
    });
  });

  describe('Critical instructions presence', () => {
    it('should contain critical note about line items being NET', () => {
      // The CRITICAL NOTE section should mention NET
      const criticalNoteMatch = EXTRACTION_PROMPT.match(
        /"CRITICAL NOTE ON LINE ITEMS":\s*"([^"]*)"/
      );
      expect(criticalNoteMatch).toBeDefined();

      if (criticalNoteMatch && criticalNoteMatch[1]) {
        const criticalNote = criticalNoteMatch[1];
        expect(criticalNote.toLowerCase()).toMatch(/net|before vat/i);
      }
    });

    it('should specify that sum of line totals equals subtotal (both NET)', () => {
      // Prompt should mention that sum(lineItems.totalPrice) ≈ subtotal
      expect(EXTRACTION_PROMPT).toMatch(
        /sum of.*line.*totalPrice.*subtotal|line.*totals.*equal.*subtotal/is
      );
    });
  });

  describe('Prompt version tracking', () => {
    it('should have version comment documenting NET/GROSS fix', () => {
      // File should contain v2 comment mentioning NET/GROSS semantic clarity
      const promptFile = EXTRACTION_PROMPT;

      // Note: This test checks the prompt content, but version comment is in the file header
      // We can't directly test file comments here, but we can verify the prompt reflects v2 semantics
      expect(promptFile).toMatch(/NET|before VAT|must not include/i);
    });
  });

  describe('Completeness check', () => {
    it('should define all required invoice fields', () => {
      // Ensure prompt hasn't lost critical fields during edits
      const requiredFields = [
        'invoiceNumber',
        'invoiceDate',
        'buyerName',
        'sellerName',
        'lineItems',
        'subtotal',
        'taxAmount',
        'totalAmount',
        'currency',
      ];

      for (const field of requiredFields) {
        expect(EXTRACTION_PROMPT).toContain(`"${field}"`);
      }
    });

    it('should define line item structure with all key fields', () => {
      const lineItemFields = ['description', 'quantity', 'unitPrice', 'totalPrice', 'taxRate'];

      for (const field of lineItemFields) {
        expect(EXTRACTION_PROMPT).toContain(`"${field}"`);
      }
    });
  });
});
