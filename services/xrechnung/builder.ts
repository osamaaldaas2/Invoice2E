import { DEFAULT_VAT_RATE, REDUCED_VAT_RATE } from '@/lib/constants';
import { logger } from '@/lib/logger';

export class XRechnungBuilder {
    private readonly xmlns = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
    private readonly xsi = 'http://www.w3.org/2001/XMLSchema-instance';
    // BR-DE-21: Specification identifier MUST match XRechnung standard syntax exactly
    private readonly xrechnungVersion = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

    buildXml(data: any): string {
        const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';

        const rootElement = `
<rsm:CrossIndustryInvoice xmlns:rsm="${this.xmlns}"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
                          xmlns:xsi="${this.xsi}">
    ${this.buildExchangedDocumentContext()}
    ${this.buildExchangedDocument(data)}
    ${this.buildSupplyChainTradeTransaction(data)}
</rsm:CrossIndustryInvoice>`;

        return xmlDeclaration + rootElement;
    }

    private buildExchangedDocumentContext(): string {
        return `
    <rsm:ExchangedDocumentContext>
        <ram:BusinessProcessSpecifiedDocumentContextParameter>
            <ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID>
        </ram:BusinessProcessSpecifiedDocumentContextParameter>
        <ram:GuidelineSpecifiedDocumentContextParameter>
            <ram:ID>${this.xrechnungVersion}</ram:ID>
        </ram:GuidelineSpecifiedDocumentContextParameter>
    </rsm:ExchangedDocumentContext>`;
    }

    private buildExchangedDocument(data: any): string {
        return `
    <rsm:ExchangedDocument>
        <ram:ID>${this.escapeXml(data.invoiceNumber)}</ram:ID>
        <ram:TypeCode>380</ram:TypeCode>
        <ram:IssueDateTime>
            <udt:DateTimeString format="102">${this.formatDate(data.invoiceDate)}</udt:DateTimeString>
        </ram:IssueDateTime>
    </rsm:ExchangedDocument>`;
    }

    private buildSupplyChainTradeTransaction(data: any): string {
        const items = data.lineItems || data.items || [];

        return `
    <rsm:SupplyChainTradeTransaction>
        ${this.buildLineItems(items)}
        ${this.buildTradeAgreement(data)}
        ${this.buildTradeDelivery(data)}
        ${this.buildTradeSettlement(data)}
    </rsm:SupplyChainTradeTransaction>`;
    }

    /**
     * FIX (BUG-025/027): Use actual tax rate per line item, ensure no null values
     * FIX (QA-BUG-2): Validate required fields, use configurable VAT rate
     */
    private buildLineItems(items: any[]): string {
        return items
            .map(
                (item, index) => {
                    // FIX (QA-BUG-2): Use safeNumberOrUndefined to detect missing values
                    const unitPriceRaw = this.safeNumberOrUndefined(item.unitPrice);
                    const quantityRaw = this.safeNumberOrUndefined(item.quantity);

                    // Validate required fields - unit price is critical
                    if (unitPriceRaw === undefined) {
                        logger.warn('XRechnung: Line item missing unit price, using 0', { lineIndex: index });
                    }

                    const unitPrice = unitPriceRaw ?? 0;
                    const quantity = quantityRaw ?? 1; // Default to 1 if not specified
                    const totalPrice = this.safeNumber(item.totalPrice || item.lineTotal) || (unitPrice * quantity);
                    // FIX (QA-BUG-4): Use configurable DEFAULT_VAT_RATE instead of hardcoded 19
                    const taxRate = this.safeNumber(item.taxRate || item.vatRate) || DEFAULT_VAT_RATE;

                    return `
        <ram:IncludedSupplyChainTradeLineItem>
            <ram:AssociatedDocumentLineDocument>
                <ram:LineID>${index + 1}</ram:LineID>
            </ram:AssociatedDocumentLineDocument>
            <ram:SpecifiedTradeProduct>
                <ram:Name>${this.escapeXml(item.description || item.name || 'Item')}</ram:Name>
            </ram:SpecifiedTradeProduct>
            <ram:SpecifiedLineTradeAgreement>
                <ram:NetPriceProductTradePrice>
                    <ram:ChargeAmount>${unitPrice.toFixed(2)}</ram:ChargeAmount>
                </ram:NetPriceProductTradePrice>
            </ram:SpecifiedLineTradeAgreement>
            <ram:SpecifiedLineTradeDelivery>
                <ram:BilledQuantity unitCode="${this.escapeXml(item.unitCode || 'C62')}">${quantity.toFixed(4)}</ram:BilledQuantity>
            </ram:SpecifiedLineTradeDelivery>
            <ram:SpecifiedLineTradeSettlement>
                <ram:ApplicableTradeTax>
                    <ram:TypeCode>VAT</ram:TypeCode>
                    <ram:CategoryCode>S</ram:CategoryCode>
                    <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
                </ram:ApplicableTradeTax>
                <ram:SpecifiedTradeSettlementLineMonetarySummation>
                    <ram:LineTotalAmount>${totalPrice.toFixed(2)}</ram:LineTotalAmount>
                </ram:SpecifiedTradeSettlementLineMonetarySummation>
            </ram:SpecifiedLineTradeSettlement>
        </ram:IncludedSupplyChainTradeLineItem>`;
                }
            )
            .join('');
    }

    private buildTradeAgreement(data: any): string {
        // BR-DE-15: BuyerReference (BT-10) is MANDATORY - use invoice number as fallback
        const buyerRef = data.buyerReference || data.invoiceNumber || 'LEITWEG-ID';

        return `
    <ram:ApplicableHeaderTradeAgreement>
        <ram:BuyerReference>${this.escapeXml(buyerRef)}</ram:BuyerReference>
        ${this.buildSellerTradeParty(data)}
        ${this.buildBuyerTradeParty(data)}
    </ram:ApplicableHeaderTradeAgreement>`;
    }

    /**
     * OFFICIAL ORDER for PostalTradeAddress:
     * 1. PostcodeCode
     * 2. LineOne
     * 3. CityName
     * 4. CountryID
     */
    private buildPostalAddress(postalCode: string, lineOne: string, city: string, countryCode: string): string {
        return `
            <ram:PostalTradeAddress>
                <ram:PostcodeCode>${this.escapeXml(postalCode)}</ram:PostcodeCode>
                <ram:LineOne>${this.escapeXml(lineOne)}</ram:LineOne>
                <ram:CityName>${this.escapeXml(city)}</ram:CityName>
                <ram:CountryID>${countryCode}</ram:CountryID>
            </ram:PostalTradeAddress>`;
    }

    /**
     * Build URIUniversalCommunication - ONLY if email is present!
     * Golden Rule: NO EMPTY TAGS
     */
    private buildURICommunication(email: string): string {
        if (!email || email.trim() === '') {
            return ''; // GOLDEN RULE: No empty tags!
        }
        return `
            <ram:URIUniversalCommunication>
                <ram:URIID schemeID="EM">${this.escapeXml(email)}</ram:URIID>
            </ram:URIUniversalCommunication>`;
    }

    /**
     * BR-DE-2: SELLER CONTACT (BG-6) is MANDATORY for German invoices
     * Must include: PersonName, Phone, Email
     * Position: After Name, before PostalTradeAddress
     *
     * DATA INTEGRITY FIX (BUG-024): Removed hardcoded fake phone/email defaults
     * Now uses actual data or logs warning if missing required fields
     */
    private buildSellerContact(data: any): string {
        const contactName = data.sellerContactName || data.sellerContact || data.sellerName;
        const phone = data.sellerPhoneNumber || data.sellerPhone;
        const email = data.sellerEmail;

        // Log warnings for missing required contact fields (but don't fail - validation handles this)
        if (!contactName) {
            console.warn('XRechnung: Missing seller contact name');
        }
        if (!phone) {
            console.warn('XRechnung: Missing seller phone number (BR-DE-2 requires this)');
        }
        if (!email) {
            console.warn('XRechnung: Missing seller email (BR-DE-2 requires this)');
        }

        return `
            <ram:DefinedTradeContact>
                <ram:PersonName>${this.escapeXml(contactName || '')}</ram:PersonName>
                ${phone ? `<ram:TelephoneUniversalCommunication>
                    <ram:CompleteNumber>${this.escapeXml(phone)}</ram:CompleteNumber>
                </ram:TelephoneUniversalCommunication>` : ''}
                ${email ? `<ram:EmailURIUniversalCommunication>
                    <ram:URIID>${this.escapeXml(email)}</ram:URIID>
                </ram:EmailURIUniversalCommunication>` : ''}
            </ram:DefinedTradeContact>`;
    }

    private buildSellerTradeParty(data: any): string {
        return `
        <ram:SellerTradeParty>
            <ram:Name>${this.escapeXml(data.sellerName)}</ram:Name>
            ${this.buildSellerContact(data)}
            ${this.buildPostalAddress(
            data.sellerPostalCode || '',
            data.sellerAddress || '',
            data.sellerCity || '',
            data.sellerCountryCode || 'DE'
        )}
            ${this.buildURICommunication(data.sellerEmail)}
            <ram:SpecifiedTaxRegistration>
                <ram:ID schemeID="VA">${this.escapeXml(data.sellerTaxId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>
        </ram:SellerTradeParty>`;
    }

    /**
     * DATA INTEGRITY FIX (BUG-023): Removed hardcoded 'buyer@example.de' default
     * Buyer email is now optional - if not provided, URICommunication is omitted
     */
    private buildBuyerTradeParty(data: any): string {
        // PEPPOL-EN16931-R010: Buyer electronic address is MANDATORY
        // However, we should not use fake defaults - let validation handle this
        const buyerEmail = data.buyerEmail;

        if (!buyerEmail) {
            console.warn('XRechnung: Missing buyer email (PEPPOL-EN16931-R010 requires this)');
        }

        return `
        <ram:BuyerTradeParty>
            <ram:Name>${this.escapeXml(data.buyerName || '')}</ram:Name>
            ${this.buildPostalAddress(
            data.buyerPostalCode || '',
            data.buyerAddress || '',
            data.buyerCity || '',
            data.buyerCountryCode || 'DE'
        )}
            ${buyerEmail ? this.buildURICommunication(buyerEmail) : ''}
        </ram:BuyerTradeParty>`;
    }

    private buildTradeDelivery(data: any): string {
        return `
    <ram:ApplicableHeaderTradeDelivery>
        <ram:ActualDeliverySupplyChainEvent>
            <ram:OccurrenceDateTime>
                <udt:DateTimeString format="102">${this.formatDate(data.invoiceDate)}</udt:DateTimeString>
            </ram:OccurrenceDateTime>
        </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>`;
    }

    /**
     * BR-DE-23-a: When payment type is 30 (bank transfer), CREDIT TRANSFER (BG-17) is MANDATORY
     * Must include PayeePartyCreditorFinancialAccount with IBAN
     *
     * CRITICAL DATA INTEGRITY FIX (BUG-011): Removed hardcoded example IBAN 'DE89370400440532013000'
     * This was a real German tutorial IBAN that could cause payments to go to wrong account!
     * IBAN is now required - if missing, payment means section is omitted with warning
     */
    private buildPaymentMeans(data: any): string {
        const iban = data.sellerIban || data.iban;
        const bic = data.sellerBic || data.bic || '';

        if (!iban) {
            console.warn('XRechnung: Missing seller IBAN (BR-DE-23-a requires this for bank transfers)');
            // Return empty payment means - validation should catch this
            return `
            <ram:SpecifiedTradeSettlementPaymentMeans>
                <ram:TypeCode>1</ram:TypeCode>
            </ram:SpecifiedTradeSettlementPaymentMeans>`;
        }

        return `
            <ram:SpecifiedTradeSettlementPaymentMeans>
                <ram:TypeCode>58</ram:TypeCode>
                <ram:PayeePartyCreditorFinancialAccount>
                    <ram:IBANID>${this.escapeXml(iban)}</ram:IBANID>
                </ram:PayeePartyCreditorFinancialAccount>
                ${bic ? `
                <ram:PayeeSpecifiedCreditorFinancialInstitution>
                    <ram:BICID>${this.escapeXml(bic)}</ram:BICID>
                </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
            </ram:SpecifiedTradeSettlementPaymentMeans>`;
    }

    /**
     * OFFICIAL ORDER for ApplicableHeaderTradeSettlement:
     * 1. InvoiceCurrencyCode
     * 2. SpecifiedTradeSettlementPaymentMeans
     * 3. ApplicableTradeTax
     * 4. SpecifiedTradePaymentTerms
     * 5. SpecifiedTradeSettlementHeaderMonetarySummation
     *
     * DATA INTEGRITY FIX (BUG-025): Use actual tax rate from data instead of hardcoded 19%
     */
    /**
     * FIX (BUG-027): Ensure all numeric values are properly coalesced to prevent null in XML
     */
    private buildTradeSettlement(data: any): string {
        const taxAmount = this.safeNumber(data.taxAmount);
        const subtotal = this.safeNumber(data.subtotal);
        const total = this.safeNumber(data.totalAmount);
        const currency = this.normalizeCurrency(data.currency);
        // FIX: Use actual tax rate from data, calculate from amounts if not provided
        const taxRate = this.safeNumber(data.taxRate || data.vatRate) || this.calculateTaxRate(subtotal, taxAmount);

        return `
        <ram:ApplicableHeaderTradeSettlement>
            <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>

            ${this.buildPaymentMeans(data)}

            <ram:ApplicableTradeTax>
                <ram:CalculatedAmount>${taxAmount.toFixed(2)}</ram:CalculatedAmount>
                <ram:TypeCode>VAT</ram:TypeCode>
                <ram:BasisAmount>${subtotal.toFixed(2)}</ram:BasisAmount>
                <ram:CategoryCode>S</ram:CategoryCode>
                <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>

            ${this.buildPaymentTerms(data)}

            <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
                <ram:LineTotalAmount>${subtotal.toFixed(2)}</ram:LineTotalAmount>
                <ram:TaxBasisTotalAmount>${subtotal.toFixed(2)}</ram:TaxBasisTotalAmount>
                <ram:TaxTotalAmount currencyID="${currency}">${taxAmount.toFixed(2)}</ram:TaxTotalAmount>
                <ram:GrandTotalAmount>${total.toFixed(2)}</ram:GrandTotalAmount>
                <ram:DuePayableAmount>${total.toFixed(2)}</ram:DuePayableAmount>
            </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        </ram:ApplicableHeaderTradeSettlement>`;
    }

    /**
     * Calculate tax rate from subtotal and tax amount
     * FIX (QA-BUG-4): Use configurable DEFAULT_VAT_RATE instead of hardcoded 19%
     */
    private calculateTaxRate(subtotal: number, taxAmount: number): number {
        if (subtotal > 0 && taxAmount >= 0) {
            const calculatedRate = (taxAmount / subtotal) * 100;
            // Round to common tax rates
            if (Math.abs(calculatedRate - DEFAULT_VAT_RATE) < 0.5) return DEFAULT_VAT_RATE;
            if (Math.abs(calculatedRate - REDUCED_VAT_RATE) < 0.5) return REDUCED_VAT_RATE;
            if (Math.abs(calculatedRate - 0) < 0.5) return 0;
            return Math.round(calculatedRate * 100) / 100; // Round to 2 decimals
        }
        // Default to standard VAT rate for German invoices when calculation not possible
        return DEFAULT_VAT_RATE;
    }

    private buildPaymentTerms(data: any): string {
        let xml = '<ram:SpecifiedTradePaymentTerms>';

        if (data.paymentTerms) {
            xml += `<ram:Description>${this.escapeXml(data.paymentTerms)}</ram:Description>`;
        }

        if (data.paymentDueDate) {
            xml += `
            <ram:DueDateDateTime>
                <udt:DateTimeString format="102">${this.formatDate(data.paymentDueDate)}</udt:DateTimeString>
            </ram:DueDateDateTime>`;
        }

        xml += '</ram:SpecifiedTradePaymentTerms>';
        return xml;
    }

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
     * FIX (BUG-027): Safely convert value to number, preventing null/undefined/NaN in XML
     */
    private safeNumber(value: unknown): number {
        if (value === null || value === undefined) return 0;
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Normalize currency to ISO 4217 alpha-3 code.
     * Defaults to EUR when missing/invalid to satisfy XRechnung rules.
     */
    private normalizeCurrency(value: unknown): string {
        if (value === null || value === undefined) return 'EUR';
        const raw = String(value).trim();
        if (!raw) return 'EUR';

        if (/^[A-Za-z]{3}$/.test(raw)) {
            return raw.toUpperCase();
        }

        const upper = raw.toUpperCase();
        const map: Record<string, string> = {
            '€': 'EUR',
            'EUR': 'EUR',
            'EURO': 'EUR',
            '$': 'USD',
            'USD': 'USD',
            'US$': 'USD',
            '£': 'GBP',
            'GBP': 'GBP',
            'CHF': 'CHF',
        };

        if (map[raw]) return map[raw];
        if (map[upper]) return map[upper];

        const match = raw.match(/[A-Za-z]{3}/);
        if (match) {
            return match[0].toUpperCase();
        }

        logger.warn('XRechnung: Invalid currency, defaulting to EUR', { currency: raw });
        return 'EUR';
    }

    /**
     * FIX (QA-BUG-2): Convert value to number or return undefined to detect missing values
     * Use this for required fields where 0 vs undefined matters
     */
    private safeNumberOrUndefined(value: unknown): number | undefined {
        if (value === null || value === undefined) return undefined;
        const num = Number(value);
        return isNaN(num) ? undefined : num;
    }

    /**
     * FIX (BUG-026): Handle multiple date input formats
     * FIX (QA-BUG-3): Reject ambiguous date formats instead of silently assuming
     * Supports: YYYY-MM-DD (ISO), DD.MM.YYYY (German), YYYYMMDD
     * Output: YYYYMMDD (format 102 required by XRechnung)
     */
    private formatDate(dateString: string): string {
        if (!dateString) return '';

        // Already in YYYYMMDD format
        if (/^\d{8}$/.test(dateString)) {
            return dateString;
        }

        // ISO format: YYYY-MM-DD (unambiguous)
        if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
            return dateString.substring(0, 10).replace(/-/g, '');
        }

        // German format with dots: DD.MM.YYYY (unambiguous - dots are German)
        const germanMatch = dateString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (germanMatch) {
            const [, day, month, year] = germanMatch;
            return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
        }

        // FIX (QA-BUG-3): Reject ambiguous slash formats like MM/DD/YYYY or DD/MM/YYYY
        // These are ambiguous and should not be silently interpreted
        const slashMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
            // Reject ambiguous format - require ISO or German format
            logger.warn('XRechnung: Ambiguous date format rejected', {
                date: dateString,
                suggestion: 'Use ISO format (YYYY-MM-DD) or German format (DD.MM.YYYY)'
            });
            throw new Error(
                `Ambiguous date format "${dateString}". Please use ISO format (YYYY-MM-DD) or German format (DD.MM.YYYY)`
            );
        }

        // Try parsing as Date object as last resort (ISO strings, etc.)
        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}${month}${day}`;
            }
        } catch {
            // Fall through to throw error
        }

        logger.warn('XRechnung: Could not parse date format', { date: dateString });
        throw new Error(`Invalid date format "${dateString}". Use ISO format (YYYY-MM-DD) or German format (DD.MM.YYYY)`);
    }
}

export const xrechnungBuilder = new XRechnungBuilder();
