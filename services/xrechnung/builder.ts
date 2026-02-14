import { DEFAULT_VAT_RATE, REDUCED_VAT_RATE } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { roundMoney, sumMoney, computeTax } from '@/lib/monetary';
import { isEuVatId } from '@/lib/extraction-normalizer';
import { XRechnungInvoiceData, XRechnungLineItem } from './types';
import type { AllowanceCharge } from '@/types';

export class XRechnungBuilder {
  private readonly xmlns = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
  private readonly xsi = 'http://www.w3.org/2001/XMLSchema-instance';
  // BR-DE-21: Specification identifier MUST match XRechnung standard syntax exactly
  private readonly xrechnungVersion =
    'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

  buildXml(data: XRechnungInvoiceData): string {
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

  private buildExchangedDocument(data: XRechnungInvoiceData): string {
    const typeCode = data.documentTypeCode || 380;
    const notesXml = data.notes
      ? `\n        <ram:IncludedNote>\n            <ram:Content>${this.escapeXml(data.notes)}</ram:Content>\n        </ram:IncludedNote>`
      : '';

    return `
    <rsm:ExchangedDocument>
        <ram:ID>${this.escapeXml(data.invoiceNumber)}</ram:ID>
        <ram:TypeCode>${typeCode}</ram:TypeCode>
        <ram:IssueDateTime>
            <udt:DateTimeString format="102">${this.formatDate(data.invoiceDate)}</udt:DateTimeString>
        </ram:IssueDateTime>${notesXml}
    </rsm:ExchangedDocument>`;
  }

  private buildSupplyChainTradeTransaction(data: XRechnungInvoiceData): string {
    // FIX: Detect gross-priced invoices and convert all amounts to net.
    // XRechnung/EN16931 requires net (VAT-exclusive) amounts throughout.
    const processedData = this.preprocessForNetPricing(data);
    const items = processedData.lineItems || [];

    return `
    <rsm:SupplyChainTradeTransaction>
        ${this.buildLineItems(items)}
        ${this.buildTradeAgreement(processedData)}
        ${this.buildTradeDelivery(processedData)}
        ${this.buildTradeSettlement(processedData)}
    </rsm:SupplyChainTradeTransaction>`;
  }

  /**
   * FIX-GROSS: Detect gross-priced (VAT-inclusive) invoices and convert all amounts to net.
   *
   * German invoices often show Bruttopreise (gross/VAT-inclusive prices). For example:
   *   Line items sum: 3,159.25 (gross)  →  Discounts: -319.25  →  Netto: 2,386.55  →  19% USt: 453.45  →  Brutto: 2,840.00
   *
   * XRechnung requires all amounts to be NET (VAT-exclusive). When gross pricing is detected:
   * 1. Convert each line item's unitPrice and totalPrice to net (÷ 1.19)
   * 2. Convert each allowance/charge amount to net (÷ 1.19)
   * 3. Keep data.subtotal/taxAmount/totalAmount as-is (they're already correct NET values from AI extraction)
   *
   * This ensures BR-CO-13 is satisfied: TaxBasisTotalAmount = LineTotalAmount - AllowanceTotalAmount
   */
  private preprocessForNetPricing(data: XRechnungInvoiceData): XRechnungInvoiceData {
    const items = data.lineItems || [];
    const allowanceCharges = data.allowanceCharges ?? [];

    // Only relevant when there are allowances/charges
    const grossAllowances = sumMoney(
      allowanceCharges.filter((ac) => !ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const grossCharges = sumMoney(
      allowanceCharges.filter((ac) => ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const hasAllowancesOrCharges = grossAllowances > 0 || grossCharges > 0;
    if (!hasAllowancesOrCharges) return data;

    // Compute gross line total
    const grossLineTotal = sumMoney(
      items.map((item) => {
        const tp = this.safeNumberOrUndefined(item.totalPrice ?? item.lineTotal);
        const up = this.safeNumber(item.unitPrice);
        const qty = this.safeNumber(item.quantity) || 1;
        return tp ?? up * qty;
      })
    );

    const grossAfterAdjustments = roundMoney(grossLineTotal - grossAllowances + grossCharges);
    const providedSubtotal = this.safeNumber(data.subtotal);

    // If computed tax basis already matches provided subtotal, it's net pricing — no conversion needed
    if (Math.abs(grossAfterAdjustments - providedSubtotal) <= 0.05) return data;

    // Try common VAT rates to detect gross pricing
    const commonRates = [0.19, 0.07, 0.20, 0.21, 0.10, 0.05];
    let detectedRate: number | null = null;
    for (const rate of commonRates) {
      if (Math.abs(roundMoney(grossAfterAdjustments / (1 + rate)) - providedSubtotal) < 0.05) {
        detectedRate = rate;
        break;
      }
    }

    if (detectedRate === null) return data; // Can't detect gross pricing — use as-is

    logger.info('XRechnung: Gross-priced invoice detected, converting amounts to net', {
      detectedRate: `${(detectedRate * 100).toFixed(0)}%`,
      grossLineTotal,
      grossAllowances,
      providedSubtotal,
    });

    // Convert each line item to net amounts
    const netItems = items.map((item) => {
      const taxRate =
        this.safeNumberOrUndefined(item.taxRate ?? item.vatRate) ?? detectedRate! * 100;
      const divisor = 1 + taxRate / 100;
      const grossTotal =
        this.safeNumberOrUndefined(item.totalPrice ?? item.lineTotal) ??
        this.safeNumber(item.unitPrice) * (this.safeNumber(item.quantity) || 1);
      const grossUnit = this.safeNumber(item.unitPrice);

      return {
        ...item,
        unitPrice: roundMoney(grossUnit / divisor),
        totalPrice: roundMoney(grossTotal / divisor),
      };
    });

    // Convert allowance/charge amounts to net
    const netAllowanceCharges = allowanceCharges.map((ac) => {
      const taxRate = ac.taxRate != null ? Number(ac.taxRate) : detectedRate! * 100;
      const divisor = 1 + taxRate / 100;
      return {
        ...ac,
        amount: roundMoney((Number(ac.amount) || 0) / divisor),
      };
    });

    // Adjust for rounding: ensure sum(netLines) - sum(netAllowances) = data.subtotal exactly
    const netLineTotal = sumMoney(netItems.map((it) => this.safeNumber(it.totalPrice)));
    const netAllowanceTotal = sumMoney(
      netAllowanceCharges.filter((ac) => !ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const netChargeTotal = sumMoney(
      netAllowanceCharges.filter((ac) => ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const netTaxBasis = roundMoney(netLineTotal - netAllowanceTotal + netChargeTotal);
    const roundingDiff = roundMoney(providedSubtotal - netTaxBasis);

    if (Math.abs(roundingDiff) > 0 && Math.abs(roundingDiff) <= 0.05 && netItems.length > 0) {
      // Adjust the largest line item to absorb rounding difference
      const largestIdx = netItems.reduce(
        (maxIdx, item, idx) =>
          this.safeNumber(item.totalPrice) > this.safeNumber(netItems[maxIdx]!.totalPrice)
            ? idx
            : maxIdx,
        0
      );
      netItems[largestIdx]!.totalPrice = roundMoney(
        this.safeNumber(netItems[largestIdx]!.totalPrice) + roundingDiff
      );
    }

    return {
      ...data,
      lineItems: netItems,
      allowanceCharges: netAllowanceCharges,
    };
  }

  /**
   * FIX (BUG-025/027): Use actual tax rate per line item, ensure no null values
   * FIX (QA-BUG-2): Validate required fields, use configurable VAT rate
   */
  private buildLineItems(items: XRechnungLineItem[]): string {
    return items
      .map((item, index) => {
        // FIX (QA-BUG-2): Use safeNumberOrUndefined to detect missing values
        const unitPriceRaw = this.safeNumberOrUndefined(item.unitPrice);
        const quantityRaw = this.safeNumberOrUndefined(item.quantity);

        // Validate required fields - unit price is critical
        if (unitPriceRaw === undefined) {
          logger.warn('XRechnung: Line item missing unit price, using 0', {
            lineIndex: index,
          });
        }

        const unitPrice = unitPriceRaw ?? 0;
        const quantity = quantityRaw ?? 1; // Default to 1 if not specified
        const totalPriceRaw = this.safeNumberOrUndefined(item.totalPrice ?? item.lineTotal);
        const totalPrice = totalPriceRaw ?? unitPrice * quantity;
        // FIX (QA-BUG-4): Use configurable DEFAULT_VAT_RATE instead of hardcoded 19
        const taxRateRaw = this.safeNumberOrUndefined(item.taxRate ?? item.vatRate);
        const taxRate = taxRateRaw ?? DEFAULT_VAT_RATE;
        const vatCategoryCode = item.taxCategoryCode || this.getVatCategoryCode(taxRate);

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
                    <ram:CategoryCode>${vatCategoryCode}</ram:CategoryCode>
                    <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
                </ram:ApplicableTradeTax>
                <ram:SpecifiedTradeSettlementLineMonetarySummation>
                    <ram:LineTotalAmount>${totalPrice.toFixed(2)}</ram:LineTotalAmount>
                </ram:SpecifiedTradeSettlementLineMonetarySummation>
            </ram:SpecifiedLineTradeSettlement>
        </ram:IncludedSupplyChainTradeLineItem>`;
      })
      .join('');
  }

  private buildTradeAgreement(data: XRechnungInvoiceData): string {
    // BR-DE-15: BuyerReference (BT-10) is MANDATORY - use invoice number as fallback
    const buyerRef = data.buyerReference || data.invoiceNumber || 'LEITWEG-ID';

    // BG-3: Build preceding invoice reference for credit notes (TypeCode 381)
    const billingRefXml = data.precedingInvoiceReference?.trim()
      ? `\n        <ram:InvoiceReferencedDocument>\n            <ram:IssuerAssignedID>${this.escapeXml(data.precedingInvoiceReference.trim())}</ram:IssuerAssignedID>\n        </ram:InvoiceReferencedDocument>`
      : '';

    return `
    <ram:ApplicableHeaderTradeAgreement>
        <ram:BuyerReference>${this.escapeXml(buyerRef)}</ram:BuyerReference>
        ${this.buildSellerTradeParty(data)}
        ${this.buildBuyerTradeParty(data)}${billingRefXml}
    </ram:ApplicableHeaderTradeAgreement>`;
  }

  /**
   * OFFICIAL ORDER for PostalTradeAddress:
   * 1. PostcodeCode
   * 2. LineOne
   * 3. CityName
   * 4. CountryID
   */
  private buildPostalAddress(
    postalCode: string,
    lineOne: string,
    city: string,
    countryCode: string
  ): string {
    return `
            <ram:PostalTradeAddress>
                <ram:PostcodeCode>${this.escapeXml(postalCode)}</ram:PostcodeCode>
                <ram:LineOne>${this.escapeXml(lineOne)}</ram:LineOne>
                <ram:CityName>${this.escapeXml(city)}</ram:CityName>
                <ram:CountryID>${countryCode}</ram:CountryID>
            </ram:PostalTradeAddress>`;
  }

  /**
   * T5: Detect electronic address scheme from the address value.
   * - Email (contains @) → 'EM'
   * - PEPPOL prefix (e.g. '0204:xxx') → extract prefix as scheme
   * - Otherwise → 'EM' (safe default for XRechnung)
   */
  private detectScheme(address: string): string {
    if (!address) return 'EM';
    if (address.includes('@')) return 'EM';
    // PEPPOL-style prefix: 4-digit scheme code followed by colon
    const peppolMatch = address.match(/^(\d{4}):/);
    if (peppolMatch?.[1]) return peppolMatch[1];
    return 'EM';
  }

  /**
   * Build URIUniversalCommunication (BT-34 / BT-49) — electronic address with scheme.
   * Golden Rule: NO EMPTY TAGS
   */
  private buildURICommunication(address: string, scheme = 'EM'): string {
    if (!address || address.trim() === '') {
      return ''; // GOLDEN RULE: No empty tags!
    }
    return `
            <ram:URIUniversalCommunication>
                <ram:URIID schemeID="${this.escapeXml(scheme)}">${this.escapeXml(address)}</ram:URIID>
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
  private buildSellerContact(data: XRechnungInvoiceData): string {
    const contactName = data.sellerContactName || data.sellerContact || data.sellerName;
    const phone = data.sellerPhoneNumber || data.sellerPhone;
    const email = data.sellerEmail;

    // Log warnings for missing required contact fields (but don't fail - validation handles this)
    if (!contactName) {
      logger.warn('XRechnung: Missing seller contact name', { seller: data.sellerName });
    }
    if (!phone) {
      logger.warn('XRechnung: Missing seller phone number (BR-DE-2 requires this)', {
        seller: data.sellerName,
      });
    }
    if (!email) {
      logger.warn('XRechnung: Missing seller email (BR-DE-2 requires this)', {
        seller: data.sellerName,
      });
    }

    return `
            <ram:DefinedTradeContact>
                <ram:PersonName>${this.escapeXml(contactName || '')}</ram:PersonName>
                ${
                  phone
                    ? `<ram:TelephoneUniversalCommunication>
                    <ram:CompleteNumber>${this.escapeXml(phone)}</ram:CompleteNumber>
                </ram:TelephoneUniversalCommunication>`
                    : ''
                }
                ${
                  email
                    ? `<ram:EmailURIUniversalCommunication>
                    <ram:URIID>${this.escapeXml(email)}</ram:URIID>
                </ram:EmailURIUniversalCommunication>`
                    : ''
                }
            </ram:DefinedTradeContact>`;
  }

  private buildSellerTradeParty(data: XRechnungInvoiceData): string {
    const sellerEAddr = data.sellerElectronicAddress || data.sellerEmail || '';
    const sellerScheme = data.sellerElectronicAddressScheme || this.detectScheme(sellerEAddr);
    return `
        <ram:SellerTradeParty>
            <ram:Name>${this.escapeXml(data.sellerName)}</ram:Name>
            ${this.buildSellerLegalOrganization(data)}
            ${this.buildSellerContact(data)}
            ${this.buildPostalAddress(
              data.sellerPostalCode || '',
              data.sellerAddress || '',
              data.sellerCity || '',
              data.sellerCountryCode || 'DE'
            )}
            ${this.buildURICommunication(sellerEAddr, sellerScheme)}
            ${this.buildSellerTaxRegistrations(data)}
        </ram:SellerTradeParty>`;
  }

  /**
   * BR-CO-26: At least one of BT-29 (Seller identifier), BT-30 (Seller legal registration),
   * or BT-31 (Seller VAT identifier) MUST be present.
   * When no EU VAT ID (BT-31) is available, output BT-30 using the tax number or company name
   * as the legal registration identifier to satisfy this rule.
   */
  private buildSellerLegalOrganization(data: XRechnungInvoiceData): string {
    const vatId = data.sellerVatId;
    // If we have a VAT ID (BT-31), BR-CO-26 is satisfied without BT-30
    if (vatId) return '';

    // Use tax number or tax ID as legal registration identifier (BT-30)
    const legalId = data.sellerTaxNumber || data.sellerTaxId || '';
    if (legalId) {
      return `<ram:SpecifiedLegalOrganization>
                <ram:ID schemeID="0204">${this.escapeXml(legalId)}</ram:ID>
            </ram:SpecifiedLegalOrganization>`;
    }

    // Last resort: use seller name as trading name in legal org to emit the element
    if (!data.sellerName?.trim()) {
      // No identifier available at all — cannot satisfy BR-CO-26
      return '';
    }
    return `<ram:SpecifiedLegalOrganization>
                <ram:TradingBusinessName>${this.escapeXml(data.sellerName)}</ram:TradingBusinessName>
            </ram:SpecifiedLegalOrganization>`;
  }

  /**
   * P0-1: Build seller tax registrations with proper schemeID separation.
   * VA = EU VAT ID (BT-31), FC = local tax number (BT-32).
   */
  private buildSellerTaxRegistrations(data: XRechnungInvoiceData): string {
    const parts: string[] = [];
    const vatId = data.sellerVatId;
    const taxNumber = data.sellerTaxNumber;
    const taxId = data.sellerTaxId;

    if (vatId) {
      parts.push(`<ram:SpecifiedTaxRegistration>
                <ram:ID schemeID="VA">${this.escapeXml(vatId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`);
    }
    if (taxNumber) {
      parts.push(`<ram:SpecifiedTaxRegistration>
                <ram:ID schemeID="FC">${this.escapeXml(taxNumber)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`);
    }

    // Fallback: if neither vatId nor taxNumber is set, use legacy sellerTaxId with scheme detection
    if (parts.length === 0 && taxId) {
      const scheme = isEuVatId(taxId) ? 'VA' : 'FC';
      parts.push(`<ram:SpecifiedTaxRegistration>
                <ram:ID schemeID="${scheme}">${this.escapeXml(taxId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`);
    }

    return parts.join('\n            ');
  }

  /**
   * P0-2: Map buyer VAT ID (BT-48) to XML.
   * P0-5: Map buyer electronic address (BT-49) to XML.
   */
  private buildBuyerTradeParty(data: XRechnungInvoiceData): string {
    const buyerEAddr = data.buyerElectronicAddress || data.buyerEmail || '';
    const buyerScheme = data.buyerElectronicAddressScheme || this.detectScheme(buyerEAddr);

    // P0-2: Buyer VAT ID (BT-48) — map to SpecifiedTaxRegistration
    const buyerVatId =
      data.buyerVatId || (data.buyerTaxId && isEuVatId(data.buyerTaxId) ? data.buyerTaxId : null);
    const buyerTaxRegXml = buyerVatId
      ? `\n            <ram:SpecifiedTaxRegistration>\n                <ram:ID schemeID="VA">${this.escapeXml(buyerVatId)}</ram:ID>\n            </ram:SpecifiedTaxRegistration>`
      : '';

    return `
        <ram:BuyerTradeParty>
            <ram:Name>${this.escapeXml(data.buyerName || '')}</ram:Name>
            ${this.buildPostalAddress(
              data.buyerPostalCode || '',
              data.buyerAddress || '',
              data.buyerCity || '',
              data.buyerCountryCode || 'DE'
            )}
            ${this.buildURICommunication(buyerEAddr, buyerScheme)}${buyerTaxRegXml}
        </ram:BuyerTradeParty>`;
  }

  private buildTradeDelivery(data: XRechnungInvoiceData): string {
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
   * BG-14: Invoice period (BT-73 start, BT-74 end).
   * Output BillingSpecifiedPeriod inside ApplicableHeaderTradeSettlement.
   */
  private buildBillingPeriod(data: XRechnungInvoiceData): string {
    const start = data.billingPeriodStart?.trim();
    const end = data.billingPeriodEnd?.trim();
    if (!start && !end) return '';

    let xml = '\n            <ram:BillingSpecifiedPeriod>';
    if (start) {
      xml += `\n                <ram:StartDateTime>\n                    <udt:DateTimeString format="102">${this.formatDate(start)}</udt:DateTimeString>\n                </ram:StartDateTime>`;
    }
    if (end) {
      xml += `\n                <ram:EndDateTime>\n                    <udt:DateTimeString format="102">${this.formatDate(end)}</udt:DateTimeString>\n                </ram:EndDateTime>`;
    }
    xml += '\n            </ram:BillingSpecifiedPeriod>';
    return xml;
  }

  /**
   * BR-DE-23-a: When payment type is 30 (bank transfer), CREDIT TRANSFER (BG-17) is MANDATORY
   * Must include PayeePartyCreditorFinancialAccount with IBAN
   *
   * CRITICAL DATA INTEGRITY FIX (BUG-011): Removed hardcoded example IBAN 'DE89370400440532013000'
   * This was a real German tutorial IBAN that could cause payments to go to wrong account!
   * IBAN is now required - if missing, payment means section is omitted with warning
   */
  private buildPaymentMeans(data: XRechnungInvoiceData): string {
    const iban = data.sellerIban;
    const bic = data.sellerBic || '';

    if (!iban) {
      logger.warn('XRechnung: Missing seller IBAN (BR-DE-23-a requires this for bank transfers)', {
        seller: data.sellerName,
      });
      // BR-DE-13/19: TypeCode 1 is NOT in the XRechnung allowed set.
      // Use TypeCode 30 (credit transfer) as the safest fallback.
      // Allowed codes: 10, 30, 48, 49, 57, 58, 59, 97
      return `
            <ram:SpecifiedTradeSettlementPaymentMeans>
                <ram:TypeCode>30</ram:TypeCode>
            </ram:SpecifiedTradeSettlementPaymentMeans>`;
    }

    return `
            <ram:SpecifiedTradeSettlementPaymentMeans>
                <ram:TypeCode>58</ram:TypeCode>
                <ram:PayeePartyCreditorFinancialAccount>
                    <ram:IBANID>${this.escapeXml(iban)}</ram:IBANID>
                </ram:PayeePartyCreditorFinancialAccount>
                ${
                  bic
                    ? `
                <ram:PayeeSpecifiedCreditorFinancialInstitution>
                    <ram:BICID>${this.escapeXml(bic)}</ram:BICID>
                </ram:PayeeSpecifiedCreditorFinancialInstitution>`
                    : ''
                }
            </ram:SpecifiedTradeSettlementPaymentMeans>`;
  }

  /**
   * OFFICIAL ORDER for ApplicableHeaderTradeSettlement:
   * 1. InvoiceCurrencyCode
   * 2. SpecifiedTradeSettlementPaymentMeans
   * 3. ApplicableTradeTax (one per VAT rate group)
   * 4. SpecifiedTradePaymentTerms
   * 5. SpecifiedTradeSettlementHeaderMonetarySummation
   *
   * FIX: Support multiple VAT rate groups (e.g. 19% + 0% on same invoice)
   * Each rate group gets its own ApplicableTradeTax block with correct
   * BasisAmount (sum of line totals at that rate) and CalculatedAmount (tax).
   */
  /**
   * Build document-level AllowanceCharge XML elements (BG-20 / BG-21).
   * Placed inside ApplicableHeaderTradeSettlement, before ApplicableTradeTax.
   */
  private buildAllowanceChargeXml(allowanceCharges: AllowanceCharge[]): string {
    if (!allowanceCharges || allowanceCharges.length === 0) return '';

    return allowanceCharges
      .map((ac) => {
        const indicator = ac.chargeIndicator ? 'true' : 'false';
        const amount = (Number(ac.amount) || 0).toFixed(2);
        const taxRate = ac.taxRate != null ? Number(ac.taxRate) : DEFAULT_VAT_RATE;
        const categoryCode = ac.taxCategoryCode || this.getVatCategoryCode(taxRate);

        // FIX PEPPOL-EN16931-R041: BasisAmount MUST be provided when CalculationPercent is present
        const percentage = ac.percentage != null ? Number(ac.percentage) : null;
        let baseAmount = ac.baseAmount != null ? Number(ac.baseAmount) : null;
        if (percentage != null && percentage > 0 && baseAmount == null) {
          // Derive base amount from actual amount and percentage
          baseAmount = roundMoney((Number(ac.amount) || 0) * 100 / percentage);
        }
        const baseAmountXml =
          baseAmount != null
            ? `\n                <ram:BasisAmount>${baseAmount.toFixed(2)}</ram:BasisAmount>`
            : '';
        const percentageXml =
          percentage != null
            ? `\n                <ram:CalculationPercent>${percentage.toFixed(2)}</ram:CalculationPercent>`
            : '';
        const reasonXml = ac.reason
          ? `\n                <ram:Reason>${this.escapeXml(ac.reason)}</ram:Reason>`
          : '';
        const reasonCodeXml = ac.reasonCode
          ? `\n                <ram:ReasonCode>${this.escapeXml(ac.reasonCode)}</ram:ReasonCode>`
          : '';

        return `
            <ram:SpecifiedTradeAllowanceCharge>
                <ram:ChargeIndicator><udt:Indicator>${indicator}</udt:Indicator></ram:ChargeIndicator>${percentageXml}${baseAmountXml}
                <ram:ActualAmount>${amount}</ram:ActualAmount>${reasonCodeXml}${reasonXml}
                <ram:CategoryTradeTax>
                    <ram:TypeCode>VAT</ram:TypeCode>
                    <ram:CategoryCode>${categoryCode}</ram:CategoryCode>
                    <ram:RateApplicablePercent>${taxRate.toFixed(2)}</ram:RateApplicablePercent>
                </ram:CategoryTradeTax>
            </ram:SpecifiedTradeAllowanceCharge>`;
      })
      .join('');
  }

  private buildTradeSettlement(data: XRechnungInvoiceData): string {
    const currency = this.normalizeCurrency(data.currency);
    const items = data.lineItems || [];
    const allowanceCharges = data.allowanceCharges ?? [];

    // Calculate line total (sum of line items BEFORE allowances/charges)
    const lineTotal = sumMoney(
      items.map((item) => {
        const tp = this.safeNumberOrUndefined(item.totalPrice ?? item.lineTotal);
        const up = this.safeNumber(item.unitPrice);
        const qty = this.safeNumber(item.quantity) || 1;
        return tp ?? up * qty;
      })
    );

    // Calculate allowances/charges totals
    const totalAllowances = sumMoney(
      allowanceCharges.filter((ac) => !ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const totalCharges = sumMoney(
      allowanceCharges.filter((ac) => ac.chargeIndicator).map((ac) => Number(ac.amount) || 0)
    );
    const hasAllowancesOrCharges = totalAllowances > 0 || totalCharges > 0;

    // Tax basis = line total - allowances + charges (BR-CO-13 for net pricing)
    const computedTaxBasis = roundMoney(lineTotal - totalAllowances + totalCharges);

    // Detect gross pricing: if the provided subtotal doesn't match computed tax basis
    // and subtotal ≈ computedTaxBasis / (1 + rate), then line items are gross-priced.
    // In that case, use the provided subtotal/taxAmount/totalAmount as authoritative.
    let isGrossPriced = false;
    const providedSubtotal = this.safeNumber(data.subtotal);
    if (hasAllowancesOrCharges && Math.abs(computedTaxBasis - providedSubtotal) > 0.05) {
      const commonRates = [0.19, 0.07, 0.20, 0.21, 0.10, 0.05];
      for (const rate of commonRates) {
        const netFromGross = roundMoney(computedTaxBasis / (1 + rate));
        if (Math.abs(netFromGross - providedSubtotal) < 0.05) {
          isGrossPriced = true;
          break;
        }
      }
    }

    // For gross-priced invoices: use the invoice's own subtotal/tax/total
    // For net-priced invoices: compute from line items + tax groups
    const taxBasis = isGrossPriced ? providedSubtotal : computedTaxBasis;

    // Build tax breakdowns
    const taxBreakdownXml: string[] = [];

    if (isGrossPriced) {
      // Gross pricing: use provided values, compute tax rate from subtotal/taxAmount
      const providedTaxAmount = this.safeNumber(data.taxAmount);
      const inferredRate = providedSubtotal > 0
        ? roundMoney((providedTaxAmount / providedSubtotal) * 100)
        : DEFAULT_VAT_RATE;
      const categoryCode = this.getVatCategoryCode(inferredRate);
      const exemptionXml = this.buildExemptionReason(categoryCode);

      taxBreakdownXml.push(`
            <ram:ApplicableTradeTax>
                <ram:CalculatedAmount>${providedTaxAmount.toFixed(2)}</ram:CalculatedAmount>
                <ram:TypeCode>VAT</ram:TypeCode>${exemptionXml}
                <ram:BasisAmount>${providedSubtotal.toFixed(2)}</ram:BasisAmount>
                <ram:CategoryCode>${categoryCode}</ram:CategoryCode>
                <ram:RateApplicablePercent>${inferredRate.toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>`);
    } else {
      // Net pricing: compute tax groups from line items + allowances
      const taxGroups = this.buildTaxGroups(items, allowanceCharges);

      for (const group of taxGroups) {
        const taxForGroup = computeTax(group.basisAmount, group.rate);
        const exemptionXml = this.buildExemptionReason(group.categoryCode);

        taxBreakdownXml.push(`
            <ram:ApplicableTradeTax>
                <ram:CalculatedAmount>${taxForGroup.toFixed(2)}</ram:CalculatedAmount>
                <ram:TypeCode>VAT</ram:TypeCode>${exemptionXml}
                <ram:BasisAmount>${group.basisAmount.toFixed(2)}</ram:BasisAmount>
                <ram:CategoryCode>${group.categoryCode}</ram:CategoryCode>
                <ram:RateApplicablePercent>${group.rate.toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>`);
      }
    }

    // Determine final tax and total amounts
    let taxAmount: number;
    let total: number;

    if (isGrossPriced) {
      taxAmount = this.safeNumber(data.taxAmount);
      total = this.safeNumber(data.totalAmount);
    } else {
      // Compute from tax breakdowns
      const taxGroups = this.buildTaxGroups(items, allowanceCharges);
      let computedTaxAmount = 0;
      for (const group of taxGroups) {
        computedTaxAmount = roundMoney(computedTaxAmount + computeTax(group.basisAmount, group.rate));
      }
      taxAmount = taxBreakdownXml.length > 0 ? computedTaxAmount : this.safeNumber(data.taxAmount);
      // NOTE: Do NOT override taxAmount with data.taxAmount here — the CalculatedAmount
      // in each ApplicableTradeTax block was computed from basisAmount × rate.
      // BR-CO-14 requires TaxTotalAmount = Σ CalculatedAmount, so they must stay in sync.
      total = roundMoney(taxBasis + taxAmount);
    }

    // If no groups were built (no line items), create a single fallback group
    if (taxBreakdownXml.length === 0) {
      const fallbackRate =
        this.safeNumberOrUndefined(data.taxRate ?? data.vatRate) ??
        this.calculateTaxRate(taxBasis, taxAmount);
      const fallbackCategory = this.getVatCategoryCode(fallbackRate);
      taxBreakdownXml.push(`
            <ram:ApplicableTradeTax>
                <ram:CalculatedAmount>${taxAmount.toFixed(2)}</ram:CalculatedAmount>
                <ram:TypeCode>VAT</ram:TypeCode>${
                  fallbackCategory === 'E'
                    ? `
                <ram:ExemptionReason>Exempt from VAT</ram:ExemptionReason>`
                    : ''
                }
                <ram:BasisAmount>${taxBasis.toFixed(2)}</ram:BasisAmount>
                <ram:CategoryCode>${fallbackCategory}</ram:CategoryCode>
                <ram:RateApplicablePercent>${fallbackRate.toFixed(2)}</ram:RateApplicablePercent>
            </ram:ApplicableTradeTax>`);
    }

    // Build allowance/charge XML elements (BG-20 / BG-21)
    const allowanceChargeXml = this.buildAllowanceChargeXml(allowanceCharges);

    // Monetary summation XML
    const allowanceTotalXml = totalAllowances > 0
      ? `\n                <ram:AllowanceTotalAmount>${totalAllowances.toFixed(2)}</ram:AllowanceTotalAmount>`
      : '';
    const chargeTotalXml = totalCharges > 0
      ? `\n                <ram:ChargeTotalAmount>${totalCharges.toFixed(2)}</ram:ChargeTotalAmount>`
      : '';

    return `
        <ram:ApplicableHeaderTradeSettlement>
            <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
${this.buildBillingPeriod(data)}
            ${this.buildPaymentMeans(data)}
${allowanceChargeXml}
            ${taxBreakdownXml.join('')}
            ${this.buildPaymentTerms(data)}

            <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
                <ram:LineTotalAmount>${roundMoney(lineTotal).toFixed(2)}</ram:LineTotalAmount>${allowanceTotalXml}${chargeTotalXml}
                <ram:TaxBasisTotalAmount>${taxBasis.toFixed(2)}</ram:TaxBasisTotalAmount>
                <ram:TaxTotalAmount currencyID="${currency}">${taxAmount.toFixed(2)}</ram:TaxTotalAmount>
                <ram:GrandTotalAmount>${total.toFixed(2)}</ram:GrandTotalAmount>${data.prepaidAmount && Number(data.prepaidAmount) > 0 ? `\n                <ram:TotalPrepaidAmount>${roundMoney(Number(data.prepaidAmount)).toFixed(2)}</ram:TotalPrepaidAmount>` : ''}
                <ram:DuePayableAmount>${roundMoney(total - (Number(data.prepaidAmount) || 0)).toFixed(2)}</ram:DuePayableAmount>
            </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        </ram:ApplicableHeaderTradeSettlement>`;
  }

  /**
   * Group line items by tax rate + category code. Returns one entry per unique
   * rate/category with the sum of line totals as basisAmount.
   * Uses decimal-safe arithmetic (roundMoney) for summation.
   */
  private buildTaxGroups(
    items: XRechnungLineItem[],
    allowanceCharges?: AllowanceCharge[]
  ): { rate: number; categoryCode: string; basisAmount: number }[] {
    const groups = new Map<string, { rate: number; categoryCode: string; basisAmount: number }>();

    for (const item of items) {
      const taxRateRaw = this.safeNumberOrUndefined(item.taxRate ?? item.vatRate);
      const taxRate = taxRateRaw ?? DEFAULT_VAT_RATE;
      const categoryCode = item.taxCategoryCode || this.getVatCategoryCode(taxRate);
      const totalPriceRaw = this.safeNumberOrUndefined(item.totalPrice ?? item.lineTotal);
      const unitPrice = this.safeNumber(item.unitPrice);
      const quantity = this.safeNumber(item.quantity) || 1;
      const totalPrice = totalPriceRaw ?? unitPrice * quantity;

      const key = `${taxRate}:${categoryCode}`;
      const existing = groups.get(key);
      if (existing) {
        existing.basisAmount = roundMoney(existing.basisAmount + totalPrice);
      } else {
        groups.set(key, { rate: taxRate, categoryCode, basisAmount: roundMoney(totalPrice) });
      }
    }

    // Include document-level allowances/charges in their tax groups
    if (allowanceCharges && allowanceCharges.length > 0) {
      for (const ac of allowanceCharges) {
        const taxRate = ac.taxRate != null ? Number(ac.taxRate) : DEFAULT_VAT_RATE;
        const categoryCode = ac.taxCategoryCode || this.getVatCategoryCode(taxRate);
        const adjustment = ac.chargeIndicator ? (Number(ac.amount) || 0) : -(Number(ac.amount) || 0);

        const key = `${taxRate}:${categoryCode}`;
        const existing = groups.get(key);
        if (existing) {
          existing.basisAmount = roundMoney(existing.basisAmount + adjustment);
        } else {
          groups.set(key, { rate: taxRate, categoryCode, basisAmount: roundMoney(adjustment) });
        }
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.rate - a.rate);
  }

  /**
   * P0-7: Map tax rate to EN16931 VAT category code (UNCL5305).
   * S = Standard (rate > 0), E = Exempt (rate === 0).
   * Other codes (Z, AE, K, G) are set explicitly via taxCategoryCode on line items.
   */
  private getVatCategoryCode(taxRate: number): string {
    return taxRate > 0 ? 'S' : 'E';
  }

  /**
   * P0-7: Build exemption reason XML for non-standard tax categories.
   * Schematron requires ExemptionReason for E, AE, K, G, Z categories.
   */
  private buildExemptionReason(categoryCode: string): string {
    const reasons: Record<string, string> = {
      E: 'Exempt from VAT',
      Z: 'Zero rated goods',
      AE: 'Reverse charge - Loss of tax liability of the buyer applies',
      K: 'Intra-community supply',
      G: 'Export outside the EU',
      O: 'Not subject to VAT',
      L: 'Canary Islands general indirect tax',
    };
    const reason = reasons[categoryCode];
    if (!reason) return '';
    return `\n                <ram:ExemptionReason>${this.escapeXml(reason)}</ram:ExemptionReason>`;
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

  private buildPaymentTerms(data: XRechnungInvoiceData): string {
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
      .replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // FIX-020: Strip XML-invalid control chars
  }

  /**
   * FIX (BUG-027): Safely convert value to number, preventing null/undefined/NaN in XML
   */
  private safeNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
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
      EUR: 'EUR',
      EURO: 'EUR',
      $: 'USD',
      USD: 'USD',
      US$: 'USD',
      '£': 'GBP',
      GBP: 'GBP',
      CHF: 'CHF',
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
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
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
      const day = germanMatch[1] ?? '';
      const month = germanMatch[2] ?? '';
      const year = germanMatch[3] ?? '';
      if (day && month && year) {
        return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
      }
      logger.warn('XRechnung: Invalid German date format - missing components', { dateString });
      return new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }

    // FIX (QA-BUG-3): Reject ambiguous slash formats like MM/DD/YYYY or DD/MM/YYYY
    // These are ambiguous and should not be silently interpreted
    const slashMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      // Reject ambiguous format - require ISO or German format
      logger.warn('XRechnung: Ambiguous date format rejected', {
        date: dateString,
        suggestion: 'Use ISO format (YYYY-MM-DD) or German format (DD.MM.YYYY)',
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
    throw new Error(
      `Invalid date format "${dateString}". Use ISO format (YYYY-MM-DD) or German format (DD.MM.YYYY)`
    );
  }
}

export const xrechnungBuilder = new XRechnungBuilder();
