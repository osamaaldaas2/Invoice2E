# Vendored E-Invoicing Validation Artifacts

This directory contains official, version-pinned validation artifacts for EN 16931 and XRechnung compliance.

## Quick Reference

| Package                  | Version           | Purpose                                |
| ------------------------ | ----------------- | -------------------------------------- |
| **EN16931**              | validation-1.3.15 | EN 16931 Schematron rules (CII + UBL)  |
| **KoSIT Validator**      | v1.6.1            | Validation engine (standalone JAR)     |
| **XRechnung Config**     | v2026-01-31       | Scenario configuration (scenarios.xml) |
| **XRechnung Schematron** | v2.5.0            | German business rules (BR-DE-\*)       |

## Structure

```
einvoicing/
├── en16931/validation-1.3.15/      # CEN/TC 434 validation rules
├── kosit/
│   ├── validator/v1.6.1/           # KoSIT Validator JAR (10.6 MB)
│   ├── xrechnung-config/v2026-01-31/   # scenarios.xml + resources
│   └── xrechnung-schematron/v2.5.0/    # BR-DE-* rules
└── README.md (this file)
```

## Documentation

For full documentation, see: **[docs/vendor-artefacts.md](../../docs/vendor-artefacts.md)**

Topics covered:

- Artifact details and licenses
- How validation works (internal vs external)
- Updating artifacts (automated script)
- Version compatibility matrix
- Troubleshooting guide
- CI/CD integration

## Quick Start

### Internal Validation (Always Active)

No configuration needed. TypeScript validation runs automatically:

```bash
npm test
```

### External Validation (Optional)

Enable KoSIT Validator for reference validation:

```bash
# .env
ENABLE_EXTERNAL_VALIDATION=true
KOSIT_VALIDATOR_JAR=vendor/einvoicing/kosit/validator/v1.6.1/validator-1.6.1-standalone.jar
KOSIT_SCENARIOS_XML=vendor/einvoicing/kosit/xrechnung-config/v2026-01-31/scenarios.xml
```

Requires Java 11+ installed.

## Updating

```bash
# Fetch latest versions
./scripts/vendor-fetch-einvoicing.sh

# Or pin specific versions
EN16931_TAG=validation-1.3.16 ./scripts/vendor-fetch-einvoicing.sh
```

## Checksums

Each package directory contains `checksums.sha256` for integrity verification.

**Note**: Checksum files reference assets with relative paths from the parent directory, so verification must run from the parent:

```bash
# From vendor/einvoicing directory
cd en16931
sha256sum -c validation-1.3.15/checksums.sha256

cd kosit/validator
sha256sum -c v1.6.1/checksums.sha256

cd kosit/xrechnung-config
sha256sum -c v2026-01-31/checksums.sha256

cd kosit/xrechnung-schematron
sha256sum -c v2.5.0/checksums.sha256
```

**Tip**: If already inside a package directory, reference the checksum file using its relative path:

```bash
# From inside vendor/einvoicing/en16931/validation-1.3.15/
sha256sum -c ../validation-1.3.15/checksums.sha256
```

## Licenses

- **EN16931**: EUPL v1.2 (European Union Public License)
- **KoSIT Validator**: Apache 2.0
- **XRechnung Config**: Apache 2.0
- **XRechnung Schematron**: Apache 2.0

All artifacts are open source and free for commercial use.

## Official Sources

- EN16931: https://github.com/ConnectingEurope/eInvoicing-EN16931
- KoSIT Validator: https://github.com/itplr-kosit/validator
- XRechnung Config: https://github.com/itplr-kosit/validator-configuration-xrechnung
- XRechnung Schematron: https://github.com/itplr-kosit/xrechnung-schematron

---

**Last Updated**: 2026-02-12
**Status**: Production-ready artifacts pinned to XRechnung 3.0.2 compatibility
