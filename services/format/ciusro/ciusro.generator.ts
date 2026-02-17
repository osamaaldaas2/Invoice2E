/**
 * CIUS-RO format generator (Romania).
 * Composes the PEPPOL BIS generator with Romanian-specific customization ID and identifiers.
 *
 * @module services/format/ciusro/ciusro.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import { PeppolBISGenerator } from '../peppol/peppol-bis.generator';

const CIUSRO_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1';
const PEPPOL_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';

export class CIUSROGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'cius-ro';
  readonly formatName = 'CIUS-RO (Romania)';
  /** @inheritdoc */
  readonly version = '1.0.0';
  readonly specVersion = '1.0';
  readonly specDate = '2023-03-01';

  private peppolGenerator = new PeppolBISGenerator();

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    const result = await this.peppolGenerator.generate(invoice);

    let xml = result.xmlContent;
    xml = xml.replace(PEPPOL_CUSTOMIZATION_ID, CIUSRO_CUSTOMIZATION_ID);

    const validation = await this.validate(xml);

    return {
      ...result,
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_ciusro.xml`,
      fileSize: new TextEncoder().encode(xml).length,
      validationStatus: validation.valid ? 'valid' : 'warnings',
      validationErrors: validation.errors,
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const peppolResult = await this.peppolGenerator.validate(xml);
    const errors = peppolResult.errors.filter(
      (e) => !e.includes('PEPPOL BIS 3.0 customization ID')
    );

    if (!xml.includes(CIUSRO_CUSTOMIZATION_ID)) {
      errors.push('Missing CIUS-RO customization ID');
    }

    return { valid: errors.length === 0, errors };
  }
}
