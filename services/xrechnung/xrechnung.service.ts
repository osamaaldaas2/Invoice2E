/**
 * @deprecated Use XRechnungCIIGenerator (services/format/xrechnung-cii.generator.ts) instead.
 * This file is kept only because tests still import it directly.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { logger } from '@/lib/logger';
import { XRechnungGenerationResult, XRechnungInvoiceData } from './types';
import { xrechnungValidator, validateXmlStructure } from './validator';
import { xrechnungBuilder } from './builder';

export class XRechnungService {
  constructor(
    private validator = xrechnungValidator,
    private builder = xrechnungBuilder
  ) {}

  async generateXRechnung(invoiceData: XRechnungInvoiceData): Promise<XRechnungGenerationResult> {
    try {
      logger.info('Starting XRechnung 3.0 generation (EN 16931 compliant)', {
        invoiceNumber: invoiceData.invoiceNumber,
      });

      // Run validation pipeline (throws on blocking errors)
      const validationResult = this.validator.validateInvoiceData(invoiceData);

      // Build XML
      const xmlContent = this.builder.buildXml(invoiceData);

      // Post-generation: lightweight XML structure validation
      const xmlStructure = validateXmlStructure(xmlContent);
      if (!xmlStructure.valid) {
        logger.warn('XML structure validation found issues', {
          invoiceNumber: invoiceData.invoiceNumber,
          errors: xmlStructure.errors,
        });
      }

      logger.info('XRechnung generated successfully', {
        invoiceNumber: invoiceData.invoiceNumber,
        xmlSize: xmlContent.length,
        warnings: validationResult.warnings.length,
      });

      // Combine pipeline warnings with XML structure errors
      const allWarnings = validationResult.warnings.map((w) => `[${w.ruleId}] ${w.message}`);
      if (!xmlStructure.valid) {
        allWarnings.push(...xmlStructure.errors.map((e) => `[XML-STRUCT] ${e}`));
      }

      const result: XRechnungGenerationResult = {
        xmlContent,
        fileName: `${invoiceData.invoiceNumber || 'invoice'}_xrechnung.xml`,
        fileSize: Buffer.byteLength(xmlContent, 'utf8'),
        validationStatus: allWarnings.length > 0 ? 'warnings' : 'valid',
        validationErrors: [],
        validationWarnings: allWarnings,
        structuredErrors: validationResult.warnings,
      };

      // P3: Optional external validation — appends to warnings, never replaces
      let tmpPath: string | undefined;
      try {
        tmpPath = await this.writeToTempFile(xmlContent, invoiceData.invoiceNumber);
        const extResult = await this.validator.validateExternal(tmpPath);

        if (extResult.ran) {
          result.externalValidation = extResult;
          if (!extResult.valid) {
            result.validationWarnings.push(
              `[KOSIT-EXT] External validator: ${extResult.error || 'invalid'}`
            );
            if (result.validationStatus === 'valid') {
              result.validationStatus = 'warnings';
            }
          }
          logger.info('External validation completed', {
            invoiceNumber: invoiceData.invoiceNumber,
            externalValid: extResult.valid,
          });
        }
        // When ran=false: result unchanged — internal status preserved
      } finally {
        // Cleanup temp XML file — never fail the conversion if cleanup fails
        if (tmpPath) {
          try {
            fs.unlinkSync(tmpPath);
          } catch (cleanupErr) {
            logger.warn('Failed to cleanup temp XML file', {
              tmpPath,
              error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          }
        }
      }

      return result;
    } catch (error) {
      logger.error('XRechnung generation failed', error);
      throw error;
    }
  }

  private async writeToTempFile(xml: string, invoiceNumber: string): Promise<string> {
    const tmpDir = os.tmpdir();
    const safeName = (invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
    const tmpPath = path.join(tmpDir, `xrechnung_${safeName}_${Date.now()}.xml`);
    fs.writeFileSync(tmpPath, xml, 'utf8');
    return tmpPath;
  }
}

export const xrechnungService = new XRechnungService();
