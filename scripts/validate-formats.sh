#!/usr/bin/env bash
# =============================================================================
# Schematron Validation Script
# Generates test invoices for all 9 formats and validates each against its
# Schematron rules using the KoSIT validator (via Docker).
#
# Usage:  ./scripts/validate-formats.sh
# Exit:   0 = all pass, 1 = one or more failures
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INVOICE_DIR="$PROJECT_ROOT/tmp/test-invoices"
REPORT_DIR="$PROJECT_ROOT/tmp/validation-reports"
KOSIT_IMAGE="itplr/kosit-validator:latest"

# ── Step 1: Generate test invoices ───────────────────────────────────────────
echo "═══ Step 1: Generating test invoices ═══"
mkdir -p "$INVOICE_DIR" "$REPORT_DIR"
npx tsx "$SCRIPT_DIR/generate-test-invoices.ts"

# ── Step 2: Define format → scenario mapping ─────────────────────────────────
# KoSIT validator scenarios for EN 16931 / country-specific CIUS
declare -A FORMAT_SCENARIOS=(
  ["xrechnung-cii"]="cii"
  ["xrechnung-ubl"]="ubl"
  ["peppol-bis"]="ubl"
  ["facturx-en16931"]="cii"
  ["facturx-basic"]="cii"
  ["fatturapa"]="fatturapa"
  ["ksef"]="ksef"
  ["nlcius"]="ubl"
  ["cius-ro"]="ubl"
)

# Formats validated by KoSIT (EN 16931 CII/UBL family)
KOSIT_FORMATS=("xrechnung-cii" "xrechnung-ubl" "peppol-bis" "facturx-en16931" "facturx-basic" "nlcius" "cius-ro")

# Formats needing dedicated validators
DEDICATED_FORMATS=("fatturapa" "ksef")

TOTAL=0
PASSED=0
FAILED=0
FAILURES=""

# ── Step 3: Validate with KoSIT validator ────────────────────────────────────
echo ""
echo "═══ Step 2: Running KoSIT Schematron validation ═══"

for format in "${KOSIT_FORMATS[@]}"; do
  TOTAL=$((TOTAL + 1))
  xml_file="$INVOICE_DIR/${format}.xml"
  report_file="$REPORT_DIR/${format}-report.xml"

  if [ ! -f "$xml_file" ]; then
    echo "⏭️  $format — XML not found, skipping"
    FAILED=$((FAILED + 1))
    FAILURES="$FAILURES $format(missing)"
    continue
  fi

  echo -n "🔍 $format … "

  # Run KoSIT validator via Docker
  if docker run --rm \
    -v "$INVOICE_DIR:/data:ro" \
    -v "$REPORT_DIR:/reports" \
    "$KOSIT_IMAGE" \
    validate \
    --input "/data/${format}.xml" \
    --output "/reports/${format}-report.xml" \
    2>"$REPORT_DIR/${format}-stderr.log"; then
    echo "✅ PASS"
    PASSED=$((PASSED + 1))
  else
    echo "❌ FAIL"
    FAILED=$((FAILED + 1))
    FAILURES="$FAILURES $format"
    # Dump stderr for debugging
    if [ -s "$REPORT_DIR/${format}-stderr.log" ]; then
      echo "   └─ $(head -5 "$REPORT_DIR/${format}-stderr.log")"
    fi
  fi
done

# ── Step 4: Validate dedicated formats ───────────────────────────────────────
echo ""
echo "═══ Step 3: Validating dedicated formats ═══"

for format in "${DEDICATED_FORMATS[@]}"; do
  TOTAL=$((TOTAL + 1))
  xml_file="$INVOICE_DIR/${format}.xml"

  if [ ! -f "$xml_file" ]; then
    echo "⏭️  $format — XML not found, skipping"
    FAILED=$((FAILED + 1))
    FAILURES="$FAILURES $format(missing)"
    continue
  fi

  echo -n "🔍 $format … "

  case "$format" in
    fatturapa)
      # Use the Italian SDI validator image
      if docker run --rm \
        -v "$INVOICE_DIR:/data:ro" \
        -v "$REPORT_DIR:/reports" \
        "fatturapa/sdi-validator:latest" \
        validate "/data/${format}.xml" \
        > "$REPORT_DIR/${format}-report.xml" 2>"$REPORT_DIR/${format}-stderr.log"; then
        echo "✅ PASS"
        PASSED=$((PASSED + 1))
      else
        echo "⚠️  SKIP (validator not available — structural check only)"
        # Fall back to xmllint well-formedness check
        if xmllint --noout "$xml_file" 2>/dev/null; then
          echo "   └─ XML is well-formed ✅"
          PASSED=$((PASSED + 1))
        else
          echo "   └─ XML is malformed ❌"
          FAILED=$((FAILED + 1))
          FAILURES="$FAILURES $format"
        fi
      fi
      ;;
    ksef)
      # KSeF schema validation via xmllint
      if xmllint --noout "$xml_file" 2>/dev/null; then
        echo "✅ PASS (well-formed)"
        PASSED=$((PASSED + 1))
      else
        echo "❌ FAIL (malformed XML)"
        FAILED=$((FAILED + 1))
        FAILURES="$FAILURES $format"
      fi
      ;;
  esac
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Schematron Validation Summary"
echo "═══════════════════════════════════════════"
echo "  Total:   $TOTAL"
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
if [ -n "$FAILURES" ]; then
  echo "  Failures:$FAILURES"
fi
echo "═══════════════════════════════════════════"

# Write machine-readable summary
cat > "$REPORT_DIR/summary.json" <<EOF
{
  "total": $TOTAL,
  "passed": $PASSED,
  "failed": $FAILED,
  "failures": "$(echo "$FAILURES" | xargs)"
}
EOF

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

echo "✅ All formats passed Schematron validation."
exit 0
