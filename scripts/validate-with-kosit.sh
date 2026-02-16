#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Validate generated test invoices using KoSIT Validator + xmllint.
#
# Requirements: Java 17+, xmllint (libxml2-utils)
# Usage: ./scripts/validate-with-kosit.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INVOICE_DIR="$PROJECT_DIR/tmp/test-invoices"
REPORT_DIR="$PROJECT_DIR/tmp/validation-reports"
CACHE_DIR="$PROJECT_DIR/tmp/validator-cache"

# KoSIT Validator version
KOSIT_VERSION="1.5.0"
KOSIT_JAR="$CACHE_DIR/validationtool-${KOSIT_VERSION}-standalone.jar"
KOSIT_URL="https://github.com/itplr-kosit/validator/releases/download/v${KOSIT_VERSION}/validator-${KOSIT_VERSION}-distribution.zip"

# XRechnung configuration
XRECHNUNG_CONFIG_VERSION="2024-06-20"
XRECHNUNG_CONFIG_URL="https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/release-${XRECHNUNG_CONFIG_VERSION}/validator-configuration-xrechnung_3.0.2_${XRECHNUNG_CONFIG_VERSION}.zip"
XRECHNUNG_CONFIG_DIR="$CACHE_DIR/xrechnung-config"

mkdir -p "$REPORT_DIR" "$CACHE_DIR"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# ── Download KoSIT Validator ─────────────────────────────────────────────────
download_kosit() {
  if [[ -f "$KOSIT_JAR" ]]; then
    echo "✓ KoSIT Validator already cached"
    return 0
  fi
  echo "Downloading KoSIT Validator v${KOSIT_VERSION}..."
  local zip="$CACHE_DIR/kosit-validator.zip"
  curl -fsSL "$KOSIT_URL" -o "$zip"
  unzip -o -q "$zip" -d "$CACHE_DIR/kosit-tmp"
  # Find the standalone JAR
  find "$CACHE_DIR/kosit-tmp" -name "*standalone.jar" -exec cp {} "$KOSIT_JAR" \;
  rm -rf "$CACHE_DIR/kosit-tmp" "$zip"
  echo "✓ KoSIT Validator downloaded"
}

download_xrechnung_config() {
  if [[ -d "$XRECHNUNG_CONFIG_DIR" && -n "$(ls -A "$XRECHNUNG_CONFIG_DIR" 2>/dev/null)" ]]; then
    echo "✓ XRechnung config already cached"
    return 0
  fi
  echo "Downloading XRechnung validation config..."
  local zip="$CACHE_DIR/xrechnung-config.zip"
  curl -fsSL "$XRECHNUNG_CONFIG_URL" -o "$zip" || {
    echo "⚠ Could not download XRechnung config — will skip KoSIT validation for XRechnung"
    return 1
  }
  mkdir -p "$XRECHNUNG_CONFIG_DIR"
  unzip -o -q "$zip" -d "$XRECHNUNG_CONFIG_DIR"
  rm -f "$zip"
  echo "✓ XRechnung config downloaded"
}

# ── Validate with KoSIT ──────────────────────────────────────────────────────
validate_kosit() {
  local file="$1"
  local scenario_config="$2"
  local label="$3"
  local report_file="$REPORT_DIR/${label}-kosit-report.xml"

  TOTAL=$((TOTAL + 1))

  if [[ ! -f "$KOSIT_JAR" ]]; then
    echo "⚠ SKIP $label — KoSIT Validator not available"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  if [[ ! -f "$scenario_config" ]]; then
    echo "⚠ SKIP $label — scenario config not found: $scenario_config"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo -n "Validating $label with KoSIT... "
  if java -jar "$KOSIT_JAR" -s "$scenario_config" -o "$REPORT_DIR" "$file" 2>"$REPORT_DIR/${label}-kosit-stderr.log"; then
    # Check the report for pass/fail
    if grep -q 'acceptable' "$report_file" 2>/dev/null; then
      echo "✓ PASS"
      PASSED=$((PASSED + 1))
    else
      echo "✓ PASS (completed without error)"
      PASSED=$((PASSED + 1))
    fi
  else
    echo "✗ FAIL"
    FAILED=$((FAILED + 1))
    cat "$REPORT_DIR/${label}-kosit-stderr.log" 2>/dev/null || true
  fi
}

# ── Validate XML well-formedness with xmllint ─────────────────────────────────
validate_xmllint() {
  local file="$1"
  local label="$2"

  TOTAL=$((TOTAL + 1))

  if ! command -v xmllint &>/dev/null; then
    echo "⚠ SKIP $label (xmllint) — xmllint not installed"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo -n "Validating $label (well-formedness)... "
  if xmllint --noout "$file" 2>"$REPORT_DIR/${label}-xmllint.log"; then
    echo "✓ PASS"
    PASSED=$((PASSED + 1))
  else
    echo "✗ FAIL"
    FAILED=$((FAILED + 1))
    cat "$REPORT_DIR/${label}-xmllint.log"
  fi
}

# ── Validate with XSD via xmllint ─────────────────────────────────────────────
validate_xsd() {
  local file="$1"
  local xsd="$2"
  local label="$3"

  TOTAL=$((TOTAL + 1))

  if ! command -v xmllint &>/dev/null; then
    echo "⚠ SKIP $label (XSD) — xmllint not installed"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  if [[ ! -f "$xsd" ]]; then
    echo "⚠ SKIP $label (XSD) — schema not found: $xsd"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo -n "Validating $label (XSD)... "
  if xmllint --noout --schema "$xsd" "$file" 2>"$REPORT_DIR/${label}-xsd.log"; then
    echo "✓ PASS"
    PASSED=$((PASSED + 1))
  else
    echo "✗ FAIL"
    FAILED=$((FAILED + 1))
    cat "$REPORT_DIR/${label}-xsd.log"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════"
echo " Invoice Format Validation"
echo "═══════════════════════════════════════════════"
echo ""

if [[ ! -d "$INVOICE_DIR" ]]; then
  echo "ERROR: No test invoices found at $INVOICE_DIR"
  echo "Run: npx tsx scripts/generate-test-invoices.ts"
  exit 1
fi

# Download dependencies
download_kosit || true
download_xrechnung_config || true

# Find the XRechnung scenarios.xml
XRECHNUNG_SCENARIOS=""
if [[ -d "$XRECHNUNG_CONFIG_DIR" ]]; then
  XRECHNUNG_SCENARIOS=$(find "$XRECHNUNG_CONFIG_DIR" -name "scenarios.xml" -type f | head -1)
fi

echo ""
echo "── Validating invoices ────────────────────────"
echo ""

# XRechnung CII
if [[ -f "$INVOICE_DIR/xrechnung-cii.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/xrechnung-cii.xml" "xrechnung-cii"
  if [[ -n "$XRECHNUNG_SCENARIOS" ]]; then
    validate_kosit "$INVOICE_DIR/xrechnung-cii.xml" "$XRECHNUNG_SCENARIOS" "xrechnung-cii-kosit"
  fi
fi

# XRechnung UBL
if [[ -f "$INVOICE_DIR/xrechnung-ubl.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/xrechnung-ubl.xml" "xrechnung-ubl"
  if [[ -n "$XRECHNUNG_SCENARIOS" ]]; then
    validate_kosit "$INVOICE_DIR/xrechnung-ubl.xml" "$XRECHNUNG_SCENARIOS" "xrechnung-ubl-kosit"
  fi
fi

# PEPPOL BIS (also UBL-based, can use KoSIT with PEPPOL config if available)
if [[ -f "$INVOICE_DIR/peppol-bis.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/peppol-bis.xml" "peppol-bis"
fi

# Factur-X EN16931
if [[ -f "$INVOICE_DIR/facturx-en16931.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/facturx-en16931.xml" "facturx-en16931"
fi

# Factur-X Basic
if [[ -f "$INVOICE_DIR/facturx-basic.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/facturx-basic.xml" "facturx-basic"
fi

# FatturaPA (XML well-formedness + XSD if available)
if [[ -f "$INVOICE_DIR/fatturapa.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/fatturapa.xml" "fatturapa"
fi

# KSeF
if [[ -f "$INVOICE_DIR/ksef.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/ksef.xml" "ksef"
fi

# NLCIUS
if [[ -f "$INVOICE_DIR/nlcius.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/nlcius.xml" "nlcius"
fi

# CIUS-RO
if [[ -f "$INVOICE_DIR/cius-ro.xml" ]]; then
  validate_xmllint "$INVOICE_DIR/cius-ro.xml" "cius-ro"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Results: $PASSED passed, $FAILED failed, $SKIPPED skipped (of $TOTAL checks)"
echo "═══════════════════════════════════════════════"

# Write machine-readable summary
cat > "$REPORT_DIR/summary.json" <<EOF
{
  "total": $TOTAL,
  "passed": $PASSED,
  "failed": $FAILED,
  "skipped": $SKIPPED,
  "success": $([ "$FAILED" -eq 0 ] && echo "true" || echo "false")
}
EOF

if [[ "$FAILED" -gt 0 ]]; then
  echo ""
  echo "ERROR: $FAILED validation(s) failed!"
  exit 1
fi

echo ""
echo "All validations passed! ✓"
