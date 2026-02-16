# Adding a New Format

Step-by-step guide for adding a new e-invoicing output format to Invoice2E.

## Steps

### 1. Add to `OutputFormat` type

In `types/canonical-invoice.ts`, add your format ID to the union:

```typescript
export type OutputFormat =
  | 'xrechnung-cii'
  // ... existing formats ...
  | 'my-new-format';   // ← add here
```

### 2. Create the generator

Create a new file, e.g. `services/format/myformat/my-format.generator.ts`:

```typescript
import type { CanonicalInvoice } from '@/types/canonical-invoice';
import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';

export class MyFormatGenerator implements IFormatGenerator {
  readonly formatId = 'my-new-format' as const;
  readonly formatName = 'My Format';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    // Build XML from invoice fields
    const xml = this.buildXml(invoice);
    const { valid, errors } = await this.validate(xml);
    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}-myformat.xml`,
      fileSize: Buffer.byteLength(xml, 'utf-8'),
      validationStatus: valid ? 'valid' : 'invalid',
      validationErrors: errors,
      validationWarnings: [],
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    // Add structural checks
    return { valid: errors.length === 0, errors };
  }

  private buildXml(invoice: CanonicalInvoice): string {
    // Your XML building logic
    return '';
  }
}
```

### 3. Register in `GeneratorFactory`

In `services/format/GeneratorFactory.ts`:

1. Import your generator
2. Add a `case` in the `switch` block
3. Add the format ID to `implementedFormats`

```typescript
import { MyFormatGenerator } from './myformat/my-format.generator';

// In switch:
case 'my-new-format':
  generator = new MyFormatGenerator();
  break;

// In implementedFormats array:
private static readonly implementedFormats: OutputFormat[] = [
  // ...existing...
  'my-new-format',
];
```

### 4. Add to Format Registry

In `lib/format-registry.ts`, add an entry to the `FORMAT_REGISTRY` map:

```typescript
['my-new-format', {
  id: 'my-new-format',
  displayName: 'My Format',
  description: 'Description of the format.',
  countries: ['XX'],
  syntaxType: 'UBL',  // or 'CII', etc.
  mimeType: 'application/xml',
  fileExtension: '.xml',
  isEU: true,
}],
```

### 5. Add i18n translations

In `messages/en.json` and `messages/de.json`, add display strings for the new format (format name, description).

### 6. Write tests

Create `tests/services/format/my-format.generator.test.ts`:

- Test generation with a complete CanonicalInvoice
- Test required field validation
- Test edge cases (missing optional fields, special characters)
- Test the `validate()` method

### 7. Update documentation

- Add to the table in `docs/FORMAT-ARCHITECTURE.md`
- Add a section in `docs/FORMAT-REFERENCE.md`

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Forgetting the `default: never` exhaustive check in GeneratorFactory | TypeScript will error — add your case before the default |
| Not handling `null` optional fields from CanonicalInvoice | Always use `?? ''` or conditional checks |
| Hardcoding country-specific tax logic | Use the canonical tax fields; country logic belongs in validation |
| Factur-X generators share one class with a profile param | If your format has sub-profiles, follow the same pattern |
| Missing `formatId` in registry vs generator mismatch | Keep IDs identical in OutputFormat, registry, and generator |
