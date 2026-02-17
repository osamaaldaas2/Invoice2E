/**
 * FatturaPA (Italian e-invoice) format generator.
 * Generates FatturaElettronica XML v1.2 from CanonicalInvoice.
 *
 * @module services/format/fatturapa/fatturapa.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import { escapeXml, formatDateISO, formatAmount } from '@/lib/xml-utils';

/** Map EN 16931 document type codes to FatturaPA TipoDocumento */
function mapTipoDocumento(code?: string | number): string {
  switch (String(code)) {
    case '381':
      return 'TD04'; // credit note
    case '380':
    default:
      return 'TD01'; // invoice
  }
}

/** Split a VAT ID like "IT12345678901" into country + code. Returns null if missing/invalid. */
function splitVatId(
  vatId: string | null | undefined,
  fallbackCountry?: string
): { paese: string; codice: string } | null {
  const id = (vatId || '').replace(/\s/g, '');
  if (!id || id.length < 2) return null;
  if (/^[A-Za-z]{2}/.test(id)) {
    return { paese: id.substring(0, 2).toUpperCase(), codice: id.substring(2) };
  }
  // No country prefix — use fallback country or 'IT', treat entire string as code
  return { paese: fallbackCountry || 'IT', codice: id };
}

/** Format date as YYYY-MM-DD for FatturaPA */
function fpaDate(date: string): string {
  return formatDateISO(date);
}

/** Map EN 16931 tax category codes to FatturaPA Natura codes (0% VAT only) */
function mapNaturaCode(taxCategoryCode: string | undefined, taxRate: number): string | null {
  if (taxRate > 0) return null; // Natura only for 0% VAT
  switch (taxCategoryCode) {
    case 'E':
      return 'N4'; // esente art.10
    case 'Z':
      return 'N2.1'; // non soggette — zero-rated
    case 'AE':
      return 'N6'; // inversione contabile (reverse charge)
    case 'K':
      return 'N3.2'; // cessioni intracomunitarie
    case 'G':
      return 'N3.1'; // esportazioni
    case 'O':
      return 'N2.2'; // non soggette — fuori campo IVA
    default:
      return 'N2.2'; // default for unspecified 0% VAT
  }
}

export class FatturapaGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'fatturapa';
  readonly formatName = 'FatturaPA 1.2 (Italy)';
  /** @inheritdoc */
  readonly version = '1.0.0';
  readonly specVersion = '1.2.2';
  readonly specDate = '2022-09-29';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    // Pre-generation validation: seller VAT ID is mandatory for FatturaPA
    const sellerVat = splitVatId(
      invoice.seller.vatId || invoice.seller.taxId,
      invoice.seller.countryCode || undefined
    );
    if (!sellerVat) {
      return {
        xmlContent: '',
        fileName: '',
        fileSize: 0,
        validationStatus: 'invalid',
        validationErrors: ['FatturaPA requires seller VAT ID (Italian format: IT + 11 digits)'],
        validationWarnings: [],
      };
    }

    const xml = this.buildXml(invoice);
    const validation = await this.validate(xml);

    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_fatturapa.xml`,
      fileSize: new TextEncoder().encode(xml).length,
      validationStatus: validation.valid ? 'valid' : 'warnings',
      validationErrors: validation.errors,
      validationWarnings: [],
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const required = [
      'FatturaElettronicaHeader',
      'FatturaElettronicaBody',
      'DatiTrasmissione',
      'CedentePrestatore',
      'CessionarioCommittente',
      'DatiGeneraliDocumento',
      'DettaglioLinee',
      'DatiRiepilogo',
    ];
    for (const el of required) {
      if (!xml.includes(el)) {
        errors.push(`Missing required element: ${el}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private buildXml(inv: CanonicalInvoice): string {
    // Seller VAT is pre-validated in generate() — fallback to taxId
    const sellerVat = splitVatId(
      inv.seller.vatId || inv.seller.taxId,
      inv.seller.countryCode || undefined
    )!;
    const buyerVat = splitVatId(inv.buyer.vatId, inv.buyer.countryCode || undefined);
    const tipoDoc = mapTipoDocumento(inv.documentTypeCode);
    const progressivo = (inv.invoiceNumber || '00001')
      .replace(/[^A-Za-z0-9]/g, '')
      .substring(0, 10)
      .padStart(5, '0');

    // Compute document-level allowance/charge adjustments per tax rate
    const allowanceChargeByRate = new Map<number, number>();
    if (inv.allowanceCharges?.length) {
      for (const ac of inv.allowanceCharges) {
        const rate = ac.taxRate ?? 0;
        const adjustment = ac.chargeIndicator ? ac.amount : -ac.amount;
        allowanceChargeByRate.set(rate, (allowanceChargeByRate.get(rate) || 0) + adjustment);
      }
    }

    // Tax summary: group line items by tax rate, incorporating allowances/charges
    const taxGroups = new Map<number, { taxable: number; tax: number; taxCategoryCode?: string }>();
    for (const item of inv.lineItems) {
      const rate = item.taxRate ?? 0;
      const existing = taxGroups.get(rate) || { taxable: 0, tax: 0 };
      existing.taxable += item.totalPrice;
      existing.tax += item.totalPrice * (rate / 100);
      if (item.taxCategoryCode && !existing.taxCategoryCode) {
        existing.taxCategoryCode = item.taxCategoryCode;
      }
      taxGroups.set(rate, existing);
    }
    // Apply allowances/charges to tax groups
    for (const [rate, adjustment] of allowanceChargeByRate) {
      const existing = taxGroups.get(rate) || { taxable: 0, tax: 0 };
      existing.taxable += adjustment;
      existing.tax += adjustment * (rate / 100);
      taxGroups.set(rate, existing);
    }

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">`
    );

    // === Header ===
    lines.push(`  <FatturaElettronicaHeader>`);

    // DatiTrasmissione
    lines.push(`    <DatiTrasmissione>`);
    lines.push(`      <IdTrasmittente>`);
    lines.push(`        <IdPaese>${escapeXml(sellerVat.paese)}</IdPaese>`);
    lines.push(`        <IdCodice>${escapeXml(sellerVat.codice)}</IdCodice>`);
    lines.push(`      </IdTrasmittente>`);
    lines.push(`      <ProgressivoInvio>${escapeXml(progressivo)}</ProgressivoInvio>`);
    lines.push(`      <FormatoTrasmissione>FPR12</FormatoTrasmissione>`);
    lines.push(
      `      <CodiceDestinatario>${/^[A-Z0-9]{7}$/.test(inv.buyer.electronicAddress || '') ? inv.buyer.electronicAddress : '0000000'}</CodiceDestinatario>`
    );
    lines.push(`    </DatiTrasmissione>`);

    // CedentePrestatore (seller)
    lines.push(`    <CedentePrestatore>`);
    lines.push(`      <DatiAnagrafici>`);
    lines.push(`        <IdFiscaleIVA>`);
    lines.push(`          <IdPaese>${escapeXml(sellerVat.paese)}</IdPaese>`);
    lines.push(`          <IdCodice>${escapeXml(sellerVat.codice)}</IdCodice>`);
    lines.push(`        </IdFiscaleIVA>`);
    if (inv.seller.taxNumber) {
      lines.push(`        <CodiceFiscale>${escapeXml(inv.seller.taxNumber)}</CodiceFiscale>`);
    }
    lines.push(`        <Anagrafica>`);
    lines.push(`          <Denominazione>${escapeXml(inv.seller.name)}</Denominazione>`);
    lines.push(`        </Anagrafica>`);
    lines.push(
      `        <RegimeFiscale>${escapeXml(inv.seller.taxRegime || 'RF01')}</RegimeFiscale>`
    );
    lines.push(`      </DatiAnagrafici>`);
    lines.push(`      <Sede>`);
    lines.push(`        <Indirizzo>${escapeXml(inv.seller.address || 'N/A')}</Indirizzo>`);
    lines.push(`        <CAP>${escapeXml(inv.seller.postalCode || '00000')}</CAP>`);
    lines.push(`        <Comune>${escapeXml(inv.seller.city || 'N/A')}</Comune>`);
    lines.push(
      `        <Nazione>${escapeXml(inv.seller.countryCode || sellerVat.paese)}</Nazione>`
    );
    lines.push(`      </Sede>`);
    lines.push(`    </CedentePrestatore>`);

    // CessionarioCommittente (buyer)
    lines.push(`    <CessionarioCommittente>`);
    lines.push(`      <DatiAnagrafici>`);
    if (buyerVat) {
      lines.push(`        <IdFiscaleIVA>`);
      lines.push(`          <IdPaese>${escapeXml(buyerVat.paese)}</IdPaese>`);
      lines.push(`          <IdCodice>${escapeXml(buyerVat.codice)}</IdCodice>`);
      lines.push(`        </IdFiscaleIVA>`);
    }
    if (inv.buyer.taxNumber) {
      lines.push(`        <CodiceFiscale>${escapeXml(inv.buyer.taxNumber)}</CodiceFiscale>`);
    } else if (!inv.buyer.vatId && inv.buyer.taxId) {
      lines.push(`        <CodiceFiscale>${escapeXml(inv.buyer.taxId)}</CodiceFiscale>`);
    }
    lines.push(`        <Anagrafica>`);
    lines.push(`          <Denominazione>${escapeXml(inv.buyer.name)}</Denominazione>`);
    lines.push(`        </Anagrafica>`);
    lines.push(`      </DatiAnagrafici>`);
    lines.push(`      <Sede>`);
    lines.push(`        <Indirizzo>${escapeXml(inv.buyer.address || 'N/A')}</Indirizzo>`);
    lines.push(`        <CAP>${escapeXml(inv.buyer.postalCode || '00000')}</CAP>`);
    lines.push(`        <Comune>${escapeXml(inv.buyer.city || 'N/A')}</Comune>`);
    lines.push(
      `        <Nazione>${escapeXml(inv.buyer.countryCode || buyerVat?.paese || 'IT')}</Nazione>`
    );
    lines.push(`      </Sede>`);
    lines.push(`    </CessionarioCommittente>`);

    lines.push(`  </FatturaElettronicaHeader>`);

    // === Body ===
    lines.push(`  <FatturaElettronicaBody>`);

    // DatiGenerali
    lines.push(`    <DatiGenerali>`);
    lines.push(`      <DatiGeneraliDocumento>`);
    lines.push(`        <TipoDocumento>${tipoDoc}</TipoDocumento>`);
    lines.push(`        <Divisa>${escapeXml(inv.currency)}</Divisa>`);
    lines.push(`        <Data>${fpaDate(inv.invoiceDate)}</Data>`);
    lines.push(`        <Numero>${escapeXml(inv.invoiceNumber)}</Numero>`);
    // Document-level allowances/charges (ScontoMaggiorazione)
    if (inv.allowanceCharges?.length) {
      for (const ac of inv.allowanceCharges) {
        lines.push(`        <ScontoMaggiorazione>`);
        lines.push(`          <Tipo>${ac.chargeIndicator ? 'MG' : 'SC'}</Tipo>`);
        if (ac.percentage != null) {
          lines.push(`          <Percentuale>${ac.percentage.toFixed(2)}</Percentuale>`);
        }
        lines.push(`          <Importo>${formatAmount(ac.amount)}</Importo>`);
        lines.push(`        </ScontoMaggiorazione>`);
      }
    }
    if (inv.totals.totalAmount != null) {
      lines.push(
        `        <ImportoTotaleDocumento>${formatAmount(inv.totals.totalAmount)}</ImportoTotaleDocumento>`
      );
    }
    lines.push(`      </DatiGeneraliDocumento>`);
    // Credit note: link to preceding invoice
    if (tipoDoc === 'TD04' && inv.precedingInvoiceReference) {
      lines.push(`      <DatiFattureCollegate>`);
      lines.push(`        <IdDocumento>${escapeXml(inv.precedingInvoiceReference)}</IdDocumento>`);
      lines.push(`      </DatiFattureCollegate>`);
    }
    lines.push(`    </DatiGenerali>`);

    // DatiBeniServizi
    lines.push(`    <DatiBeniServizi>`);

    // DettaglioLinee
    inv.lineItems.forEach((item, idx) => {
      lines.push(`      <DettaglioLinee>`);
      lines.push(`        <NumeroLinea>${idx + 1}</NumeroLinea>`);
      lines.push(`        <Descrizione>${escapeXml(item.description)}</Descrizione>`);
      lines.push(`        <Quantita>${item.quantity.toFixed(2)}</Quantita>`);
      lines.push(`        <PrezzoUnitario>${formatAmount(item.unitPrice)}</PrezzoUnitario>`);
      lines.push(`        <PrezzoTotale>${formatAmount(item.totalPrice)}</PrezzoTotale>`);
      lines.push(`        <AliquotaIVA>${(item.taxRate ?? 0).toFixed(2)}</AliquotaIVA>`);
      const itemNatura = mapNaturaCode(item.taxCategoryCode, item.taxRate ?? 0);
      if (itemNatura) {
        lines.push(`        <Natura>${itemNatura}</Natura>`);
      }
      lines.push(`      </DettaglioLinee>`);
    });

    // DatiRiepilogo
    for (const [rate, group] of taxGroups) {
      lines.push(`      <DatiRiepilogo>`);
      lines.push(`        <AliquotaIVA>${rate.toFixed(2)}</AliquotaIVA>`);
      lines.push(`        <ImponibileImporto>${formatAmount(group.taxable)}</ImponibileImporto>`);
      lines.push(`        <Imposta>${formatAmount(group.tax)}</Imposta>`);
      const groupNatura = mapNaturaCode(group.taxCategoryCode, rate);
      if (groupNatura) {
        lines.push(`        <Natura>${groupNatura}</Natura>`);
      }
      lines.push(`      </DatiRiepilogo>`);
    }

    lines.push(`    </DatiBeniServizi>`);

    // DatiPagamento
    if (inv.payment.iban || inv.totals.totalAmount) {
      // TP02 = complete payment in single installment (standard B2B default)
      lines.push(`    <DatiPagamento>`);
      lines.push(`      <CondizioniPagamento>TP02</CondizioniPagamento>`);
      lines.push(`      <DettaglioPagamento>`);
      // MP05 = bank transfer (when IBAN present), MP01 = cash (generic fallback)
      const modalitaPagamento = inv.payment.iban ? 'MP05' : 'MP01';
      lines.push(`        <ModalitaPagamento>${modalitaPagamento}</ModalitaPagamento>`);
      lines.push(
        `        <ImportoPagamento>${formatAmount(inv.totals.totalAmount)}</ImportoPagamento>`
      );
      if (inv.payment.dueDate) {
        lines.push(
          `        <DataScadenzaPagamento>${fpaDate(inv.payment.dueDate)}</DataScadenzaPagamento>`
        );
      }
      if (inv.payment.iban) {
        lines.push(`        <IBAN>${escapeXml(inv.payment.iban.replace(/\s/g, ''))}</IBAN>`);
      }
      if (inv.payment.bic) {
        lines.push(`        <BIC>${escapeXml(inv.payment.bic)}</BIC>`);
      }
      lines.push(`      </DettaglioPagamento>`);
      lines.push(`    </DatiPagamento>`);
    }

    lines.push(`  </FatturaElettronicaBody>`);
    lines.push(`</p:FatturaElettronica>`);

    return lines.join('\n');
  }
}
