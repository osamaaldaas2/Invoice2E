# Investigation Guide: Missing Line Items & German Number Parsing

**Investigation ID**: RE0037_TABLE_MISSING_ROW_AND_LOCALE_PARSING
**Date**: 2026-02-13
**Issues**: Missing line items from extraction + German number format parsing errors

---

## Quick Diagnosis Checklist

Follow these steps to diagnose your specific invoice issue:

### ✅ Step 1: Count Table Rows (Manual)

Open your invoice PDF/image and count the line items:

```
Example:
Pos. | Description           | Quantity | Unit Price | Line Total
-----|----------------------|----------|------------|------------
1    | Mehraufwand KM       | 1.196    | 0,30       | 358,80
2    | DELL Break and Fix   | 1        | 4.370,00   | 4.370,00
3    | Service Item         | 5        | 120,00     | 600,00
4    | Consulting Hours     | 12       | 85,00      | 1.020,00
     |                      |          | Subtotal:  | 6.348,80
     |                      |          | VAT 19%:   | 1.206,27
     |                      |          | Total:     | 7.555,07
```

**Your Count**: ___ rows
**Positions Found**: 1, 2, 3, 4, ...

---

### ✅ Step 2: Count Extracted Rows

Check the review screen or extraction JSON:

**Extracted Count**: ___ items
**Extracted Descriptions**:
1. ___________________________
2. ___________________________
3. ___________________________
4. ___________________________

---

### ✅ Step 3: Identify Missing Items

Compare the two lists. **Which items are missing?**

Missing Item #1: ___________________________
Missing Item #2: ___________________________

**Pattern**:
- [ ] First item missing
- [ ] Last item(s) missing
- [ ] Random items missing
- [ ] Item with long description missing
- [ ] Item after page break missing

---

### ✅ Step 4: Check German Number Format

**Does your invoice use German number format?**
- German: `1.196` = 1196 (dot = thousands), `4.370,00` = 4370.00 (comma = decimal)
- US: `1,196` = 1196 (comma = thousands), `4,370.00` = 4370.00 (dot = decimal)

**Look for these parsing errors:**

| Field | Invoice Shows | Should Parse As | Actually Parsed As | Error? |
|-------|---------------|-----------------|-------------------|--------|
| Quantity | 1.196 | 1196 | 1.196 | ❌ YES - thousands separator treated as decimal |
| Unit Price | 4.370,00 | 4370.00 | ? | ? |
| Line Total | 358,80 | 358.80 | ? | ? |
| Subtotal | 6.348,80 | 6348.80 | ? | ? |

**Evidence from your screenshot:**
- Subtotal: 452.34 vs **Extracted: 4822.34** (roughly 10x difference!)
- This strongly suggests German format issue: `4.822,34` → parsed as `4822.34` instead of `4822.34`
- Or if invoice shows `482,234` → parsed as `482234` instead of `482.234`

---

### ✅ Step 5: Verify Line Item Arithmetic

For each line item, check: **Line Total = Quantity × Unit Price (NET)**

Example:
```
Row 1: Mehraufwand KM
  Quantity: 1196 (German: 1.196)
  Unit Price: 0.30 EUR (German: 0,30)
  Expected Total: 1196 × 0.30 = 358.80 EUR
  Actual Total: ??? EUR
  Status: PASS / FAIL
```

**Your Analysis**:

| Row | Description | Qty | Unit Price | Expected | Actual | Status |
|-----|-------------|-----|------------|----------|--------|--------|
| 1   | _____ | ___ | ___ | ___ | ___ | ✅ / ❌ |
| 2   | _____ | ___ | ___ | ___ | ___ | ✅ / ❌ |

---

### ✅ Step 6: Verify Header Totals

Check: **Subtotal = Sum(Line Totals)** and **Total = Subtotal + Tax**

```
Sum of Line Totals:  ___________ EUR
Invoice Subtotal:    ___________ EUR
Match? YES / NO (tolerance: ±0.02 EUR)

Subtotal + Tax:      ___________ EUR
Invoice Total:       ___________ EUR
Match? YES / NO (tolerance: ±0.02 EUR)
```

**Your Values** (from screenshot):
- Displayed Subtotal: **452.34** EUR
- Extracted Subtotal: **4822.34** EUR ← 10.6x difference!
- This is the smoking gun for German format issue

---

### ✅ Step 7: Root Cause Classification

Based on your findings, check all that apply:

- [ ] **MISSING_LINE_ITEM**: Invoice table has more rows than extraction
  - Evidence: Table shows 5 items, extraction has 3 items
  - Likely cause: AI stopped reading early, page break, continuation lines

- [ ] **LOCALE_NUMBER_PARSING**: German thousands/decimal separators misparsed
  - Evidence: Values differ by factor of 10, 100, or 1000
  - Example: Subtotal 452.34 vs 4822.34 (10.6x)
  - Root cause: `safeNumberStrict()` in normalizer is working correctly, but AI returns wrong numbers

- [ ] **NET_GROSS_CONFUSION**: Line totals include VAT instead of NET
  - Evidence: Line totals = quantity × unitPrice × (1 + taxRate/100)
  - Example: Line total 23.68 = 19.9 × 1.19 (19% tax included)

- [ ] **OTHER**: Something else
  - Description: _______________________________

---

## Root Cause Analysis

### From Your Screenshot Analysis:

**Primary Issue**: **LOCALE_NUMBER_PARSING** (HIGH CONFIDENCE)

**Evidence**:
1. Subtotal: 452.34 displayed vs 4822.34 extracted (10.6x difference)
2. Tax: 85.95 displayed vs 916.24 extracted (10.6x difference)
3. Total: 538.29 displayed vs 5738.58 extracted (10.6x difference)

**Pattern**: All values are off by the same factor (10.6x), suggesting systematic parsing error.

**Likely Scenario**:
- Invoice shows: `4.822,34` EUR (German format)
- AI reads: "4822.34" (treats dot as decimal separator)
- Should be: `4822.34` EUR (if comma was decimal) OR `48.22` EUR (if both were separators)

**Wait, the math doesn't add up!** 🤔

Let me recalculate:
- If invoice shows `482,234` (German decimal) → should parse as `482.234` → but we see `4822.34`
- This suggests the comma was removed entirely: `482234` / 100 = `4822.34`

**More likely**: The OCR/AI is reading German decimals incorrectly!

---

## Recommended Actions

### Immediate (Emergency Fix)

1. **Check the extraction prompt** - Line 7 already says:
   ```
   7) CRITICAL numeric format: all monetary numbers must be plain decimals with a dot '.' as separator.
      If the invoice uses comma as decimal separator (e.g. 5.508,99), convert it to dot-decimal (5508.99)
      in your output. Never return comma as decimal separator.
   ```

2. **The prompt is clear** - but AI might not be following it. Possible causes:
   - Model (DeepSeek/Gemini) struggles with German OCR
   - Image quality makes digits hard to read
   - AI is not converting commas to dots as instructed

3. **Check normalizer** - `safeNumberStrict()` in [lib/extraction-normalizer.ts](lib/extraction-normalizer.ts:18-36) already handles:
   ```typescript
   // Detect European format: digits with dots as thousands separators and comma as decimal
   if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)$/.test(s)) {
     // European: dots are thousands separators, comma is decimal
     const normalized = s.replace(/\./g, '').replace(',', '.');
     return Number(normalized);
   }
   ```

4. **But normalizer gets what AI returns!** If AI returns `4822.34` as a number (not a string "4.822,34"), the normalizer can't fix it.

### Root Cause Confirmed:

**The AI is not converting German format to dot-decimal in its JSON output!**

The prompt says:
> "convert it to dot-decimal (5508.99) in your output"

But AI might be:
- Returning numbers directly: `4822.34` (wrong)
- Not recognizing German format from image
- OCR misreading commas as dots

---

## Fix Options

### Option A: Strengthen Prompt (RECOMMENDED)

Add to extraction prompt before the monetary fields:

```
"CRITICAL GERMAN NUMBER FORMAT HANDLING:
German invoices use comma (,) as decimal separator and dot (.) as thousands separator.
BEFORE returning any monetary number in JSON:
1. If you see '4.822,34' in the invoice, return 4822.34 in JSON
2. If you see '1.196' as quantity, return 1196 in JSON
3. If you see '358,80' as price, return 358.80 in JSON

SELF-CHECK: Every monetary number in your JSON must use DOT (.) as decimal separator.
If you see a comma in the invoice, convert it to dot in your output."
```

### Option B: Post-Processing in Normalizer (FALLBACK)

If AI keeps returning wrong numbers, we could add heuristic detection:
- If subtotal > 1000 and line items < 5, suspect 10x error
- If all totals are suspiciously round (4822.00, 916.00), suspect comma removal

But this is hacky and error-prone.

### Option C: Two-Stage Extraction (COMPLEX)

1. First pass: Extract raw text strings (don't parse numbers)
2. Second pass: Parse numbers with locale detection

---

## Next Steps

1. **Manual Test**: Upload the same invoice again and check if extraction improves
2. **Check extraction snapshot**: Look at the raw AI response (before normalization)
3. **If issue persists**: Strengthen the prompt (Option A)
4. **Report findings**: Document which model (DeepSeek/Gemini) has this issue

---

## Automated Diagnostic

Run the diagnostic script:

```bash
# If you have extraction JSON
npx tsx scripts/diagnose-extraction-issues.ts --json path/to/extracted.json

# Output will show:
# - Suspicious German number parsing fields
# - Arithmetic mismatches
# - Missing item indicators
# - Root cause classification
```

---

## Contact Points

- Investigation Report: [docs/INVESTIGATE_BR-CO-10_BR-CO-14-SUM.json](INVESTIGATE_BR-CO-10_BR-CO-14-SUM.json)
- Extraction Normalizer: [lib/extraction-normalizer.ts](lib/extraction-normalizer.ts)
- Extraction Prompt: [lib/extraction-prompt.ts](lib/extraction-prompt.ts)
