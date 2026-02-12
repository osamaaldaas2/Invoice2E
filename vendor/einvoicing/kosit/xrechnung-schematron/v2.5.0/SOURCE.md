# KoSIT XRechnung Schematron Rules

## Source

- **Repository**: itplr-kosit/xrechnung-schematron
- **Release URL**: https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.5.0
- **Tag**: v2.5.0
- **Release Date**: 2026-01-31
- **Published**: 2026-02-05T09:13:04Z

## Assets Downloaded

1. `xrechnung-3.0.2-schematron-2.5.0.zip` (64,318 bytes)
   - SHA256: `a0f3d82737759bee8591c298ff24983a8f1c667f85e45a34863c75a242bc6f43`

## Contents

- `schematron/` - XRechnung-specific Schematron rules
  - BR-DE-\* rules (German business rules)
  - BR-TMP-\* rules (temporary/transitional rules)
- `CHANGELOG.md`, `README.md`, `LICENSE`

## Compatibility

- **XRechnung**: 3.0.x (specifically 3.0.2)
- **Schematron Implementation**: SchXslt (migrated from ISO Schematron)
- **Saxon HE**: 12.8

## Release Notes (v2.5.0)

### Added

- Tests for BR-DE-25-b in CII
- Validation for PEPPOL-EN16931-R120 in CII

### Changed

- Schematron implementation from ISO Schematron to SchXslt
- Using Saxon HE 12.8
- Global codelist variables to adapt CEN 1.3.15 codelist updates

### Fixed

- Bug in BR-DE-25-b preventing detection of forbidden BT-86 with BG-19 in CII
- Bug in BR-TMP-3 causing error when BT-149 provided in both price contexts without BT-150

## License

Apache License 2.0

## Purpose

XRechnung-specific business rules (BR-DE-\*) for German e-invoicing requirements.
Extends EN16931 base rules with German regulatory constraints.

## Integration

Bundled into `validator-configuration-xrechnung` and compiled into XSLT.
Applied automatically when using XRechnung scenarios in KoSIT Validator.
