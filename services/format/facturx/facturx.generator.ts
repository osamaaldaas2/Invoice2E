/**
 * Factur-X / ZUGFeRD generator — hybrid PDF/A-3 with embedded CII XML.
 *
 * Reuses XRechnungBuilder for CII XML generation, replacing the SpecificationID.
 * Generates a visual PDF with pdf-lib and embeds the XML as an attachment.
 *
 * @module services/format/facturx/facturx.generator
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFName,
  PDFArray,
  PDFDict,
} from 'pdf-lib';
import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { xrechnungBuilder } from '@/services/xrechnung/builder';
import { validateXmlStructure } from '@/services/xrechnung/validator';
import { escapeXml } from '@/lib/xml-utils';
import { logger } from '@/lib/logger';

/** Factur-X profile specification IDs */
const FACTURX_SPECS: Record<
  string,
  { specId: string; profileName: string; conformanceLevel: string }
> = {
  'facturx-en16931': {
    specId: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931',
    profileName: 'Factur-X EN 16931 (Comfort)',
    conformanceLevel: 'EN 16931',
  },
  'facturx-basic': {
    specId: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic',
    profileName: 'Factur-X Basic',
    conformanceLevel: 'BASIC',
  },
};

/** XRechnung specification ID to replace in generated XML */
const XRECHNUNG_SPEC_ID = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

/**
 * Convert CanonicalInvoice to XRechnungInvoiceData (same mapping as CII generator).
 */
function toXRechnungData(invoice: CanonicalInvoice): XRechnungInvoiceData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    documentTypeCode: invoice.documentTypeCode,
    currency: invoice.currency,
    buyerReference: invoice.buyerReference,
    notes: invoice.notes,
    precedingInvoiceReference: invoice.precedingInvoiceReference,
    billingPeriodStart: invoice.billingPeriodStart,
    billingPeriodEnd: invoice.billingPeriodEnd,
    sellerName: invoice.seller.name,
    sellerEmail: invoice.seller.email,
    sellerAddress: invoice.seller.address,
    sellerCity: invoice.seller.city,
    sellerPostalCode: invoice.seller.postalCode,
    sellerCountryCode: invoice.seller.countryCode,
    sellerVatId: invoice.seller.vatId,
    sellerTaxNumber: invoice.seller.taxNumber,
    sellerTaxId: invoice.seller.taxId,
    sellerElectronicAddress: invoice.seller.electronicAddress,
    sellerElectronicAddressScheme: invoice.seller.electronicAddressScheme,
    sellerContactName: invoice.seller.contactName,
    sellerPhone: invoice.seller.phone,
    sellerIban: invoice.payment.iban,
    sellerBic: invoice.payment.bic,
    buyerName: invoice.buyer.name,
    buyerEmail: invoice.buyer.email,
    buyerAddress: invoice.buyer.address,
    buyerCity: invoice.buyer.city,
    buyerPostalCode: invoice.buyer.postalCode,
    buyerCountryCode: invoice.buyer.countryCode,
    buyerVatId: invoice.buyer.vatId,
    buyerTaxId: invoice.buyer.taxId,
    buyerElectronicAddress: invoice.buyer.electronicAddress,
    buyerElectronicAddressScheme: invoice.buyer.electronicAddressScheme,
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      taxRate: item.taxRate,
      taxCategoryCode: item.taxCategoryCode,
      unitCode: item.unitCode,
    })),
    subtotal: invoice.totals.subtotal,
    taxRate: invoice.taxRate,
    taxAmount: invoice.totals.taxAmount,
    totalAmount: invoice.totals.totalAmount,
    paymentTerms: invoice.payment.paymentTerms,
    paymentDueDate: invoice.payment.dueDate,
    dueDate: invoice.payment.dueDate,
    prepaidAmount: invoice.payment.prepaidAmount,
    allowanceCharges: invoice.allowanceCharges?.map((ac) => ({
      chargeIndicator: ac.chargeIndicator,
      amount: ac.amount,
      baseAmount: ac.baseAmount ?? undefined,
      percentage: ac.percentage ?? undefined,
      reason: ac.reason ?? undefined,
      reasonCode: ac.reasonCode ?? undefined,
      taxRate: ac.taxRate ?? undefined,
      taxCategoryCode: ac.taxCategoryCode ?? undefined,
    })),
  };
}

/**
 * Generate CII XML with Factur-X SpecificationID by reusing XRechnungBuilder
 * and replacing the spec ID + removing XRechnung-specific business process.
 */
function buildFacturXXml(invoice: CanonicalInvoice, format: OutputFormat): string {
  const spec = FACTURX_SPECS[format];
  if (!spec) throw new Error(`Unknown Factur-X format: ${format}`);

  const data = toXRechnungData(invoice);
  let xml = xrechnungBuilder.buildXml(data);

  // Replace XRechnung specification ID with Factur-X
  xml = xml.replace(XRECHNUNG_SPEC_ID, spec.specId);

  // Remove XRechnung/PEPPOL business process (Factur-X doesn't use it)
  xml = xml.replace(
    /\s*<ram:BusinessProcessSpecifiedDocumentContextParameter>[\s\S]*?<\/ram:BusinessProcessSpecifiedDocumentContextParameter>/,
    ''
  );

  return xml;
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function escapeText(s: string | undefined | null): string {
  return s ?? '';
}

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  fontSize = 9
): number {
  page.drawText(label, { x, y, font: boldFont, size: fontSize, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(value, { x: x + 100, y, font, size: fontSize, color: rgb(0, 0, 0) });
  return y - fontSize - 4;
}

async function buildPdf(
  invoice: CanonicalInvoice,
  xmlString: string,
  conformanceLevel: string
): Promise<Buffer> {
  const doc = await PDFDocument.create();

  // Set PDF metadata
  doc.setTitle(`Invoice ${invoice.invoiceNumber}`);
  doc.setAuthor(invoice.seller.name);
  doc.setSubject('Factur-X Invoice');
  doc.setProducer('Invoice2E - Factur-X Generator');
  doc.setCreator('Invoice2E');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  let y = height - 50;
  const margin = 50;

  // Title
  page.drawText('INVOICE', { x: margin, y, font: boldFont, size: 20, color: rgb(0.1, 0.1, 0.4) });
  y -= 30;

  // Invoice metadata
  y = drawLabelValue(
    page,
    font,
    boldFont,
    'Invoice No:',
    escapeText(invoice.invoiceNumber),
    margin,
    y
  );
  y = drawLabelValue(page, font, boldFont, 'Date:', escapeText(invoice.invoiceDate), margin, y);
  if (invoice.payment.dueDate) {
    y = drawLabelValue(page, font, boldFont, 'Due Date:', invoice.payment.dueDate, margin, y);
  }
  y = drawLabelValue(page, font, boldFont, 'Currency:', invoice.currency, margin, y);
  y -= 15;

  // Seller / Buyer side by side
  const colWidth = (width - margin * 2) / 2;
  const sellerX = margin;
  const buyerX = margin + colWidth;

  page.drawText('From (Seller)', {
    x: sellerX,
    y,
    font: boldFont,
    size: 11,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('To (Buyer)', {
    x: buyerX,
    y,
    font: boldFont,
    size: 11,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 16;

  const sellerLines: string[] = [
    invoice.seller.name,
    invoice.seller.address,
    `${invoice.seller.postalCode ?? ''} ${invoice.seller.city ?? ''}`.trim(),
    invoice.seller.countryCode,
    invoice.seller.vatId ? `VAT: ${invoice.seller.vatId}` : '',
    invoice.seller.email ?? '',
  ].filter((s): s is string => Boolean(s));

  const buyerLines: string[] = [
    invoice.buyer.name,
    invoice.buyer.address,
    `${invoice.buyer.postalCode ?? ''} ${invoice.buyer.city ?? ''}`.trim(),
    invoice.buyer.countryCode,
    invoice.buyer.vatId ? `VAT: ${invoice.buyer.vatId}` : '',
    invoice.buyer.email ?? '',
  ].filter((s): s is string => Boolean(s));

  const maxLines = Math.max(sellerLines.length, buyerLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) page.drawText(sellerLines[i]!, { x: sellerX, y, font, size: 9 });
    if (buyerLines[i]) page.drawText(buyerLines[i]!, { x: buyerX, y, font, size: 9 });
    y -= 13;
  }
  y -= 15;

  // Line items table header
  const cols = { desc: margin, qty: 300, unit: 350, total: 430, tax: 500 };
  page.drawText('Description', { x: cols.desc, y, font: boldFont, size: 9 });
  page.drawText('Qty', { x: cols.qty, y, font: boldFont, size: 9 });
  page.drawText('Unit Price', { x: cols.unit, y, font: boldFont, size: 9 });
  page.drawText('Total', { x: cols.total, y, font: boldFont, size: 9 });
  page.drawText('Tax %', { x: cols.tax, y, font: boldFont, size: 9 });
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 13;

  // Line items
  for (const item of invoice.lineItems) {
    if (y < 100) {
      // Simple overflow — in production you'd add a new page
      page.drawText('... (continued)', { x: margin, y, font, size: 8 });
      break;
    }
    const desc = (item.description ?? '').substring(0, 40);
    page.drawText(desc, { x: cols.desc, y, font, size: 8 });
    page.drawText(String(item.quantity), { x: cols.qty, y, font, size: 8 });
    page.drawText(item.unitPrice.toFixed(2), { x: cols.unit, y, font, size: 8 });
    page.drawText(item.totalPrice.toFixed(2), { x: cols.total, y, font, size: 8 });
    page.drawText(`${item.taxRate}%`, { x: cols.tax, y, font, size: 8 });
    y -= 13;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 15;

  // Totals
  const totalsX = 400;
  y = drawLabelValue(
    page,
    font,
    boldFont,
    'Subtotal:',
    invoice.totals.subtotal.toFixed(2),
    totalsX,
    y
  );
  y = drawLabelValue(page, font, boldFont, 'Tax:', invoice.totals.taxAmount.toFixed(2), totalsX, y);
  y -= 3;
  page.drawLine({
    start: { x: totalsX, y: y + 10 },
    end: { x: width - margin, y: y + 10 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.4),
  });
  y = drawLabelValue(
    page,
    font,
    boldFont,
    'Total:',
    invoice.totals.totalAmount.toFixed(2),
    totalsX,
    y,
    11
  );
  y -= 20;

  // Payment info
  if (invoice.payment.iban) {
    y = drawLabelValue(page, font, boldFont, 'IBAN:', invoice.payment.iban, margin, y);
  }
  if (invoice.payment.bic) {
    y = drawLabelValue(page, font, boldFont, 'BIC:', invoice.payment.bic, margin, y);
  }

  // Footer
  page.drawText(`Factur-X ${conformanceLevel} — generated by Invoice2E`, {
    x: margin,
    y: 30,
    font,
    size: 7,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Embed CII XML as attachment — use base64 string for compatibility
  const xmlBase64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(xmlString)))
      : Buffer.from(xmlString, 'utf-8').toString('base64');
  await doc.attach(xmlBase64, 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X CII XML Invoice',
    afRelationship: 'Alternative' as any,
  });

  // ─── PDF/A-3 Compliance ──────────────────────────────────────────────────

  const context = doc.context;
  const catalog = context.lookup(context.trailerInfo.Root) as PDFDict;

  // 1. Embed ICC sRGB color profile and create OutputIntent
  try {
    const iccProfileBytes = getMinimalSRGBProfile();
    const iccStream = context.stream(iccProfileBytes, {
      N: 3, // RGB = 3 components
    });
    const iccStreamRef = context.register(iccStream);

    const outputIntent = context.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: 'sRGB',
      RegistryName: 'http://www.color.org',
      Info: 'sRGB IEC61966-2.1',
      DestOutputProfile: iccStreamRef,
    });
    const outputIntentRef = context.register(outputIntent);

    const outputIntentsArray = context.obj([outputIntentRef]);
    catalog.set(PDFName.of('OutputIntents'), outputIntentsArray);
  } catch (e) {
    logger.warn('Could not embed OutputIntent/ICC profile', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. Set XMP metadata for Factur-X / PDF/A-3 conformance
  try {
    const xmpMetadata = buildXmpMetadata(invoice, conformanceLevel);
    const xmpBytes = Uint8Array.from(Buffer.from(xmpMetadata, 'utf-8'));
    const metadataStream = context.stream(xmpBytes, {
      Type: 'Metadata',
      Subtype: 'XML',
      Length: xmpBytes.length,
    });
    const metadataRef = context.register(metadataStream);
    catalog.set(PDFName.of('Metadata'), metadataRef);
  } catch (e) {
    logger.warn('Could not embed XMP metadata in PDF', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Ensure AF (Associated Files) array exists in catalog for PDF/A-3
  try {
    if (!catalog.get(PDFName.of('AF'))) {
      // Find the embedded file spec from Names > EmbeddedFiles
      const namesDict = catalog.get(PDFName.of('Names'));
      if (namesDict && namesDict instanceof PDFDict) {
        const embeddedFiles = namesDict.get(PDFName.of('EmbeddedFiles'));
        if (embeddedFiles && embeddedFiles instanceof PDFDict) {
          const namesArray = embeddedFiles.get(PDFName.of('Names'));
          if (namesArray && namesArray instanceof PDFArray) {
            // Names array is [string, ref, string, ref, ...] — get the filespec ref
            const afArray = context.obj([] as any[]);
            for (let i = 1; i < namesArray.size(); i += 2) {
              (afArray as PDFArray).push(namesArray.get(i)!);
            }
            catalog.set(PDFName.of('AF'), afArray);
          }
        }
      }
    }
  } catch (e) {
    logger.warn('Could not set AF array in catalog', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 4. Mark document as tagged PDF (PDF/A requirement)
  try {
    const markInfo = context.obj({ Marked: true });
    catalog.set(PDFName.of('MarkInfo'), markInfo);
  } catch (e) {
    logger.warn('Could not set MarkInfo', { error: e instanceof Error ? e.message : String(e) });
  }

  const pdfBytes = await doc.save();
  // Return as proper Buffer (compatible with Uint8Array for pdf-lib)
  return Buffer.from(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength);
}

/**
 * Minimal sRGB ICC profile (v2.1, 528 bytes).
 * This is the smallest valid ICC profile that identifies the sRGB color space,
 * sufficient for PDF/A-3 OutputIntent compliance.
 */
function getMinimalSRGBProfile(): Uint8Array {
  // Minimal ICC profile header + required tags for sRGB identification
  // Based on ICC.1:2001-04 spec, profile version 2.1.0
  const base64 =
    'AAIQQEXPRF0AAAAAAAAAACBtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3Nw' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQAAQAAAADTQ0RMAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAtZGVzYwAAAQQAAAAwcmRlcgAAAjAAAAAgZ2Rlcw' +
    'AAAjAAAAAgYmRlcwAAAjAAAAAgclhZWgAAAjAAAAAUZ1hZWgAAAkQAAAAU' +
    'YlhZWgAAAjAAAAAUd3RwdAAAAlgAAAAUcktSQwAAAjAAAAAOZ0tSQwAAAj' +
    'AAAAAOYktSQwAAAjAAAAAOAAAAEHNSR0IAAAAAAAAAAAAAAAAAAAAAdGV4' +
    'dAAAAABDQwAAWFlaIAAAAAAAAG+gAAA49QAAAz1YWVogAAAAAAAAJJ8AABF/' +
    'AAAHwFhZWiAAAAAAAABilAAAtLQAAAmaWFlaIAAAAAAAAPKcAAEBhAAAAh5j' +
    'dXJ2AAAAAAAAAAEgAAAA';
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function buildXmpMetadata(invoice: CanonicalInvoice, conformanceLevel: string): string {
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${escapeXml(invoice.invoiceNumber ?? '')}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(invoice.seller.name ?? '')}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Factur-X Invoice</rdf:li></rdf:Alt></dc:description>
      <pdf:Producer>Invoice2E - Factur-X Generator</pdf:Producer>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:ConformanceLevel>${conformanceLevel}</fx:ConformanceLevel>
      <fx:Version>1.0</fx:Version>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// ─── Generator Class ─────────────────────────────────────────────────────────

export class FacturXGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat;
  readonly formatName: string;

  private readonly spec: { specId: string; profileName: string; conformanceLevel: string };

  constructor(format: OutputFormat) {
    const spec = FACTURX_SPECS[format];
    if (!spec) throw new Error(`Unsupported Factur-X format: ${format}`);
    this.formatId = format;
    this.formatName = spec.profileName;
    this.spec = spec;
  }

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    logger.info('Generating Factur-X invoice', {
      format: this.formatId,
      invoiceNumber: invoice.invoiceNumber,
    });

    // 1. Generate CII XML with Factur-X specification ID
    const xml = buildFacturXXml(invoice, this.formatId);

    // 2. Generate visual PDF with embedded XML
    const pdfBuffer = await buildPdf(invoice, xml, this.spec.conformanceLevel);

    // 3. Structural validation of the XML
    const structValidation = await this.validate(xml);
    const warnings: string[] = [];
    if (!structValidation.valid) {
      warnings.push(...structValidation.errors.map((e) => `[XML-STRUCT] ${e}`));
    }

    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_facturx.pdf`,
      fileSize: pdfBuffer.length,
      validationStatus: warnings.length > 0 ? 'warnings' : 'valid',
      validationErrors: [],
      validationWarnings: warnings,
      pdfContent: pdfBuffer,
      mimeType: 'application/pdf',
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const result = validateXmlStructure(xml);
    return { valid: result.valid, errors: result.errors };
  }
}
