/**
 * NLCIUS / SI-UBL 2.0 format generator (Netherlands).
 * Composes the PEPPOL BIS generator with Dutch-specific customization ID and identifiers.
 *
 * @module services/format/nlcius/nlcius.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import { PeppolBISGenerator } from '../peppol/peppol-bis.generator';

const NLCIUS_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0';
const PEPPOL_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';

export class NLCIUSGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'nlcius';
  readonly formatName = 'NLCIUS / SI-UBL 2.0 (Netherlands)';
  readonly specVersion = '1.0';
  readonly specDate = '2019-10-01';

  private peppolGenerator = new PeppolBISGenerator();

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    // Use PEPPOL generator, then replace customization ID
    const result = await this.peppolGenerator.generate(invoice);

    let xml = result.xmlContent;
    xml = xml.replace(PEPPOL_CUSTOMIZATION_ID, NLCIUS_CUSTOMIZATION_ID);

    const validation = await this.validate(xml);

    return {
      ...result,
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_nlcius.xml`,
      fileSize: new TextEncoder().encode(xml).length,
      validationStatus: validation.valid ? 'valid' : 'warnings',
      validationErrors: validation.errors,
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    // Run base PEPPOL validation first
    const peppolResult = await this.peppolGenerator.validate(xml);
    const errors = peppolResult.errors.filter(
      (e) => !e.includes('PEPPOL BIS 3.0 customization ID')
    );

    // Check NLCIUS customization ID
    if (!xml.includes(NLCIUS_CUSTOMIZATION_ID)) {
      errors.push('Missing NLCIUS customization ID');
    }

    return { valid: errors.length === 0, errors };
  }
}
