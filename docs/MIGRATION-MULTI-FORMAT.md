# Migration Guide: Multi-Format Support

For existing API consumers upgrading to multi-format Invoice2E.

## Backward Compatibility

**Breaking changes: NONE.** Existing integrations continue to work without modification.

## Format Parameter Changes

### Before (v1)

The API accepted generic format hints:

```
format=CII   →  XRechnung CII
format=UBL   →  XRechnung UBL
```

### After (v2)

Legacy values still work and map to the same formats. New specific format IDs are now available:

| Old param | New param | Notes |
|-----------|-----------|-------|
| `CII` | `xrechnung-cii` | Identical output |
| `UBL` | `xrechnung-ubl` | Identical output |
| — | `peppol-bis` | New |
| — | `facturx-en16931` | New (returns PDF) |
| — | `facturx-basic` | New (returns PDF) |
| — | `fatturapa` | New |
| — | `ksef` | New |
| — | `nlcius` | New |
| — | `cius-ro` | New |

## New Response Fields

The conversion response now includes additional metadata:

```json
{
  "formatId": "xrechnung-cii",
  "mimeType": "application/xml",
  "fileExtension": ".xml",
  "fileName": "INV-2024-001-xrechnung-cii.xml",
  "validationStatus": "valid",
  "validationErrors": [],
  "validationWarnings": []
}
```

## PDF Responses (Factur-X)

When using `facturx-en16931` or `facturx-basic`, the response contains a **PDF** (not XML):

- `mimeType` will be `application/pdf`
- The PDF contains embedded CII XML as an attachment
- Handle the binary response accordingly (base64 or stream)

## Environment Variables

Set `ENABLE_MULTI_FORMAT=true` (default) to enable all 9 formats. Set to `false` to restrict to XRechnung CII/UBL only.

## Checklist for API Consumers

1. ✅ Existing `CII`/`UBL` params — no changes needed
2. ✅ Check `mimeType` in response if you auto-detect file type
3. ✅ Handle PDF binary for Factur-X formats
4. ✅ Update UI format selectors if you expose format choice to users
