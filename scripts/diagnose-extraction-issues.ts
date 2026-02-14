/**
 * Diagnostic script for invoice extraction issues.
 * Investigates: missing line items + German number format parsing.
 *
 * Usage:
 *   npx tsx scripts/diagnose-extraction-issues.ts <extraction-id>
 *
 * Or provide JSON directly:
 *   npx tsx scripts/diagnose-extraction-issues.ts --json <path-to-extracted.json>
 */

// Future: Add Supabase integration to fetch extraction data by ID
// import { createClient } from '@supabase/supabase-js';

interface DiagnosticResult {
  investigationId: string;
  timestamp: string;
  extractionId?: string;
  findings: {
    tableRowCount: {
      status: 'PENDING' | 'MANUAL_CHECK_REQUIRED';
      note: string;
      expectedCount?: number;
    };
    extractedRowCount: {
      count: number;
      descriptions: string[];
    };
    missingRows: {
      status: 'POSSIBLE' | 'NONE';
      suspectedMissing: string[];
      evidence: string;
    };
    germanNumberParsing: {
      suspiciousFields: Array<{
        row: number;
        field: string;
        rawText: string;
        parsedValue: number;
        expectedValue?: number;
        issue: string;
      }>;
    };
    arithmeticReconciliation: {
      lineItemMismatches: Array<{
        index: number;
        description: string;
        quantity: number;
        unitPrice: number;
        expectedTotal: number;
        actualTotal: number;
        deviation: number;
        status: 'PASS' | 'FAIL';
      }>;
    };
    headerTotalsReconciliation: {
      sumLines: number;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      subtotalMatch: boolean;
      totalMatch: boolean;
      status: 'PASS' | 'FAIL';
    };
    rootCauses: Array<'MISSING_LINE_ITEM' | 'LOCALE_NUMBER_PARSING' | 'NET_GROSS_CONFUSION' | 'OTHER'>;
    recommendations: string[];
  };
}

/**
 * Detect German number format issues.
 * German: 1.196 = 1196 (dot = thousands), 4.370,00 = 4370.00 (comma = decimal)
 * US: 1,196 = 1196 (comma = thousands), 4,370.00 = 4370.00 (dot = decimal)
 */
function detectGermanNumberIssue(value: number, description: string): {
  suspicious: boolean;
  issue?: string;
  expectedValue?: number;
} {
  // Check if value looks like it was parsed with wrong locale
  // Example: "1.196" parsed as 1.196 instead of 1196

  // Heuristic 1: Quantity between 1 and 10 with 3 decimal places (likely thousands)
  if (value > 1 && value < 10 && value % 1 !== 0) {
    const digitsAfterDecimal = value.toString().split('.')[1]?.length || 0;
    if (digitsAfterDecimal === 3) {
      return {
        suspicious: true,
        issue: 'Quantity with 3 decimals - likely thousands separator parsed as decimal',
        expectedValue: Math.round(value * 1000),
      };
    }
  }

  // Heuristic 2: Very large quantities (>10000) that might be misparsed
  if (value > 10000 && description.toLowerCase().includes('km')) {
    // Could be misparsed: 1.196 km read as 1196 km instead of 1.196 km
    return {
      suspicious: true,
      issue: 'Very large quantity - might be German decimal parsed as integer',
      expectedValue: value / 1000,
    };
  }

  // Heuristic 3: Price with suspicious precision
  if (value > 1000 && value % 10 === 0) {
    // Example: 4370 might be 4.370,00 misparsed
    return {
      suspicious: false, // Not necessarily wrong, but worth checking
    };
  }

  return { suspicious: false };
}

/**
 * Reconcile line item arithmetic: totalPrice should equal quantity × unitPrice (NET)
 */
function reconcileLineItem(item: {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}, index: number) {
  const expectedTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
  const actualTotal = item.totalPrice;
  const deviation = Math.abs(expectedTotal - actualTotal);
  const tolerancePercent = 0.01;
  const toleranceAbsolute = 0.05;

  const status: 'PASS' | 'FAIL' = deviation <= toleranceAbsolute || deviation / expectedTotal <= tolerancePercent
    ? 'PASS'
    : 'FAIL';

  return {
    index,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    expectedTotal,
    actualTotal,
    deviation,
    status,
  };
}

/**
 * Main diagnostic function
 */
export async function diagnoseExtraction(extractedData: {
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRate?: number;
  }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}): Promise<DiagnosticResult> {
  const findings: DiagnosticResult['findings'] = {
    tableRowCount: {
      status: 'MANUAL_CHECK_REQUIRED',
      note: 'Please manually count rows in the invoice table (look for position numbers 1, 2, 3, ...)',
    },
    extractedRowCount: {
      count: extractedData.lineItems.length,
      descriptions: extractedData.lineItems.map(item => item.description),
    },
    missingRows: {
      status: 'POSSIBLE',
      suspectedMissing: [],
      evidence: 'Manual comparison required with invoice table',
    },
    germanNumberParsing: {
      suspiciousFields: [],
    },
    arithmeticReconciliation: {
      lineItemMismatches: [],
    },
    headerTotalsReconciliation: {
      sumLines: 0,
      subtotal: extractedData.subtotal,
      taxAmount: extractedData.taxAmount,
      totalAmount: extractedData.totalAmount,
      subtotalMatch: false,
      totalMatch: false,
      status: 'FAIL',
    },
    rootCauses: [],
    recommendations: [],
  };

  // S4: German number parsing detection
  extractedData.lineItems.forEach((item, index) => {
    const qtyCheck = detectGermanNumberIssue(item.quantity, item.description);
    if (qtyCheck.suspicious) {
      findings.germanNumberParsing.suspiciousFields.push({
        row: index,
        field: 'quantity',
        rawText: item.quantity.toString(),
        parsedValue: item.quantity,
        expectedValue: qtyCheck.expectedValue,
        issue: qtyCheck.issue || 'Unknown',
      });
    }

    const priceCheck = detectGermanNumberIssue(item.unitPrice, item.description);
    if (priceCheck.suspicious) {
      findings.germanNumberParsing.suspiciousFields.push({
        row: index,
        field: 'unitPrice',
        rawText: item.unitPrice.toString(),
        parsedValue: item.unitPrice,
        expectedValue: priceCheck.expectedValue,
        issue: priceCheck.issue || 'Unknown',
      });
    }
  });

  // S5: Arithmetic reconciliation
  extractedData.lineItems.forEach((item, index) => {
    const reconciliation = reconcileLineItem(item, index);
    if (reconciliation.status === 'FAIL') {
      findings.arithmeticReconciliation.lineItemMismatches.push(reconciliation);
    }
  });

  // S6: Header totals reconciliation
  const sumLines = extractedData.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const roundedSumLines = Math.round(sumLines * 100) / 100;
  const roundedSubtotal = Math.round(extractedData.subtotal * 100) / 100;
  const computedTotal = Math.round((extractedData.subtotal + extractedData.taxAmount) * 100) / 100;
  const roundedTotal = Math.round(extractedData.totalAmount * 100) / 100;

  findings.headerTotalsReconciliation.sumLines = roundedSumLines;
  findings.headerTotalsReconciliation.subtotalMatch = Math.abs(roundedSumLines - roundedSubtotal) <= 0.02;
  findings.headerTotalsReconciliation.totalMatch = Math.abs(computedTotal - roundedTotal) <= 0.02;
  findings.headerTotalsReconciliation.status =
    findings.headerTotalsReconciliation.subtotalMatch && findings.headerTotalsReconciliation.totalMatch
      ? 'PASS'
      : 'FAIL';

  // S7: Classify root causes
  if (findings.germanNumberParsing.suspiciousFields.length > 0) {
    findings.rootCauses.push('LOCALE_NUMBER_PARSING');
    findings.recommendations.push(
      'CRITICAL: German number format detected. Values like "1.196" are being parsed as 1.196 instead of 1196. ' +
      'The extraction normalizer (safeNumberStrict) should handle this, but AI might be returning wrong format.'
    );
  }

  if (!findings.headerTotalsReconciliation.subtotalMatch) {
    const diff = Math.abs(roundedSumLines - roundedSubtotal);
    const diffPercent = (diff / roundedSubtotal) * 100;

    if (diffPercent > 50) {
      findings.rootCauses.push('MISSING_LINE_ITEM');
      findings.recommendations.push(
        `CRITICAL: Sum of line items (${roundedSumLines}) differs significantly from subtotal (${roundedSubtotal}). ` +
        `Difference: ${diff.toFixed(2)} (${diffPercent.toFixed(1)}%). Likely missing line items.`
      );
    } else if (diffPercent > 5) {
      findings.rootCauses.push('NET_GROSS_CONFUSION');
      findings.recommendations.push(
        `WARNING: Sum of line items (${roundedSumLines}) differs from subtotal (${roundedSubtotal}) by ${diffPercent.toFixed(1)}%. ` +
        'This could indicate NET vs GROSS confusion or partial line item extraction.'
      );
    }
  }

  if (findings.arithmeticReconciliation.lineItemMismatches.length > 0) {
    findings.recommendations.push(
      `Found ${findings.arithmeticReconciliation.lineItemMismatches.length} line items where totalPrice ≠ quantity × unitPrice. ` +
      'Check if these are German number parsing errors or NET vs GROSS issues.'
    );
  }

  if (findings.rootCauses.length === 0) {
    findings.rootCauses.push('OTHER');
    findings.recommendations.push(
      'No obvious issues detected. Manual review of invoice table vs extracted line items is recommended.'
    );
  }

  return {
    investigationId: `DIAG_${Date.now()}`,
    timestamp: new Date().toISOString(),
    findings,
  };
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx scripts/diagnose-extraction-issues.ts --json <path-to-extracted.json>');
    console.log('Or provide extraction data via stdin');
    process.exit(1);
  }

  if (args[0] === '--json') {
    const fs = require('fs');
    const path = args[1];
    const data = JSON.parse(fs.readFileSync(path, 'utf-8'));

    diagnoseExtraction(data).then(result => {
      console.log(JSON.stringify(result, null, 2));
    });
  }
}
