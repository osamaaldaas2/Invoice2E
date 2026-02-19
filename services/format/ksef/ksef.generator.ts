/**
 * KSeF FA(2) format generator — Poland's national e-invoicing system.
 * Generates XML conforming to FA(2) schema: http://crd.gov.pl/wzor/2023/06/29/12648/
 *
 * @module services/format/ksef/ksef.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, CanonicalLineItem, OutputFormat } from '@/types/canonical-invoice';
import type { TaxCategoryCode } from '@/types/index';
import { escapeXml, formatDateISO, formatAmount } from '@/lib/xml-utils';

const KSEF_NAMESPACE = 'http://crd.gov.pl/wzor/2023/06/29/12648/';

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
  readonly formatName = 'KSeF FA(2) — Poland';
  /** @inheritdoc */
  readonly version = '1.0.0';
  readonly specVersion = 'FA(2)';
  readonly specDate = '2022-09-01';

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

    // Warn about unsupported tax rates (KSeF only has fields for 23%, 8%, 5%, 22%, 7%, 0%)
    const supportedRates = new Set([23, 8, 5, 22, 7, 0]);
    for (const item of invoice.lineItems) {
      const rate = item.taxRate ?? 0;
      if (!supportedRates.has(rate)) {
        warnings.push(
          `Line "${item.description}": tax rate ${rate}% is not a standard Polish VAT rate. KSeF may reject this invoice.`
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
      errors.push('Missing KSeF FA(2) namespace');
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
    return { valid: errors.length === 0, errors };
  }

  private buildXml(inv: CanonicalInvoice): string {
    const lines: string[] = [];
    const w = (line: string) => lines.push(line);

    w('<?xml version="1.0" encoding="UTF-8"?>');
    w(`<Faktura xmlns="${KSEF_NAMESPACE}">`);

    // ── Naglowek (Header) ──
    w('  <Naglowek>');
    w('    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>');
    w('    <WariantFormularza>2</WariantFormularza>');
    w(`    <DataWytworzeniaFa>${formatDateISO(inv.invoiceDate)}T00:00:00Z</DataWytworzeniaFa>`);
    w('    <SystemInfo>Invoice2E</SystemInfo>');
    w('  </Naglowek>');

    // ── Podmiot1 (Seller) ──
    const sellerNIP = extractNIP(inv.seller);
    w('  <Podmiot1>');
    w('    <DaneIdentyfikacyjne>');
    w(`      <NIP>${escapeXml(sellerNIP)}</NIP>`);
    w(`      <Nazwa>${escapeXml(inv.seller.name)}</Nazwa>`);
    w('    </DaneIdentyfikacyjne>');
    w('    <Adres>');
    w(`      <KodKraju>${escapeXml(inv.seller.countryCode || 'PL')}</KodKraju>`);
    w(`      <AdresL1>${escapeXml(inv.seller.address || '')}</AdresL1>`);
    w(
      `      <AdresL2>${escapeXml([inv.seller.postalCode, inv.seller.city].filter(Boolean).join(' '))}</AdresL2>`
    );
    w('    </Adres>');
    if (inv.seller.name) {
      w(`    <NazwaHandlowa>${escapeXml(inv.seller.name)}</NazwaHandlowa>`);
    }
    w('  </Podmiot1>');

    // ── Podmiot2 (Buyer) ──
    const buyerNIP = extractNIP(inv.buyer);
    w('  <Podmiot2>');
    w('    <DaneIdentyfikacyjne>');
    if (buyerNIP) {
      w(`      <NIP>${escapeXml(buyerNIP)}</NIP>`);
    }
    w(`      <Nazwa>${escapeXml(inv.buyer.name)}</Nazwa>`);
    w('    </DaneIdentyfikacyjne>');
    w('    <Adres>');
    w(`      <KodKraju>${escapeXml(inv.buyer.countryCode || 'PL')}</KodKraju>`);
    w(`      <AdresL1>${escapeXml(inv.buyer.address || '')}</AdresL1>`);
    w(
      `      <AdresL2>${escapeXml([inv.buyer.postalCode, inv.buyer.city].filter(Boolean).join(' '))}</AdresL2>`
    );
    w('    </Adres>');
    w('  </Podmiot2>');

    // ── Fa (Invoice Data) ──
    w('  <Fa>');
    w(`    <KodWaluty>${escapeXml(inv.currency)}</KodWaluty>`);
    w(`    <P_1>${formatDateISO(inv.invoiceDate)}</P_1>`);
    w(`    <P_2>${escapeXml(inv.invoiceNumber)}</P_2>`);

    // Tax rate summary fields (P_13_1 = net at 23%, P_14_1 = VAT at 23%, etc.)
    const rateSums = sumByTaxRate(inv.lineItems);
    // Apply document-level allowances/charges to rate sums
    if (inv.allowanceCharges?.length) {
      for (const ac of inv.allowanceCharges) {
        const rate = ac.taxRate ?? 0;
        const adjustment = ac.chargeIndicator ? ac.amount : -ac.amount;
        rateSums.set(rate, (rateSums.get(rate) || 0) + adjustment);
      }
    }
    for (const [rate, netAmount] of rateSums) {
      if (rate === 23) {
        w(`    <P_13_1>${formatAmount(netAmount)}</P_13_1>`);
        w(`    <P_14_1>${formatAmount(netAmount * 0.23)}</P_14_1>`);
      } else if (rate === 8) {
        w(`    <P_13_2>${formatAmount(netAmount)}</P_13_2>`);
        w(`    <P_14_2>${formatAmount(netAmount * 0.08)}</P_14_2>`);
      } else if (rate === 5) {
        w(`    <P_13_3>${formatAmount(netAmount)}</P_13_3>`);
        w(`    <P_14_3>${formatAmount(netAmount * 0.05)}</P_14_3>`);
      } else if (rate === 22) {
        w(`    <P_13_4>${formatAmount(netAmount)}</P_13_4>`);
        w(`    <P_14_4>${formatAmount(netAmount * 0.22)}</P_14_4>`);
      } else if (rate === 7) {
        w(`    <P_13_5>${formatAmount(netAmount)}</P_13_5>`);
        w(`    <P_14_5>${formatAmount(netAmount * 0.07)}</P_14_5>`);
      } else if (rate === 0) {
        w(`    <P_13_6_1>${formatAmount(netAmount)}</P_13_6_1>`);
      }
    }

    // P_15 — total gross amount
    w(`    <P_15>${formatAmount(inv.totals.totalAmount)}</P_15>`);

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

    // P_16 = false (not self-billing), P_17 = false (not simplified)
    w('    <P_16>2</P_16>');
    w('    <P_17>2</P_17>');

    w('  </Fa>');
    w('</Faktura>');

    return lines.join('\n');
  }
}
