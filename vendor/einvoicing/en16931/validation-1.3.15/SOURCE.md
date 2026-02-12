# EN16931 Validation Artefacts

## Source

- **Repository**: ConnectingEurope/eInvoicing-EN16931
- **Release URL**: https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.15
- **Tag**: validation-1.3.15
- **Release Date**: 2025-10-20
- **Published**: 2025-10-20T14:36:27Z

## Assets Downloaded

1. `en16931-cii-1.3.15.zip` (222,468 bytes)
   - SHA256: `dd7335b711f2f492a2e1d23d81f76fae7979857fd538502465b89681263280f4`
2. `en16931-ubl-1.3.15.zip` (2,649,312 bytes)
   - SHA256: `974901a9edac022f77f500c337e0804b458d25435dd56a353cfbfb12323f5d3b`

## Contents

- CII (Cross Industry Invoice) validation artefacts:
  - Schematron rules (`.sch`)
  - XSLT transformations (`.xsl`)
  - Example files
- UBL (Universal Business Language) validation artefacts:
  - Schematron rules (`.sch`)
  - XSLT transformations (`.xsl`)
  - Example files

## License

European Union Public License (EUPL) v1.2

## Purpose

Official EN 16931 (European e-invoicing standard) validation rules from CEN/TC 434.
These Schematron rules validate semantic business rules for both CII and UBL syntaxes.

## Integration

Used by KoSIT Validator Configuration for XRechnung validation pipeline.
Referenced in `validator-configuration-xrechnung` scenarios.xml.
