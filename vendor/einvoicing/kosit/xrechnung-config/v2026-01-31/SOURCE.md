# KoSIT Validator Configuration for XRechnung

## Source

- **Repository**: itplr-kosit/validator-configuration-xrechnung
- **Release URL**: https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/tag/v2026-01-31
- **Tag**: v2026-01-31
- **Release Date**: 2026-02-05
- **Published**: 2026-02-05T09:20:42Z

## Assets Downloaded

1. `xrechnung-3.0.2-validator-configuration-2026-01-31.zip` (487,782 bytes)
   - SHA256: `6a5a5911a421b25fbc423f62f93f894df7b236f5d73ca4f84bb222a945082704`

## Contents

- `scenarios.xml` - Master scenario configuration file
- `resources/` - XSD schemas, Schematron, codelists
- `EN16931-CII-validation.xsl` - Compiled EN16931 CII Schematron
- `EN16931-UBL-validation.xsl` - Compiled EN16931 UBL Schematron
- `docs/` - Configuration documentation
- `CHANGELOG.md`, `README.md`

## Compatibility

- **XRechnung**: 3.0.x (specifically tested with 3.0.2)
- **KoSIT Validator**: v1.6.0+ (this release references v1.6.0)
- **CEN Schematron Rules**: 1.3.15
- **SchXslt**: 1.10.1

## Release Notes (v2026-01-31)

### Added

- Custom level "error" for UBL-CR-646 in CVD scenarios to prohibit sub invoice lines

### Changed

- Using KoSIT Validator v1.6.0
- Using CEN Schematron Rules 1.3.15
- Using SchXslt 1.10.1
- Updated naming convention of distribution zip file

## License

Apache License 2.0

## Purpose

Official scenario configuration for validating XRechnung 3.0.x invoices using KoSIT Validator.
Integrates EN16931 rules, XRechnung-specific business rules, and German e-invoicing requirements.

## Integration

Pass `scenarios.xml` path to KoSIT Validator via `-s` flag:

```bash
java -jar validator.jar -s scenarios.xml -h invoice.xml
```

Referenced by `services/xrechnung/validator.ts` in external validation.
