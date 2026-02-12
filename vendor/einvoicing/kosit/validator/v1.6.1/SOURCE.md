# KoSIT Validator Engine

## Source

- **Repository**: itplr-kosit/validator
- **Release URL**: https://github.com/itplr-kosit/validator/releases/tag/v1.6.1
- **Tag**: v1.6.1
- **Release Date**: 2026-02-05
- **Published**: 2026-02-05T11:45:58Z

## Assets Downloaded

1. `validator-1.6.1-standalone.jar` (10,582,815 bytes)
   - SHA256: `6421704675af694a9751f445cfe2fa2ea41dd6eb34939a5da261880133b1f7cd`

## Contents

- Standalone executable JAR (all dependencies bundled)
- Includes Saxon HE, Schematron processor, XML libraries

## Java Requirements

- **Minimum**: Java 11
- **Recommended**: Java 17+

## Usage

```bash
java -jar validator-1.6.1-standalone.jar \
  -s <scenarios.xml> \
  -h <input.xml> \
  [-o <output-dir>] \
  [-p <html|xml>]
```

### Key Options

- `-s` / `--scenarios`: Path to scenarios.xml configuration
- `-h` / `--html`: Path to XML document to validate
- `-o` / `--output-dir`: Output directory for validation reports
- `-p` / `--print-report`: Report format (html or xml)
- `-r` / `--repository`: Custom repository path for scenarios

## Release Notes (v1.6.1)

Patch release for v1.6.x series. See GitHub release page for detailed changelog.

## License

Apache License 2.0

## Purpose

Official validation engine from KoSIT (Koordinierungsstelle für IT-Standards).
Executes Schematron validation, XSD schema validation, and generates structured reports.

## Integration

Called via CLI from `services/xrechnung/validator.ts` when `ENABLE_EXTERNAL_VALIDATION=true`:

```typescript
execFileAsync('java', ['-jar', KOSIT_VALIDATOR_JAR, '-s', KOSIT_SCENARIOS_XML, '-h', xmlPath], {
  timeout: 60000,
});
```

Environment variables:

- `KOSIT_VALIDATOR_JAR` → path to this JAR
- `KOSIT_SCENARIOS_XML` → path to `validator-configuration-xrechnung/scenarios.xml`
