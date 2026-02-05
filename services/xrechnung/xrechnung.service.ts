import { logger } from '@/lib/logger';
import { XRechnungGenerationResult } from './types';
import { xrechnungValidator } from './validator';
import { xrechnungBuilder } from './builder';

export class XRechnungService {
    constructor(
        private validator = xrechnungValidator,
        private builder = xrechnungBuilder
    ) { }

    generateXRechnung(invoiceData: any): XRechnungGenerationResult {
        try {
            logger.info('Starting XRechnung 3.0.2 generation (FULL BR-DE COMPLIANT)', {
                invoiceNumber: invoiceData.invoiceNumber,
            });

            // Validate data
            this.validator.validateInvoiceData(invoiceData);

            // Build XML
            const xmlContent = this.builder.buildXml(invoiceData);

            logger.info('XRechnung generated successfully', {
                invoiceNumber: invoiceData.invoiceNumber,
                xmlSize: xmlContent.length,
            });

            return {
                xmlContent,
                fileName: `${invoiceData.invoiceNumber || 'invoice'}_xrechnung.xml`,
                fileSize: Buffer.byteLength(xmlContent, 'utf8'),
                validationStatus: 'valid',
                validationErrors: [],
                validationWarnings: [],
            };
        } catch (error) {
            logger.error('XRechnung generation failed', error);
            throw error;
        }
    }
}

export const xrechnungService = new XRechnungService();
