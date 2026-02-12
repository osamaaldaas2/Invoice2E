# Vendored E-Invoicing Validation Artifacts

This document describes the official validation artifacts vendored in `vendor/einvoicing/` and how to use/update them.

## Overview

Invoice2E.1 uses **official, version-pinned validation artifacts** from authoritative sources to ensure compliance with:

- **EN 16931:2017** — European e-invoicing standard (CEN/TC 434)
- **XRechnung 3.0.x** — German implementation profile of EN 16931
- **PEPPOL BIS 3.0** — Pan-European Public Procurement On-Line specifications

All artifacts are downloaded from official GitHub releases, checksummed, and documented to ensure reproducible builds and audit trails.

---

## Directory Structure

```
vendor/einvoicing/
├── en16931/
│   └── validation-1.3.15/          # EN16931 Schematron rules (CII + UBL)
│       ├── schematron/              # Source Schematron (.sch)
│       ├── xslt/                    # Compiled XSLT transformations
│       ├── examples/                # Example invoices
│       ├── checksums.sha256         # SHA256 checksums
│       └── SOURCE.md                # Release metadata
├── kosit/
│   ├── validator/
│   │   └── v1.6.1/                  # KoSIT Validator engine (standalone JAR)
│   │       ├── validator-1.6.1-standalone.jar
│   │       ├── checksums.sha256
│   │       └── SOURCE.md
│   ├── xrechnung-config/
│   │   └── v2026-01-31/             # XRechnung Validator Configuration
│   │       ├── scenarios.xml        # **Master scenario config**
│   │       ├── resources/           # XSD, Schematron, codelists
│   │       ├── EN16931-CII-validation.xsl
│   │       ├── EN16931-UBL-validation.xsl
│   │       ├── checksums.sha256
│   │       └── SOURCE.md
│   └── xrechnung-schematron/
│       └── v2.5.0/                  # XRechnung-specific Schematron (BR-DE-*)
│           ├── schematron/
│           ├── checksums.sha256
│           └── SOURCE.md
```

---

## Artifact Details

### 1. EN16931 Validation Artifacts

**Source**: [ConnectingEurope/eInvoicing-EN16931](https://github.com/ConnectingEurope/eInvoicing-EN16931)
**License**: EUPL v1.2
**Current Version**: validation-1.3.15 (2025-10-20)

**Purpose**:

- Semantic business rule validation (BR-CO-_, BR-_) for EN 16931 standard
- Supports both **CII** (Cross Industry Invoice) and **UBL** (Universal Business Language) syntaxes
- Maintained by CEN/TC 434 Working Group

**Contents**:

- `schematron/` — Source Schematron rules (human-readable)
- `xslt/` — Compiled XSLT (used by validators)
- `examples/` — Valid/invalid test invoices

**Usage**:

- Not directly invoked by Invoice2E.1 application
- Embedded in `xrechnung-config` and compiled into XSLT

---

### 2. KoSIT Validator Engine

**Source**: [itplr-kosit/validator](https://github.com/itplr-kosit/validator)
**License**: Apache 2.0
**Current Version**: v1.6.1 (2026-02-05)

**Purpose**:

- Standalone Java validation engine from KoSIT (Koordinierungsstelle für IT-Standards)
- Executes Schematron validation, XSD schema validation
- Generates structured HTML/XML validation reports

**Java Requirements**:

- **Minimum**: Java 11
- **Recommended**: Java 17+

**CLI Usage**:

```bash
java -jar vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar \
  -s vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml \
  -h invoice.xml \
  -o validation-output/ \
  -p html
```

**Integration**:

- **Environment Variable**: `KOSIT_VALIDATOR_JAR` → path to JAR
- **Feature Flag**: `ENABLE_EXTERNAL_VALIDATION=true` (disabled by default)
- **Code**: `services/xrechnung/validator.ts` → `validateExternal()` method
- **Timeout**: 60 seconds per validation

**When to Use**:

- **Development/QA**: Validate generated XRechnung XML against official KoSIT rules
- **Pre-Release**: Run batch validation on test corpus
- **Production (optional)**: Enable for high-stakes invoices (e.g., >10k EUR) if performance is acceptable

**Note**: External validation adds **~2-5 seconds** per invoice due to JVM startup + Schematron execution.

---

### 3. XRechnung Validator Configuration

**Source**: [itplr-kosit/validator-configuration-xrechnung](https://github.com/itplr-kosit/validator-configuration-xrechnung)
**License**: Apache 2.0
**Current Version**: v2026-01-31 (2026-02-05)

**Purpose**:

- **Master scenario configuration** (`scenarios.xml`) for XRechnung 3.0.x validation
- Integrates EN16931 rules, XRechnung Schematron, XSD schemas, codelists
- Defines validation scenarios (e.g., UBL Invoice, CII Invoice, UBL CreditNote)

**Key Files**:

- `scenarios.xml` — **Master configuration file** (required by KoSIT Validator)
- `resources/xrechnung/3.0.2/xsd/` — XRechnung XSD schemas
- `resources/xrechnung/3.0.2/schematron/` — Compiled XRechnung Schematron
- `EN16931-CII-validation.xsl` — Compiled EN16931 CII rules
- `EN16931-UBL-validation.xsl` — Compiled EN16931 UBL rules

**Compatibility**:

- XRechnung: 3.0.x (specifically tested with 3.0.2)
- KoSIT Validator: v1.6.0+
- CEN Schematron Rules: 1.3.15

**Integration**:

- **Environment Variable**: `KOSIT_SCENARIOS_XML` → path to `scenarios.xml`
- **Usage**: Passed to KoSIT Validator via `-s` flag

**Update Frequency**: Every 1-3 months (follows XRechnung release cycle)

---

### 4. XRechnung Schematron Rules

**Source**: [itplr-kosit/xrechnung-schematron](https://github.com/itplr-kosit/xrechnung-schematron)
**License**: Apache 2.0
**Current Version**: v2.5.0 (2026-01-31)

**Purpose**:

- **German-specific business rules** (BR-DE-\*) for XRechnung
- Extends EN 16931 with regulatory requirements (e.g., Leitweg-ID, IBAN, VAT handling)
- Includes temporary rules (BR-TMP-\*) for migration periods

**Key Rules**:

- `BR-DE-2` — Seller contact information requirements
- `BR-DE-15` — Buyer reference (Leitweg-ID for public sector)
- `BR-DE-23-a` — IBAN required for SEPA credit transfer
- `PEPPOL-EN16931-R010` — Electronic address requirements

**Contents**:

- `schematron/` — XRechnung Schematron source (`.sch`)
- `CHANGELOG.md` — Detailed rule change history
- `LICENSE` — Apache 2.0

**Integration**:

- Bundled into `xrechnung-config` and compiled into XSLT
- Applied automatically when using XRechnung scenarios in KoSIT Validator
- Invoice2E.1 implements these rules in `validation/xrechnung-profile.ts` (internal validation)

**Update Frequency**: Every 1-3 months (synchronized with XRechnung releases)

---

## How Validation Works

### Internal Validation (Always Active)

Invoice2E.1 implements **TypeScript-based validation** in:

1. `validation/schema.ts` — Zod schema validation (data types, required fields)
2. `validation/business-rules.ts` — EN 16931 business rules (BR-CO-\*)
3. `validation/xrechnung-profile.ts` — XRechnung profile rules (BR-DE-\*)

**Flow**:

```
User Data → Zod Schema → Business Rules → XRechnung Profile → XML Builder
```

**Performance**: ~10-50ms per invoice

### External Validation (Optional, Feature-Gated)

**When**: `ENABLE_EXTERNAL_VALIDATION=true` in `.env`

**Flow**:

```
XML Generated → Write to Temp File → KoSIT Validator CLI → Parse Report → Append Warnings
```

**Performance**: ~2-5 seconds per invoice (JVM startup overhead)

**Use Cases**:

- Development: Validate against official reference implementation
- Pre-release: Batch validation of test corpus
- Production (selective): High-value invoices or compliance audits

**Report Storage**:

- Validation reports saved to `KOSIT_REPORTS_DIR` (default: `tmp/kosit-reports/`)
- HTML reports retained for audit trail (configurable retention policy)

---

## Updating Artifacts

### Automated Update (Recommended)

```bash
# Fetch latest versions (resolves from GitHub API)
./scripts/vendor-fetch-einvoicing.sh

# Or pin specific versions
EN16931_TAG=validation-1.3.16 \
KOSIT_VALIDATOR_TAG=v1.7.0 \
XRECHNUNG_CONFIG_TAG=v2026-07-10 \
XRECHNUNG_SCHEMATRON_TAG=v2.6.0 \
./scripts/vendor-fetch-einvoicing.sh
```

The script will:

1. Resolve latest tags from GitHub API (or use provided versions)
2. Download assets with SHA256 verification
3. Extract to `vendor/einvoicing/<package>/<tag>/`
4. Generate `checksums.sha256` and `SOURCE.md`
5. Verify critical files (e.g., `scenarios.xml`)

### Manual Update (Not Recommended)

If the script fails, manually:

1. Visit release page on GitHub
2. Download assets (`.zip` or `.jar`)
3. Extract to `vendor/einvoicing/<package>/<new-tag>/`
4. Generate checksums: `sha256sum *.zip *.jar > checksums.sha256`
5. Update `SOURCE.md` with release metadata
6. Update environment variables in `.env.example` and CI/CD configs

### Post-Update Steps

1. **Update environment variables**:

   ```bash
   KOSIT_VALIDATOR_JAR=vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar
   KOSIT_SCENARIOS_XML=vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml
   ```

2. **Test internal validation** (ensure no regressions):

   ```bash
   npm test
   ```

3. **Test external validation** (if enabled):

   ```bash
   ENABLE_EXTERNAL_VALIDATION=true npm test -- tests/unit/external-validation.test.ts
   ```

4. **Verify against test corpus**:

   ```bash
   ./scripts/validate-test-corpus.sh  # (if available)
   ```

5. **Update CHANGELOG.md** with artifact versions

---

## Version Compatibility Matrix

| Invoice2E.1 | EN16931 | KoSIT Validator | XRechnung Config | XRechnung Schematron | XRechnung Spec |
| ----------- | ------- | --------------- | ---------------- | -------------------- | -------------- |
| v1.0.0      | 1.3.15  | v1.6.1          | v2026-01-31      | v2.5.0               | 3.0.2          |

**Compatibility Rules**:

- **EN16931** → must match version referenced in XRechnung Config CHANGELOG
- **KoSIT Validator** → must be ≥ version specified in XRechnung Config README
- **XRechnung Config** → must support target XRechnung version (e.g., 3.0.x)
- **XRechnung Schematron** → must match XRechnung version in Config

**Breaking Changes**:

- XRechnung major version bumps (e.g., 3.0 → 4.0) may require code changes
- EN16931 updates usually backward-compatible (added rules, not removed)
- Validator engine updates typically safe (Java compatibility only)

---

## Troubleshooting

### External Validation Not Running

**Symptoms**: `externalValidation: { ran: false }` in API response

**Causes & Fixes**:

1. **Feature flag disabled**:

   ```bash
   # .env
   ENABLE_EXTERNAL_VALIDATION=true
   ```

2. **Missing JAR path**:

   ```bash
   KOSIT_VALIDATOR_JAR=vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar
   ```

3. **Missing scenarios path**:

   ```bash
   KOSIT_SCENARIOS_XML=vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml
   ```

4. **Java not installed**:

   ```bash
   java -version  # Must be Java 11+
   ```

5. **File permissions**:
   ```bash
   chmod +x vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar
   ```

### Validation Timeouts

**Symptoms**: `externalValidation: { error: 'timeout' }`

**Causes & Fixes**:

- **Increase timeout**: Edit `services/xrechnung/validator.ts` → `timeout: 60000` → `120000` (2 min)
- **JVM heap size**: `JAVA_OPTS="-Xmx2g"` (if processing large invoices)
- **Disable for batch jobs**: External validation not recommended for bulk uploads (use internal only)

### Checksum Mismatches

**Symptoms**: Downloaded file checksum ≠ `checksums.sha256`

**Causes & Fixes**:

- **Corrupted download**: Re-run `./scripts/vendor-fetch-einvoicing.sh`
- **Wrong tag/version**: Check `SOURCE.md` for expected tag
- **GitHub asset updated**: Verify on GitHub release page (rare; assets are immutable)

### Scenarios.xml Not Found

**Symptoms**: `Error: scenarios.xml not found at path`

**Causes & Fixes**:

1. **Wrong path**: Ensure `KOSIT_SCENARIOS_XML` points to **extracted** config (not zip)

   ```bash
   # ✗ Wrong
   vendor/einvoicing/kosit/xrechnung-config/xrechnung-3.0.2-validator-configuration-2026-01-31.zip
   # ✓ Correct
   vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml
   ```

2. **Not extracted**: Re-run script or manually extract zip
3. **Permissions**: `chmod +r vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml`

---

## CI/CD Integration

### GitHub Actions (Example)

```yaml
- name: Verify vendored artifacts
  run: |
    # Verify checksums (run from parent dirs since checksums reference relative paths)
    cd vendor/einvoicing/en16931
    sha256sum -c validation-1.3.15/checksums.sha256

    cd ../kosit/validator
    sha256sum -c v1.6.1/checksums.sha256

    cd ../xrechnung-config
    sha256sum -c v2026-01-31/checksums.sha256
    test -f v2026-01-31/scenarios.xml || exit 1

    cd ../xrechnung-schematron
    sha256sum -c v2.5.0/checksums.sha256

- name: Run external validation tests
  env:
    ENABLE_EXTERNAL_VALIDATION: true
    KOSIT_VALIDATOR_JAR: vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar
    KOSIT_SCENARIOS_XML: vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml
  run: npm test -- tests/unit/external-validation.test.ts
```

---

## License Summary

| Artifact             | License    | Commercial Use | Attribution Required |
| -------------------- | ---------- | -------------- | -------------------- |
| EN16931              | EUPL v1.2  | ✅ Yes         | ✅ Yes               |
| KoSIT Validator      | Apache 2.0 | ✅ Yes         | ✅ Yes               |
| XRechnung Config     | Apache 2.0 | ✅ Yes         | ✅ Yes               |
| XRechnung Schematron | Apache 2.0 | ✅ Yes         | ✅ Yes               |

All artifacts are **open source** and **free for commercial use**. Attribution is required (see LICENSE files in each package).

---

## Further Reading

- [EN 16931 Standard Overview](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/EN+16931+compliance)
- [XRechnung Specification](https://xeinkauf.de/xrechnung/)
- [KoSIT Validator Documentation](https://github.com/itplr-kosit/validator/wiki)
- [PEPPOL BIS Billing 3.0](https://docs.peppol.eu/poacc/billing/3.0/)

---

**Last Updated**: 2026-02-12
**Maintained by**: Invoice2E.1 Team
**Questions**: See CONTRIBUTING.md for support channels
