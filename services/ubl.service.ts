/**
 * UBL 2.1 Service — XRechnung 3.0 Compliant
 * Generates UBL (Universal Business Language) format invoices compliant with
 * EN 16931 and XRechnung 3.0 CIUS.
 *
 * @module services/ubl.service
 */

import { logger } from '@/lib/logger';
import { roundMoney, sumMoney, computeTax } from '@/lib/monetary';
import { DEFAULT_VAT_RATE } from '@/lib/constants';
import { isEuVatId } from '@/lib/extraction-normalizer';

export interface UBLInvoiceData {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate?: string;
    currency: string;

    // Seller
    sellerName: string;
    sellerEmail: string;
    sellerPhone?: string;
    sellerContactName?: string;
    sellerTaxId: string;
    /** Seller VAT ID (BT-31) — EU format with country prefix */
    sellerVatId?: string;
    /** Seller tax number (BT-32) — local fiscal code */
    sellerTaxNumber?: string;
    sellerAddress?: string;
    sellerCity?: string;
    sellerPostalCode?: string;
    sellerCountryCode: string;
    /** Seller electronic address (BT-34) */
    sellerElectronicAddress?: string;
    /** Seller electronic address scheme (BT-34-1) */
    sellerElectronicAddressScheme?: string;
    sellerIban?: string;
    sellerBic?: string;

    // Buyer
    buyerName: string;
    buyerEmail?: string;
    buyerAddress?: string;
    buyerCity?: string;
    buyerPostalCode?: string;
    buyerCountryCode: string;
    buyerReference?: string;
    /** Buyer VAT ID (BT-48) */
    buyerVatId?: string;
    /** Buyer electronic address (BT-49) */
    buyerElectronicAddress?: string;
    /** Buyer electronic address scheme (BT-49-1) */
    buyerElectronicAddressScheme?: string;

    // Line items
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        unitCode?: string;
        taxPercent?: number;
        taxCategoryCode?: string;
    }>;

    // Totals
    subtotal: number;
    taxAmount: number;
    totalAmount: number;

    // Optional
    notes?: string;
    paymentTerms?: string;
    /** EN 16931 document type code (BT-3): 380=invoice, 381=credit note */
    documentTypeCode?: number;
    /** Preceding invoice reference (BT-25) — required for credit notes */
    precedingInvoiceReference?: string;
    /** Prepaid amount (BT-113) */
    prepaidAmount?: number;
    /** Billing period start date (BT-73) — YYYY-MM-DD */
    billingPeriodStart?: string;
    /** Billing period end date (BT-74) — YYYY-MM-DD */
    billingPeriodEnd?: string;
    /** Document-level allowances and charges */
    allowanceCharges?: Array<{
        chargeIndicator: boolean;
        amount: number;
        reason?: string;
        reasonCode?: string;
        taxRate?: number;
        taxCategoryCode?: string;
        percentage?: number;
        baseAmount?: number;
    }>;
}

export class UBLService {
    // XRechnung 3.0 UBL profile (NOT Peppol BIS)
    private readonly customizationId = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
    private readonly profileId = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

    /**
     * Generate UBL 2.1 Invoice XML (XRechnung 3.0 compliant)
     */
    async generate(data: UBLInvoiceData): Promise<string> {
        logger.info('Generating UBL 2.1 XRechnung invoice', { invoiceNumber: data.invoiceNumber });

        try {
            const xml = data.documentTypeCode === 381
                ? this.buildCreditNoteDocument(data)
                : this.buildUBLDocument(data);
            logger.info('UBL XRechnung invoice generated successfully');
            return xml;
        } catch (error) {
            logger.error('Failed to generate UBL invoice', { error });
            throw new Error(`UBL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Build complete UBL document — XRechnung 3.0 compliant
     */
    private buildUBLDocument(data: UBLInvoiceData): string {
        const issueDate = this.formatDate(data.invoiceDate);
        const dueDate = data.dueDate ? this.formatDate(data.dueDate) : issueDate;
        const typeCode = data.documentTypeCode || 380;
        // BR-DE-15: BuyerReference is MANDATORY for XRechnung
        const buyerRef = data.buyerReference || data.invoiceNumber || 'LEITWEG-ID';

        return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>${this.customizationId}</cbc:CustomizationID>
    <cbc:ProfileID>${this.profileId}</cbc:ProfileID>
    <cbc:ID>${this.escapeXml(data.invoiceNumber)}</cbc:ID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
    <cbc:DueDate>${dueDate}</cbc:DueDate>
    ${this.buildInvoicePeriod(data)}
    <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
    ${data.notes ? `<cbc:Note>${this.escapeXml(data.notes)}</cbc:Note>` : ''}
    <cbc:DocumentCurrencyCode>${data.currency}</cbc:DocumentCurrencyCode>
    <cbc:BuyerReference>${this.escapeXml(buyerRef)}</cbc:BuyerReference>
    ${this.buildPrecedingInvoiceReference(data)}
    ${this.buildAccountingSupplierParty(data)}
    ${this.buildAccountingCustomerParty(data)}
    ${this.buildDelivery(data)}
    ${this.buildPaymentMeans(data)}
    ${data.paymentTerms ? this.buildPaymentTerms(data.paymentTerms) : ''}
    ${this.buildAllowanceCharges(data)}
    ${this.buildTaxTotal(data)}
    ${this.buildLegalMonetaryTotal(data)}
    ${this.buildInvoiceLines(data)}
</Invoice>`;
    }

    /**
     * Build complete UBL CreditNote document — uses CreditNote root element and line tags
     */
    private buildCreditNoteDocument(data: UBLInvoiceData): string {
        const issueDate = this.formatDate(data.invoiceDate);
        const dueDate = data.dueDate ? this.formatDate(data.dueDate) : issueDate;
        const buyerRef = data.buyerReference || data.invoiceNumber || 'LEITWEG-ID';

        return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>${this.customizationId}</cbc:CustomizationID>
    <cbc:ProfileID>${this.profileId}</cbc:ProfileID>
    <cbc:ID>${this.escapeXml(data.invoiceNumber)}</cbc:ID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
    <cbc:DueDate>${dueDate}</cbc:DueDate>
    ${this.buildInvoicePeriod(data)}
    <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
    ${data.notes ? `<cbc:Note>${this.escapeXml(data.notes)}</cbc:Note>` : ''}
    <cbc:DocumentCurrencyCode>${data.currency}</cbc:DocumentCurrencyCode>
    <cbc:BuyerReference>${this.escapeXml(buyerRef)}</cbc:BuyerReference>
    ${this.buildPrecedingInvoiceReference(data)}
    ${this.buildAccountingSupplierParty(data)}
    ${this.buildAccountingCustomerParty(data)}
    ${this.buildDelivery(data)}
    ${this.buildPaymentMeans(data)}
    ${data.paymentTerms ? this.buildPaymentTerms(data.paymentTerms) : ''}
    ${this.buildAllowanceCharges(data)}
    ${this.buildTaxTotal(data)}
    ${this.buildLegalMonetaryTotal(data)}
    ${this.buildCreditNoteLines(data)}
</CreditNote>`;
    }

    /**
     * Build CreditNoteLines
     */
    private buildCreditNoteLines(data: UBLInvoiceData): string {
        return data.lineItems.map((item, index) => this.buildCreditNoteLine(item, index + 1, data.currency)).join('\n');
    }

    /**
     * Build single CreditNoteLine
     */
    private buildCreditNoteLine(
        item: UBLInvoiceData['lineItems'][0],
        lineId: number,
        currency: string
    ): string {
        const unitCode = item.unitCode || 'C62';
        const taxPercent = item.taxPercent ?? DEFAULT_VAT_RATE;
        const categoryCode = item.taxCategoryCode || (taxPercent > 0 ? 'S' : 'E');

        return `
    <cac:CreditNoteLine>
        <cbc:ID>${lineId}</cbc:ID>
        <cbc:CreditedQuantity unitCode="${unitCode}">${item.quantity.toFixed(4)}</cbc:CreditedQuantity>
        <cbc:LineExtensionAmount currencyID="${currency}">${this.formatAmount(item.totalPrice)}</cbc:LineExtensionAmount>
        <cac:Item>
            <cbc:Description>${this.escapeXml(item.description)}</cbc:Description>
            <cbc:Name>${this.escapeXml(item.description.substring(0, 100))}</cbc:Name>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>${categoryCode}</cbc:ID>
                <cbc:Percent>${taxPercent.toFixed(2)}</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:ClassifiedTaxCategory>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="${currency}">${this.formatAmount(item.unitPrice)}</cbc:PriceAmount>
        </cac:Price>
    </cac:CreditNoteLine>`;
    }

    /**
     * BG-14: Invoice period (BT-73 start, BT-74 end)
     */
    private buildInvoicePeriod(data: UBLInvoiceData): string {
        const start = data.billingPeriodStart?.trim();
        const end = data.billingPeriodEnd?.trim();
        if (!start && !end) return '';

        let xml = '<cac:InvoicePeriod>';
        if (start) xml += `\n        <cbc:StartDate>${this.formatDate(start)}</cbc:StartDate>`;
        if (end) xml += `\n        <cbc:EndDate>${this.formatDate(end)}</cbc:EndDate>`;
        xml += '\n    </cac:InvoicePeriod>';
        return xml;
    }

    /**
     * BG-3: Preceding invoice reference (required for credit notes)
     */
    private buildPrecedingInvoiceReference(data: UBLInvoiceData): string {
        if (!data.precedingInvoiceReference?.trim()) return '';
        return `
    <cac:BillingReference>
        <cac:InvoiceDocumentReference>
            <cbc:ID>${this.escapeXml(data.precedingInvoiceReference.trim())}</cbc:ID>
        </cac:InvoiceDocumentReference>
    </cac:BillingReference>`;
    }

    /**
     * Detect electronic address scheme from address value.
     */
    private detectScheme(address: string): string {
        if (!address) return 'EM';
        if (address.includes('@')) return 'EM';
        const peppolMatch = address.match(/^(\d{4}):/);
        if (peppolMatch?.[1]) return peppolMatch[1];
        return 'EM';
    }

    /**
     * Build AccountingSupplierParty (Seller) — XRechnung compliant
     * Includes: EndpointID (BT-34), Contact (BR-DE-2), Tax registrations
     */
    private buildAccountingSupplierParty(data: UBLInvoiceData): string {
        const eAddr = data.sellerElectronicAddress || data.sellerEmail || '';
        const eScheme = data.sellerElectronicAddressScheme || this.detectScheme(eAddr);
        const contactName = data.sellerContactName || data.sellerName || '';
        const vatId = data.sellerVatId || (data.sellerTaxId && isEuVatId(data.sellerTaxId) ? data.sellerTaxId : '');
        const taxNumber = data.sellerTaxNumber || (!vatId ? data.sellerTaxId : '');

        return `
    <cac:AccountingSupplierParty>
        <cac:Party>
            ${eAddr ? `<cbc:EndpointID schemeID="${this.escapeXml(eScheme)}">${this.escapeXml(eAddr)}</cbc:EndpointID>` : ''}
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
            ${vatId ? `<cac:PartyTaxScheme>
                <cbc:CompanyID>${this.escapeXml(vatId)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>` : ''}
            ${taxNumber ? `<cac:PartyTaxScheme>
                <cbc:CompanyID>${this.escapeXml(taxNumber)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>TAX</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>` : ''}
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${this.escapeXml(data.sellerName)}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
            <cac:Contact>
                ${contactName ? `<cbc:Name>${this.escapeXml(contactName)}</cbc:Name>` : ''}
                ${data.sellerPhone ? `<cbc:Telephone>${this.escapeXml(data.sellerPhone)}</cbc:Telephone>` : ''}
                ${data.sellerEmail ? `<cbc:ElectronicMail>${this.escapeXml(data.sellerEmail)}</cbc:ElectronicMail>` : ''}
            </cac:Contact>
        </cac:Party>
    </cac:AccountingSupplierParty>`;
    }

    /**
     * Build AccountingCustomerParty (Buyer) — XRechnung compliant
     * Includes: EndpointID (BT-49), VAT registration
     */
    private buildAccountingCustomerParty(data: UBLInvoiceData): string {
        const eAddr = data.buyerElectronicAddress || data.buyerEmail || '';
        const eScheme = data.buyerElectronicAddressScheme || this.detectScheme(eAddr);
        const buyerVatId = data.buyerVatId || '';

        return `
    <cac:AccountingCustomerParty>
        <cac:Party>
            ${eAddr ? `<cbc:EndpointID schemeID="${this.escapeXml(eScheme)}">${this.escapeXml(eAddr)}</cbc:EndpointID>` : ''}
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
            ${buyerVatId ? `<cac:PartyTaxScheme>
                <cbc:CompanyID>${this.escapeXml(buyerVatId)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>` : ''}
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
     * Build Delivery (BG-13) — delivery date defaults to invoice date
     */
    private buildDelivery(data: UBLInvoiceData): string {
        const deliveryDate = this.formatDate(data.invoiceDate);
        return `
    <cac:Delivery>
        <cbc:ActualDeliveryDate>${deliveryDate}</cbc:ActualDeliveryDate>
    </cac:Delivery>`;
    }

    /**
     * Build PaymentMeans (BG-16) — with IBAN support
     * BR-DE-13/19: TypeCode must be from allowed set (10, 30, 48, 49, 57, 58, 59, 97)
     */
    private buildPaymentMeans(data: UBLInvoiceData): string {
        const iban = data.sellerIban;
        const bic = data.sellerBic;

        if (!iban) {
            return `
    <cac:PaymentMeans>
        <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    </cac:PaymentMeans>`;
        }

        return `
    <cac:PaymentMeans>
        <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
        <cac:PayeeFinancialAccount>
            <cbc:ID>${this.escapeXml(iban)}</cbc:ID>
            ${bic ? `<cac:FinancialInstitutionBranch>
                <cbc:ID>${this.escapeXml(bic)}</cbc:ID>
            </cac:FinancialInstitutionBranch>` : ''}
        </cac:PayeeFinancialAccount>
    </cac:PaymentMeans>`;
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
     * Build document-level AllowanceCharges (BG-20 / BG-21)
     */
    private buildAllowanceCharges(data: UBLInvoiceData): string {
        if (!data.allowanceCharges || data.allowanceCharges.length === 0) return '';

        return data.allowanceCharges.map((ac) => {
            const taxRate = ac.taxRate ?? DEFAULT_VAT_RATE;
            const categoryCode = ac.taxCategoryCode || (taxRate > 0 ? 'S' : 'E');
            return `
    <cac:AllowanceCharge>
        <cbc:ChargeIndicator>${ac.chargeIndicator}</cbc:ChargeIndicator>
        ${ac.reason ? `<cbc:AllowanceChargeReason>${this.escapeXml(ac.reason)}</cbc:AllowanceChargeReason>` : ''}
        ${ac.reasonCode ? `<cbc:AllowanceChargeReasonCode>${this.escapeXml(ac.reasonCode)}</cbc:AllowanceChargeReasonCode>` : ''}
        ${ac.percentage != null ? `<cbc:MultiplierFactorNumeric>${ac.percentage.toFixed(2)}</cbc:MultiplierFactorNumeric>` : ''}
        <cbc:Amount currencyID="${data.currency}">${(Number(ac.amount) || 0).toFixed(2)}</cbc:Amount>
        ${ac.baseAmount != null ? `<cbc:BaseAmount currencyID="${data.currency}">${ac.baseAmount.toFixed(2)}</cbc:BaseAmount>` : ''}
        <cac:TaxCategory>
            <cbc:ID>${categoryCode}</cbc:ID>
            <cbc:Percent>${taxRate.toFixed(2)}</cbc:Percent>
            <cac:TaxScheme>
                <cbc:ID>VAT</cbc:ID>
            </cac:TaxScheme>
        </cac:TaxCategory>
    </cac:AllowanceCharge>`;
        }).join('');
    }

    /**
     * Build TaxTotal with multi-rate support
     */
    private buildTaxTotal(data: UBLInvoiceData): string {
        // Group line items by tax rate
        const taxGroups = new Map<number, { taxableAmount: number; categoryCode: string }>();

        for (const item of data.lineItems) {
            const rate = item.taxPercent ?? DEFAULT_VAT_RATE;
            const categoryCode = item.taxCategoryCode || (rate > 0 ? 'S' : 'E');
            const existing = taxGroups.get(rate);
            if (existing) {
                existing.taxableAmount = roundMoney(existing.taxableAmount + item.totalPrice);
            } else {
                taxGroups.set(rate, { taxableAmount: item.totalPrice, categoryCode });
            }
        }

        // Include allowances/charges in tax groups
        if (data.allowanceCharges) {
            for (const ac of data.allowanceCharges) {
                const rate = ac.taxRate ?? DEFAULT_VAT_RATE;
                const categoryCode = ac.taxCategoryCode || (rate > 0 ? 'S' : 'E');
                const adjustment = ac.chargeIndicator ? (Number(ac.amount) || 0) : -(Number(ac.amount) || 0);
                const existing = taxGroups.get(rate);
                if (existing) {
                    existing.taxableAmount = roundMoney(existing.taxableAmount + adjustment);
                } else {
                    taxGroups.set(rate, { taxableAmount: adjustment, categoryCode });
                }
            }
        }

        const subtotals = Array.from(taxGroups.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([rate, group]) => {
                const taxAmount = computeTax(group.taxableAmount, rate);
                return `
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${data.currency}">${roundMoney(group.taxableAmount).toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${data.currency}">${taxAmount.toFixed(2)}</cbc:TaxAmount>
            <cac:TaxCategory>
                <cbc:ID>${group.categoryCode}</cbc:ID>
                <cbc:Percent>${rate.toFixed(2)}</cbc:Percent>${this.buildTaxExemptionReason(group.categoryCode)}
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>`;
            }).join('');

        return `
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${data.currency}">${this.formatAmount(data.taxAmount)}</cbc:TaxAmount>${subtotals}
    </cac:TaxTotal>`;
    }

    /** Tax exemption reason mapping for non-standard VAT categories */
    private static readonly TAX_EXEMPTION_MAP: Record<string, { reason: string; code: string }> = {
        'E':  { reason: 'Exempt from tax', code: 'vatex-eu-132' },
        'AE': { reason: 'Reverse charge', code: 'vatex-eu-ae' },
        'K':  { reason: 'Intra-community supply', code: 'vatex-eu-ic' },
        'G':  { reason: 'Export outside the EU', code: 'vatex-eu-g' },
        'O':  { reason: 'Not subject to VAT', code: 'vatex-eu-o' },
    };

    /**
     * Build TaxExemptionReasonCode + TaxExemptionReason for applicable tax categories
     */
    private buildTaxExemptionReason(categoryCode: string): string {
        const entry = UBLService.TAX_EXEMPTION_MAP[categoryCode];
        if (!entry) return '';
        return `
                <cbc:TaxExemptionReasonCode>${entry.code}</cbc:TaxExemptionReasonCode>
                <cbc:TaxExemptionReason>${entry.reason}</cbc:TaxExemptionReason>`;
    }

    /**
     * Build LegalMonetaryTotal — with allowance/charge and prepaid support
     */
    private buildLegalMonetaryTotal(data: UBLInvoiceData): string {
        const lineExtension = sumMoney(data.lineItems.map(i => i.totalPrice));
        const allowanceCharges = data.allowanceCharges || [];
        const totalAllowances = sumMoney(allowanceCharges.filter(ac => !ac.chargeIndicator).map(ac => Number(ac.amount) || 0));
        const totalCharges = sumMoney(allowanceCharges.filter(ac => ac.chargeIndicator).map(ac => Number(ac.amount) || 0));
        const prepaid = Number(data.prepaidAmount) || 0;
        const payable = roundMoney(data.totalAmount - prepaid);

        return `
    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${data.currency}">${roundMoney(lineExtension).toFixed(2)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="${data.currency}">${this.formatAmount(data.subtotal)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="${data.currency}">${this.formatAmount(data.totalAmount)}</cbc:TaxInclusiveAmount>
        ${totalAllowances > 0 ? `<cbc:AllowanceTotalAmount currencyID="${data.currency}">${totalAllowances.toFixed(2)}</cbc:AllowanceTotalAmount>` : ''}
        ${totalCharges > 0 ? `<cbc:ChargeTotalAmount currencyID="${data.currency}">${totalCharges.toFixed(2)}</cbc:ChargeTotalAmount>` : ''}
        ${prepaid > 0 ? `<cbc:PrepaidAmount currencyID="${data.currency}">${roundMoney(prepaid).toFixed(2)}</cbc:PrepaidAmount>` : ''}
        <cbc:PayableAmount currencyID="${data.currency}">${payable.toFixed(2)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>`;
    }

    /**
     * Build InvoiceLines
     */
    private buildInvoiceLines(data: UBLInvoiceData): string {
        return data.lineItems.map((item, index) => this.buildInvoiceLine(item, index + 1, data.currency)).join('\n');
    }

    /**
     * Build single InvoiceLine with proper tax category
     */
    private buildInvoiceLine(
        item: UBLInvoiceData['lineItems'][0],
        lineId: number,
        currency: string
    ): string {
        const unitCode = item.unitCode || 'C62'; // C62 = unit (EN 16931 default), not EA
        const taxPercent = item.taxPercent ?? DEFAULT_VAT_RATE;
        const categoryCode = item.taxCategoryCode || (taxPercent > 0 ? 'S' : 'E');

        return `
    <cac:InvoiceLine>
        <cbc:ID>${lineId}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="${unitCode}">${item.quantity.toFixed(4)}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${currency}">${this.formatAmount(item.totalPrice)}</cbc:LineExtensionAmount>
        <cac:Item>
            <cbc:Description>${this.escapeXml(item.description)}</cbc:Description>
            <cbc:Name>${this.escapeXml(item.description.substring(0, 100))}</cbc:Name>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>${categoryCode}</cbc:ID>
                <cbc:Percent>${taxPercent.toFixed(2)}</cbc:Percent>
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
        // Already in ISO format
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
            return date.substring(0, 10);
        }

        // German format DD.MM.YYYY
        const germanMatch = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (germanMatch) {
            const day = germanMatch[1];
            const month = germanMatch[2];
            const year = germanMatch[3];
            if (day && month && year) {
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
        }

        // YYYYMMDD format
        if (/^\d{8}$/.test(date)) {
            return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        }

        // Reject ambiguous slash formats
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
            logger.warn('UBL: Ambiguous date format rejected', { date });
            throw new Error(`Ambiguous date format "${date}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
        }

        const d = new Date(date);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0] || '';
        }

        logger.warn('UBL: Could not parse date', { date });
        throw new Error(`Invalid date format "${date}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
    }

    /**
     * Format amount to 2 decimal places
     */
    private formatAmount(amount: number): string {
        return roundMoney(amount).toFixed(2);
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
            .replace(/'/g, '&apos;')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Strip XML-invalid control chars
    }

    /**
     * Validate UBL structure (basic validation)
     */
    async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        const isCreditNote = xml.includes('<CreditNote ') || xml.includes('<CreditNote>');

        const requiredElements = [
            'CustomizationID',
            'ProfileID',
            'ID',
            'IssueDate',
            isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode',
            'DocumentCurrencyCode',
            'BuyerReference',
            'AccountingSupplierParty',
            'AccountingCustomerParty',
            'LegalMonetaryTotal',
            isCreditNote ? 'CreditNoteLine' : 'InvoiceLine',
            'Delivery',
            'PaymentMeans',
        ];

        for (const element of requiredElements) {
            if (!xml.includes(element)) {
                errors.push(`Missing required element: ${element}`);
            }
        }

        // Check for XRechnung customization ID
        if (!xml.includes('xeinkauf.de:kosit:xrechnung_3.0')) {
            errors.push('Missing XRechnung 3.0 customization ID (must use xeinkauf.de:kosit:xrechnung_3.0)');
        }

        // Check for EndpointID (BT-34/BT-49)
        if (!xml.includes('EndpointID')) {
            errors.push('Missing EndpointID (electronic address) — required for XRechnung');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// Export singleton instance
export const ublService = new UBLService();
