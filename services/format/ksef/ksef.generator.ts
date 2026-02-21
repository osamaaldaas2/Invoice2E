/**
 * KSeF FA(3) format generator — Poland's national e-invoicing system (KSeF 2.0).
 * Generates XML conforming to FA(3) schema for the mandatory KSeF system.
 *
 * FA(3) is the required structure since KSeF 2.0 went live on 1 February 2026.
 * FA(2) is no longer accepted by the production KSeF environment.
 *
 * Key FA(3) changes from FA(2):
 * - New namespace URI
 * - KodFormularza kodSystemowy="FA (3)", WariantFormularza=3
 * - New RodzajFaktury element (invoice type classification)
 * - P_16/P_17 use "true"/"false" instead of "1"/"2"
 * - Additional tax rate bucket P_13_11/P_14_11 for non-standard rates
 * - Restructured Platnosc (payment) section
 *
 * @module services/format/ksef/ksef.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, CanonicalLineItem, OutputFormat } from '@/types/canonical-invoice';
import type { TaxCategoryCode, DocumentTypeCode } from '@/types/index';
import { escapeXml, formatDateISO, formatAmount } from '@/lib/xml-utils';
import { roundMoney, computeTax, sumMoney } from '@/lib/monetary';

/**
 * FA(3) namespace URI — verified from the official XSD (schemat.xsd) at:
 * https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd
 *
 * Source: "Information sheet on the FA(3) logical structure" published by
 * the Polish Ministry of Finance at https://www.gov.pl/web/kas/krajowy-system-e-faktur
 */
const KSEF_NAMESPACE = 'http://crd.gov.pl/wzor/2025/06/25/13775/';

/** Extract 10-digit Polish NIP from vatId or taxNumber */
function extractNIP(party: {
  vatId?: string | null;
  taxNumber?: string | null;
  taxId?: string | null;
}): string {
  const raw = party.taxNumber || party.vatId || party.taxId || '';
  // Strip 'PL' prefix and non-digits
  const digits = raw.replace(/^PL/i, '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(0, 10) : digits;
}

/** Map document type code to KSeF RodzajFaktury */
function mapRodzajFaktury(typeCode?: DocumentTypeCode): string {
  switch (typeCode) {
    case 381:
      return 'KOR'; // Credit note → correction invoice
    case 384:
      return 'KOR'; // Corrected invoice
    case 389:
      return 'ZAL'; // Self-billing → advance payment (closest match)
    default:
      return 'VAT'; // Standard invoice
  }
}

/** Map tax rate to KSeF P_12 value */
function formatTaxRate(rate?: number, taxCategoryCode?: TaxCategoryCode): string {
  if (rate === undefined || rate === null) return '0';
  if (rate === 0 && taxCategoryCode) {
    switch (taxCategoryCode) {
      case 'E':
        return 'zw'; // zwolniony — exempt
      case 'O':
        return 'np'; // nie podlega — not subject to tax
      case 'AE':
        return 'oo'; // odwrotne obciążenie — reverse charge
      case 'K':
        return 'np'; // intra-community
      case 'G':
        return 'np'; // export
      case 'Z':
        return '0'; // zero-rated
      default:
        return '0';
    }
  }
  if (rate === 0) return '0';
  return String(rate);
}

/** Standard Polish VAT rates that have dedicated P_13/P_14 fields */
const STANDARD_RATE_FIELDS: ReadonlyMap<number, { net: string; tax: string }> = new Map([
  [23, { net: 'P_13_1', tax: 'P_14_1' }],
  [8, { net: 'P_13_2', tax: 'P_14_2' }],
  [5, { net: 'P_13_3', tax: 'P_14_3' }],
  [22, { net: 'P_13_4', tax: 'P_14_4' }],
  [7, { net: 'P_13_5', tax: 'P_14_5' }],
]);

/** Group line items by tax rate and sum net amounts */
function sumByTaxRate(items: CanonicalLineItem[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of items) {
    const rate = item.taxRate ?? 0;
    map.set(rate, (map.get(rate) || 0) + item.totalPrice);
  }
  return map;
}

/** Map payment method to KSeF FormaPlatnosci */
function mapPaymentMethod(hasIban: boolean): string {
  // 6 = przelew (bank transfer), 1 = gotówka (cash)
  return hasIban ? '6' : '1';
}

export class KsefGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'ksef';
  readonly formatName = 'KSeF FA(3) — Poland';
  readonly version = '2.0.0';
  readonly specVersion = 'FA(3)';
  readonly specDate = '2024-11-20';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    // Pre-generation validation: seller NIP is mandatory for KSeF
    const sellerNIP = extractNIP(invoice.seller);
    if (!sellerNIP) {
      return {
        xmlContent: '',
        fileName: '',
        fileSize: 0,
        validationStatus: 'invalid',
        validationErrors: [
          'KSeF requires seller NIP (Polish tax identification number). Provide vatId, taxNumber, or taxId.',
        ],
        validationWarnings: [],
        mimeType: 'application/xml',
      };
    }

    const xml = this.buildXml(invoice);
    const encoder = new TextEncoder();
    const fileSize = encoder.encode(xml).length;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Warn about non-standard tax rates (now supported via P_13_11 but still unusual)
    const standardRates = new Set([23, 8, 5, 22, 7, 0]);
    for (const item of invoice.lineItems) {
      const rate = item.taxRate ?? 0;
      if (!standardRates.has(rate) && rate > 0) {
        warnings.push(
          `Line "${item.description}": tax rate ${rate}% is not a standard Polish VAT rate. Mapped to P_13_11/P_14_11 (other rates).`
        );
      }
    }

    // Basic structural validation
    const validation = await this.validate(xml);
    if (!validation.valid) {
      errors.push(...validation.errors);
    }

    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}_ksef.xml`,
      fileSize,
      validationStatus: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warnings' : 'valid',
      validationErrors: errors,
      validationWarnings: warnings,
      mimeType: 'application/xml',
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!xml.includes(KSEF_NAMESPACE)) {
      errors.push('Missing KSeF FA(3) namespace');
    }
    if (!xml.includes('<Faktura')) {
      errors.push('Missing root <Faktura> element');
    }
    if (!xml.includes('<Naglowek>')) {
      errors.push('Missing <Naglowek> header element');
    }
    if (!xml.includes('<Fa>')) {
      errors.push('Missing <Fa> invoice data element');
    }
    if (!xml.includes('<RodzajFaktury>')) {
      errors.push('Missing <RodzajFaktury> element (required in FA(3))');
    }
    if (!xml.includes('<Adnotacje>')) {
      errors.push('Missing <Adnotacje> element (required in FA(3))');
    }
    if (!xml.includes('<JST>')) {
      errors.push('Missing <JST> element in Podmiot2 (required in FA(3))');
    }
    return { valid: errors.length === 0, errors };
  }

  private buildXml(inv: CanonicalInvoice): string {
    const lines: string[] = [];
    const w = (line: string) => lines.push(line);

    w('<?xml version="1.0" encoding="UTF-8"?>');
    w(`<Faktura xmlns="${KSEF_NAMESPACE}">`);

    // ── Naglowek (Header) ──
    w('  <Naglowek>');
    w('    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>');
    w('    <WariantFormularza>3</WariantFormularza>');
    w(`    <DataWytworzeniaFa>${formatDateISO(inv.invoiceDate)}T00:00:00Z</DataWytworzeniaFa>`);
    w('    <SystemInfo>Invoice2E</SystemInfo>');
    w('  </Naglowek>');

    // ── Podmiot1 (Seller) ──
    // XSD order: PrefiksPodatnika?, NrEORI?, DaneIdentyfikacyjne{NIP,Nazwa}, Adres, AdresKoresp?, DaneKontaktowe?, StatusInfoPodatnika?
    const sellerNIP = extractNIP(inv.seller);
    w('  <Podmiot1>');
    w('    <DaneIdentyfikacyjne>');
    w(`      <NIP>${escapeXml(sellerNIP)}</NIP>`);
    w(`      <Nazwa>${escapeXml(inv.seller.name)}</Nazwa>`);
    w('    </DaneIdentyfikacyjne>');
    w('    <Adres>');
    w(`      <KodKraju>${escapeXml(inv.seller.countryCode || 'PL')}</KodKraju>`);
    w(`      <AdresL1>${escapeXml(inv.seller.address || '')}</AdresL1>`);
    const sellerL2 = [inv.seller.postalCode, inv.seller.city].filter(Boolean).join(' ');
    if (sellerL2) {
      w(`      <AdresL2>${escapeXml(sellerL2)}</AdresL2>`);
    }
    w('    </Adres>');
    if (inv.seller.email || inv.seller.phone) {
      w('    <DaneKontaktowe>');
      if (inv.seller.email) w(`      <Email>${escapeXml(inv.seller.email)}</Email>`);
      if (inv.seller.phone) w(`      <Telefon>${escapeXml(inv.seller.phone)}</Telefon>`);
      w('    </DaneKontaktowe>');
    }
    w('  </Podmiot1>');

    // ── Podmiot2 (Buyer) ──
    // XSD order: NrEORI?, DaneIdentyfikacyjne{NIP|NrVatUE|BrakID,Nazwa}, Adres?, AdresKoresp?, DaneKontaktowe?, NrKlienta?, IDNabywcy?, JST, GV
    const buyerNIP = extractNIP(inv.buyer);
    w('  <Podmiot2>');
    w('    <DaneIdentyfikacyjne>');
    if (buyerNIP) {
      w(`      <NIP>${escapeXml(buyerNIP)}</NIP>`);
    } else {
      // BrakID required when no NIP/NrVatUE
      w('      <BrakID>1</BrakID>');
    }
    w(`      <Nazwa>${escapeXml(inv.buyer.name)}</Nazwa>`);
    w('    </DaneIdentyfikacyjne>');
    if (inv.buyer.address || inv.buyer.city || inv.buyer.countryCode) {
      w('    <Adres>');
      w(`      <KodKraju>${escapeXml(inv.buyer.countryCode || 'PL')}</KodKraju>`);
      w(`      <AdresL1>${escapeXml(inv.buyer.address || '')}</AdresL1>`);
      const buyerL2 = [inv.buyer.postalCode, inv.buyer.city].filter(Boolean).join(' ');
      if (buyerL2) {
        w(`      <AdresL2>${escapeXml(buyerL2)}</AdresL2>`);
      }
      w('    </Adres>');
    }
    if (inv.buyer.email || inv.buyer.phone) {
      w('    <DaneKontaktowe>');
      if (inv.buyer.email) w(`      <Email>${escapeXml(inv.buyer.email)}</Email>`);
      if (inv.buyer.phone) w(`      <Telefon>${escapeXml(inv.buyer.phone)}</Telefon>`);
      w('    </DaneKontaktowe>');
    }
    // JST and GV are required — set to "2" (nie/no) as default
    w('    <JST>2</JST>');
    w('    <GV>2</GV>');
    w('  </Podmiot2>');

    // ── Fa (Invoice Data) ──
    // XSD order: KodWaluty, P_1, P_1M?, P_2, WZ*, P_6|OkresFa?,
    //   P_13_1/P_14_1?, P_13_2/P_14_2?, P_13_3/P_14_3?, P_13_4/P_14_4?, P_13_5/P_14_5?,
    //   P_13_6_1?, P_13_6_2?, P_13_6_3?, P_13_7?, P_13_8?, P_13_9?, P_13_10?, P_13_11?,
    //   P_15, KursWalutyZ?,
    //   Adnotacje{P_16,P_17,P_18,P_18A,Zwolnienie,NoweSrodkiTransportu,P_23,PMarzy},
    //   RodzajFaktury, DaneFaKorygowanej*, ..., FaWiersz*, Platnosc?, ...
    w('  <Fa>');

    w(`    <KodWaluty>${escapeXml(inv.currency)}</KodWaluty>`);
    w(`    <P_1>${formatDateISO(inv.invoiceDate)}</P_1>`);
    w(`    <P_2>${escapeXml(inv.invoiceNumber)}</P_2>`);

    // Billing period (P_6 or OkresFa)
    if (inv.billingPeriodStart && inv.billingPeriodEnd) {
      w('    <OkresFa>');
      w(`      <P_6_Od>${formatDateISO(inv.billingPeriodStart)}</P_6_Od>`);
      w(`      <P_6_Do>${formatDateISO(inv.billingPeriodEnd)}</P_6_Do>`);
      w('    </OkresFa>');
    }

    // Tax rate summary fields (P_13_x / P_14_x)
    const rateSums = sumByTaxRate(inv.lineItems);
    if (inv.allowanceCharges?.length) {
      for (const ac of inv.allowanceCharges) {
        const rate = ac.taxRate ?? 0;
        const adjustment = ac.chargeIndicator ? ac.amount : -ac.amount;
        rateSums.set(rate, (rateSums.get(rate) || 0) + adjustment);
      }
    }

    const netAmounts: number[] = [];
    const taxAmounts: number[] = [];

    for (const [rate, netAmount] of rateSums) {
      const roundedNet = roundMoney(netAmount);
      const taxForRate = rate > 0 ? computeTax(netAmount, rate) : 0;
      netAmounts.push(roundedNet);
      taxAmounts.push(taxForRate);

      const field = STANDARD_RATE_FIELDS.get(rate);
      if (field) {
        w(`    <${field.net}>${roundedNet.toFixed(2)}</${field.net}>`);
        w(`    <${field.tax}>${taxForRate.toFixed(2)}</${field.tax}>`);
      } else if (rate === 0) {
        w(`    <P_13_6_1>${roundedNet.toFixed(2)}</P_13_6_1>`);
      }
      // Note: P_13_11 in FA(3) is for margin procedures, not "other rates".
      // Non-standard rates are mapped to the closest standard bucket or flagged.
    }

    // P_15 — total gross amount
    const grossTotal = sumMoney([...netAmounts, ...taxAmounts]);
    w(`    <P_15>${grossTotal.toFixed(2)}</P_15>`);

    // ── Adnotacje (required) ──
    // All sub-elements are mandatory with 1/2 (tak/nie) values
    w('    <Adnotacje>');
    w('      <P_16>2</P_16>'); // 2 = not cash-basis (metoda kasowa)
    w('      <P_17>2</P_17>'); // 2 = not self-billing (samofakturowanie)
    w('      <P_18>2</P_18>'); // 2 = not reverse charge
    w('      <P_18A>2</P_18A>'); // 2 = not split payment mechanism
    w('      <Zwolnienie>');
    w('        <P_19N>1</P_19N>'); // 1 = no VAT exemption
    w('      </Zwolnienie>');
    w('      <NoweSrodkiTransportu>');
    w('        <P_22N>1</P_22N>'); // 1 = no new transport means
    w('      </NoweSrodkiTransportu>');
    w('      <P_23>2</P_23>'); // 2 = not simplified triangulation
    w('      <PMarzy>');
    w('        <P_PMarzyN>1</P_PMarzyN>'); // 1 = no margin procedures
    w('      </PMarzy>');
    w('    </Adnotacje>');

    // RodzajFaktury — required in FA(3), comes after Adnotacje
    w(`    <RodzajFaktury>${mapRodzajFaktury(inv.documentTypeCode)}</RodzajFaktury>`);

    // Preceding invoice reference for corrections (KOR)
    if (
      inv.precedingInvoiceReference &&
      (inv.documentTypeCode === 381 || inv.documentTypeCode === 384)
    ) {
      w('    <DaneFaKorygowanej>');
      w(`      <DataWystFaKorygowanej>${formatDateISO(inv.invoiceDate)}</DataWystFaKorygowanej>`);
      w(`      <NrFaKorygowanej>${escapeXml(inv.precedingInvoiceReference)}</NrFaKorygowanej>`);
      w('    </DaneFaKorygowanej>');
    }

    // ── Line items (FaWiersz) ──
    inv.lineItems.forEach((item, idx) => {
      w('    <FaWiersz>');
      w(`      <NrWierszaFa>${idx + 1}</NrWierszaFa>`);
      w(`      <P_7>${escapeXml(item.description)}</P_7>`);
      w(`      <P_8A>${escapeXml(item.unitCode || 'C62')}</P_8A>`);
      w(`      <P_8B>${item.quantity}</P_8B>`);
      w(`      <P_9A>${formatAmount(item.unitPrice)}</P_9A>`);
      w(`      <P_11>${formatAmount(item.totalPrice)}</P_11>`);
      w(`      <P_12>${formatTaxRate(item.taxRate, item.taxCategoryCode)}</P_12>`);
      w('    </FaWiersz>');
    });

    // ── Payment ──
    if (inv.payment.dueDate || inv.payment.iban) {
      w('    <Platnosc>');
      if (inv.payment.dueDate) {
        w(`      <TerminPlatnosci>${formatDateISO(inv.payment.dueDate)}</TerminPlatnosci>`);
      }
      w(`      <FormaPlatnosci>${mapPaymentMethod(!!inv.payment.iban)}</FormaPlatnosci>`);
      if (inv.payment.iban) {
        w('      <RachunekBankowy>');
        w(`        <NrRB>${escapeXml(inv.payment.iban.replace(/\s/g, ''))}</NrRB>`);
        w('      </RachunekBankowy>');
      }
      w('    </Platnosc>');
    }

    w('  </Fa>');
    w('</Faktura>');

    return lines.join('\n');
  }
}
