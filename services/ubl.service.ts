/**
 * UBL 2.1 Service
 * Generates UBL (Universal Business Language) format invoices
 * 
 * @module services/ubl.service
 */

import { logger } from '@/lib/logger';

export interface UBLInvoiceData {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate?: string;
    currency: string;

    // Seller
    sellerName: string;
    sellerEmail: string;
    sellerPhone?: string;
    sellerTaxId: string;
    sellerAddress?: string;
    sellerCity?: string;
    sellerPostalCode?: string;
    sellerCountryCode: string;

    // Buyer
    buyerName: string;
    buyerEmail?: string;
    buyerAddress?: string;
    buyerCity?: string;
    buyerPostalCode?: string;
    buyerCountryCode: string;
    buyerReference?: string;

    // Line items
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        unitCode?: string;
        taxPercent?: number;
    }>;

    // Totals
    subtotal: number;
    taxAmount: number;
    totalAmount: number;

    // Optional
    notes?: string;
    paymentTerms?: string;
}

export class UBLService {
    private readonly customizationId = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
    private readonly profileId = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

    /**
     * Generate UBL 2.1 Invoice XML
     */
    async generate(data: UBLInvoiceData): Promise<string> {
        logger.info('Generating UBL 2.1 invoice', { invoiceNumber: data.invoiceNumber });

        try {
            const xml = this.buildUBLDocument(data);
            logger.info('UBL invoice generated successfully');
            return xml;
        } catch (error) {
            logger.error('Failed to generate UBL invoice', { error });
            throw new Error(`UBL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Build complete UBL document
     */
    private buildUBLDocument(data: UBLInvoiceData): string {
        const issueDate = this.formatDate(data.invoiceDate);
        const dueDate = data.dueDate ? this.formatDate(data.dueDate) : issueDate;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    
    <cbc:CustomizationID>${this.customizationId}</cbc:CustomizationID>
    <cbc:ProfileID>${this.profileId}</cbc:ProfileID>
    <cbc:ID>${this.escapeXml(data.invoiceNumber)}</cbc:ID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
    <cbc:DueDate>${dueDate}</cbc:DueDate>
    <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
    ${data.notes ? `<cbc:Note>${this.escapeXml(data.notes)}</cbc:Note>` : ''}
    <cbc:DocumentCurrencyCode>${data.currency}</cbc:DocumentCurrencyCode>
    ${data.buyerReference ? `<cbc:BuyerReference>${this.escapeXml(data.buyerReference)}</cbc:BuyerReference>` : ''}
    
    ${this.buildAccountingSupplierParty(data)}
    ${this.buildAccountingCustomerParty(data)}
    ${data.paymentTerms ? this.buildPaymentTerms(data.paymentTerms) : ''}
    ${this.buildTaxTotal(data)}
    ${this.buildLegalMonetaryTotal(data)}
    ${this.buildInvoiceLines(data)}
</Invoice>`;
    }

    /**
     * Build AccountingSupplierParty (Seller)
     */
    private buildAccountingSupplierParty(data: UBLInvoiceData): string {
        return `
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>${this.escapeXml(data.sellerName)}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                ${data.sellerAddress ? `<cbc:StreetName>${this.escapeXml(data.sellerAddress)}</cbc:StreetName>` : ''}
                ${data.sellerCity ? `<cbc:CityName>${this.escapeXml(data.sellerCity)}</cbc:CityName>` : ''}
                ${data.sellerPostalCode ? `<cbc:PostalZone>${this.escapeXml(data.sellerPostalCode)}</cbc:PostalZone>` : ''}
                <cac:Country>
                    <cbc:IdentificationCode>${data.sellerCountryCode}</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${this.escapeXml(data.sellerTaxId)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${this.escapeXml(data.sellerName)}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
            <cac:Contact>
                ${data.sellerEmail ? `<cbc:ElectronicMail>${this.escapeXml(data.sellerEmail)}</cbc:ElectronicMail>` : ''}
                ${data.sellerPhone ? `<cbc:Telephone>${this.escapeXml(data.sellerPhone)}</cbc:Telephone>` : ''}
            </cac:Contact>
        </cac:Party>
    </cac:AccountingSupplierParty>`;
    }

    /**
     * Build AccountingCustomerParty (Buyer)
     */
    private buildAccountingCustomerParty(data: UBLInvoiceData): string {
        return `
    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>${this.escapeXml(data.buyerName)}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                ${data.buyerAddress ? `<cbc:StreetName>${this.escapeXml(data.buyerAddress)}</cbc:StreetName>` : ''}
                ${data.buyerCity ? `<cbc:CityName>${this.escapeXml(data.buyerCity)}</cbc:CityName>` : ''}
                ${data.buyerPostalCode ? `<cbc:PostalZone>${this.escapeXml(data.buyerPostalCode)}</cbc:PostalZone>` : ''}
                <cac:Country>
                    <cbc:IdentificationCode>${data.buyerCountryCode}</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${this.escapeXml(data.buyerName)}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
            ${data.buyerEmail ? `
            <cac:Contact>
                <cbc:ElectronicMail>${this.escapeXml(data.buyerEmail)}</cbc:ElectronicMail>
            </cac:Contact>` : ''}
        </cac:Party>
    </cac:AccountingCustomerParty>`;
    }

    /**
     * Build PaymentTerms
     */
    private buildPaymentTerms(terms: string): string {
        return `
    <cac:PaymentTerms>
        <cbc:Note>${this.escapeXml(terms)}</cbc:Note>
    </cac:PaymentTerms>`;
    }

    /**
     * Build TaxTotal
     */
    private buildTaxTotal(data: UBLInvoiceData): string {
        const taxPercent = data.lineItems[0]?.taxPercent || 19;

        return `
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${data.currency}">${this.formatAmount(data.taxAmount)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${data.currency}">${this.formatAmount(data.subtotal)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${data.currency}">${this.formatAmount(data.taxAmount)}</cbc:TaxAmount>
            <cac:TaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>${taxPercent}</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>
    </cac:TaxTotal>`;
    }

    /**
     * Build LegalMonetaryTotal
     */
    private buildLegalMonetaryTotal(data: UBLInvoiceData): string {
        return `
    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${data.currency}">${this.formatAmount(data.subtotal)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="${data.currency}">${this.formatAmount(data.subtotal)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="${data.currency}">${this.formatAmount(data.totalAmount)}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="${data.currency}">${this.formatAmount(data.totalAmount)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>`;
    }

    /**
     * Build InvoiceLines
     */
    private buildInvoiceLines(data: UBLInvoiceData): string {
        return data.lineItems.map((item, index) => this.buildInvoiceLine(item, index + 1, data.currency)).join('\n');
    }

    /**
     * Build single InvoiceLine
     */
    private buildInvoiceLine(
        item: UBLInvoiceData['lineItems'][0],
        lineId: number,
        currency: string
    ): string {
        const unitCode = item.unitCode || 'EA'; // EA = Each
        const taxPercent = item.taxPercent || 19;

        return `
    <cac:InvoiceLine>
        <cbc:ID>${lineId}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="${unitCode}">${item.quantity}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${currency}">${this.formatAmount(item.totalPrice)}</cbc:LineExtensionAmount>
        <cac:Item>
            <cbc:Description>${this.escapeXml(item.description)}</cbc:Description>
            <cbc:Name>${this.escapeXml(item.description.substring(0, 100))}</cbc:Name>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>${taxPercent}</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:ClassifiedTaxCategory>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="${currency}">${this.formatAmount(item.unitPrice)}</cbc:PriceAmount>
        </cac:Price>
    </cac:InvoiceLine>`;
    }

    /**
     * Format date to YYYY-MM-DD
     */
    private formatDate(date: string): string {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            // Try to parse German format DD.MM.YYYY
            const parts = date.split('.');
            if (parts.length === 3) {
                const day = parts[0] ?? '';
                const month = parts[1] ?? '';
                const year = parts[2] ?? '';
                if (day && month && year) {
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
            }
            return new Date().toISOString().split('T')[0] || '';
        }
        return d.toISOString().split('T')[0] || '';
    }

    /**
     * Format amount to 2 decimal places
     */
    private formatAmount(amount: number): string {
        return amount.toFixed(2);
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Validate UBL structure (basic validation)
     */
    async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        // Check required elements
        const requiredElements = [
            'CustomizationID',
            'ProfileID',
            'ID',
            'IssueDate',
            'InvoiceTypeCode',
            'DocumentCurrencyCode',
            'AccountingSupplierParty',
            'AccountingCustomerParty',
            'LegalMonetaryTotal',
            'InvoiceLine'
        ];

        for (const element of requiredElements) {
            if (!xml.includes(`<cbc:${element}>`) && !xml.includes(`<cac:${element}>`)) {
                errors.push(`Missing required element: ${element}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// Export singleton instance
export const ublService = new UBLService();
