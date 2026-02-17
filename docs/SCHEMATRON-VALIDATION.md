# Schematron Validation

Automated Schematron / schema validation for all 9 supported e-invoice formats in CI.

## Supported Formats & Validators

| Format | Standard | Validator | Validation Type |
|---|---|---|---|
| `xrechnung-cii` | XRechnung 3.0 (CII) | KoSIT Validator | Schematron + XSD |
| `xrechnung-ubl` | XRechnung 3.0 (UBL) | KoSIT Validator | Schematron + XSD |
| `peppol-bis` | Peppol BIS 3.0 | KoSIT Validator | Schematron + XSD |
| `facturx-en16931` | Factur-X EN16931 | KoSIT Validator | Schematron + XSD |
| `facturx-basic` | Factur-X Basic | KoSIT Validator | Schematron + XSD |
| `fatturapa` | FatturaPA 1.3.1 | SDI Validator / xmllint fallback | XSD + Schematron |
| `ksef` | KSeF (Polish) | xmllint well-formedness | XSD |
| `nlcius` | NLCIUS (Dutch) | KoSIT Validator | Schematron + XSD |
| `cius-ro` | CIUS-RO (Romanian) | KoSIT Validator | Schematron + XSD |

## How CI Validates

The `schematron` job in `.github/workflows/ci.yml` runs after the `build` job:

1. **Generate** — `npx tsx scripts/generate-test-invoices.ts` creates a test invoice XML for each format in `tmp/test-invoices/`.
2. **Validate** — `scripts/validate-formats.sh` runs the KoSIT validator (Docker) against EN 16931 CII/UBL formats and xmllint for FatturaPA/KSeF.
3. **Report** — Validation reports are uploaded as CI artifacts (`schematron-validation-reports`).
4. **Gate** — Any validation failure fails the CI job and blocks merge.

## Running Locally

### Prerequisites

- Docker installed and running
- Node.js ≥ 18 with npm

### Steps

```bash
# 1. Install dependencies
npm ci

# 2. Generate test invoices
npx tsx scripts/generate-test-invoices.ts

# 3. Run full validation (requires Docker)
chmod +x scripts/validate-formats.sh
./scripts/validate-formats.sh

# 4. Check reports
ls tmp/validation-reports/
cat tmp/validation-reports/summary.json
```

### Quick: Validate a single file

```bash
docker run --rm \
  -v "$(pwd)/tmp/test-invoices:/data:ro" \
  itplr/kosit-validator:latest \
  validate --input /data/xrechnung-cii.xml
```

## Updating Schematron Rules

When e-invoicing standards are updated:

1. **KoSIT Validator** — Update the Docker image tag in `scripts/validate-formats.sh` and `.github/workflows/ci.yml`. The KoSIT validator bundles Schematron rules for EN 16931, XRechnung, Peppol BIS, and country CIUS profiles.

2. **Format Generators** — Update `specVersion` and `specDate` in each generator implementation to match the new standard version.

3. **Test Invoices** — If the new standard introduces mandatory fields, update `buildTestInvoice()` in `scripts/generate-test-invoices.ts`.

4. **Verify** — Run `./scripts/validate-formats.sh` locally to confirm all formats pass with the updated rules before pushing.

## Architecture

```
scripts/
├── generate-test-invoices.ts   # Generates XML for all 9 formats using GeneratorFactory
└── validate-formats.sh         # Orchestrates Docker-based validation

tmp/
├── test-invoices/              # Generated XML files (gitignored)
│   ├── xrechnung-cii.xml
│   ├── xrechnung-ubl.xml
│   └── ...
└── validation-reports/         # Validator output (gitignored)
    ├── xrechnung-cii-report.xml
    ├── summary.json
    └── ...
```
