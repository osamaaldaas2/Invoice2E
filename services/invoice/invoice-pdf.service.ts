/**
 * Invoice PDF Generator Service
 * Generates professional German Rechnung (invoice) PDFs using pdf-lib.
 *
 * @module services/invoice/invoice-pdf.service
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { LOGO_PNG_BASE64 } from '@/lib/logo-base64';

// Company details — Aldaas Services - Invoice2E
const COMPANY_NAME = 'Aldaas Services - Invoice2E';
const COMPANY_ADDRESS_LINE1 = 'Herrenstr. 18d';
const COMPANY_ADDRESS_LINE2 = '24768 Rendsburg';
const COMPANY_COUNTRY = 'Deutschland';
const COMPANY_UST_ID = 'DE358337977';
const COMPANY_STEUERNUMMER = '28/011/35142';

// VAT rate as a decimal for display
const VAT_RATE_DISPLAY = '19%';

// PDF dimensions (A4 in points: 595 x 842)
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 545;
const CONTENT_WIDTH = MARGIN_RIGHT - MARGIN_LEFT;

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  customerEmail: string;
  customerName?: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  vatRate: number;
  currency: string;
  description: string;
  creditsPurchased: number;
  packageName: string;
  paymentMethod: string;
}

/**
 * Format a number as currency string: e.g. 9.99 → "9,99 €"
 */
function formatCurrency(amount: number, currency: string = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${amount.toFixed(2).replace('.', ',')} ${symbol}`;
}

/**
 * Format a date as German locale string: DD.MM.YYYY
 */
function formatDateDE(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

/**
 * Capitalize payment method for display
 */
function formatPaymentMethod(method: string): string {
  if (method === 'stripe') return 'Stripe (Kreditkarte)';
  if (method === 'paypal') return 'PayPal';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

export class InvoicePdfService {
  /**
   * Generate a PDF invoice and return the raw bytes.
   */
  async generatePdf(data: InvoicePdfData): Promise<Uint8Array> {
    logger.info('Generating invoice PDF', { invoiceNumber: data.invoiceNumber });

    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      // Embed fonts
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Try to embed logo
      await this.drawLogo(pdfDoc, page, fontBold);

      // Draw company details (top-right)
      this.drawCompanyDetails(page, fontRegular, fontBold);

      // Divider line below header
      const headerBottomY = PAGE_HEIGHT - 150;
      page.drawLine({
        start: { x: MARGIN_LEFT, y: headerBottomY },
        end: { x: MARGIN_RIGHT, y: headerBottomY },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Draw customer block (left side, below header)
      const customerBlockY = headerBottomY - 20;
      this.drawCustomerBlock(page, fontRegular, fontBold, data, customerBlockY);

      // Draw invoice metadata (right side, same row as customer)
      this.drawInvoiceMeta(page, fontRegular, fontBold, data, customerBlockY);

      // Draw "Rechnung" title
      const titleY = headerBottomY - 110;
      page.drawText('Rechnung', {
        x: MARGIN_LEFT,
        y: titleY,
        size: 18,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // Draw line items table
      const tableStartY = titleY - 30;
      const tableEndY = this.drawLineItemsTable(page, fontRegular, fontBold, data, tableStartY);

      // Draw totals block
      this.drawTotals(page, fontRegular, fontBold, data, tableEndY - 20);

      // Draw footer
      this.drawFooter(page, fontRegular);

      const pdfBytes = await pdfDoc.save();
      logger.info('Invoice PDF generated successfully', {
        invoiceNumber: data.invoiceNumber,
        sizeBytes: pdfBytes.length,
      });
      return pdfBytes;
    } catch (error) {
      logger.error('Failed to generate invoice PDF', {
        invoiceNumber: data.invoiceNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('PDF_ERROR', 'Failed to generate invoice PDF', 500);
    }
  }

  /**
   * Attempt to embed and draw the company logo. Falls back to text if logo unavailable.
   */
  private async drawLogo(pdfDoc: PDFDocument, page: PDFPage, fontBold: PDFFont): Promise<void> {
    try {
      const logoBytes = LOGO_PNG_BASE64 ? Buffer.from(LOGO_PNG_BASE64, 'base64') : null;
      if (logoBytes) {
        const logoImage = await pdfDoc.embedPng(logoBytes);
        const logoDims = logoImage.scaleToFit(120, 50);
        page.drawImage(logoImage, {
          x: MARGIN_LEFT,
          y: PAGE_HEIGHT - 80,
          width: logoDims.width,
          height: logoDims.height,
        });
      } else {
        // Fallback: draw company name as bold text
        page.drawText(COMPANY_NAME, {
          x: MARGIN_LEFT,
          y: PAGE_HEIGHT - 60,
          size: 14,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.4),
        });
      }
    } catch {
      // Non-fatal: draw text fallback
      page.drawText(COMPANY_NAME, {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 60,
        size: 14,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.4),
      });
    }
  }

  /**
   * Draw company details in the top-right corner.
   */
  private drawCompanyDetails(page: PDFPage, fontRegular: PDFFont, fontBold: PDFFont): void {
    const rightX = 400;
    const lines: Array<{ text: string; bold?: boolean; size?: number }> = [
      { text: COMPANY_NAME, bold: true, size: 10 },
      { text: COMPANY_ADDRESS_LINE1, size: 9 },
      { text: COMPANY_ADDRESS_LINE2, size: 9 },
      { text: COMPANY_COUNTRY, size: 9 },
      { text: '', size: 9 },
      { text: `USt-IdNr.: ${COMPANY_UST_ID}`, size: 9 },
      { text: `Steuernr.: ${COMPANY_STEUERNUMMER}`, size: 9 },
    ];

    let y = PAGE_HEIGHT - 55;
    for (const line of lines) {
      if (line.text) {
        page.drawText(line.text, {
          x: rightX,
          y,
          size: line.size ?? 9,
          font: line.bold ? fontBold : fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      y -= 13;
    }
  }

  /**
   * Draw customer address/info block on the left.
   */
  private drawCustomerBlock(
    page: PDFPage,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    data: InvoicePdfData,
    startY: number
  ): void {
    page.drawText('Rechnungsempfänger', {
      x: MARGIN_LEFT,
      y: startY,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });

    let y = startY - 15;

    if (data.customerName) {
      page.drawText(data.customerName, {
        x: MARGIN_LEFT,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 14;
    }

    page.drawText(data.customerEmail, {
      x: MARGIN_LEFT,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  /**
   * Draw invoice metadata (number, date, payment method) on the right.
   */
  private drawInvoiceMeta(
    page: PDFPage,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    data: InvoicePdfData,
    startY: number
  ): void {
    const metaX = 370;

    const rows: Array<{ label: string; value: string }> = [
      { label: 'Rechnungsnummer:', value: data.invoiceNumber },
      { label: 'Rechnungsdatum:', value: formatDateDE(data.issuedAt) },
      { label: 'Zahlungsart:', value: formatPaymentMethod(data.paymentMethod) },
    ];

    let y = startY;
    for (const row of rows) {
      page.drawText(row.label, {
        x: metaX,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawText(row.value, {
        x: metaX + 110,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 15;
    }
  }

  /**
   * Draw the line items table. Returns the Y position after the table.
   */
  private drawLineItemsTable(
    page: PDFPage,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    data: InvoicePdfData,
    startY: number
  ): number {
    // Column X positions
    const colDescription = MARGIN_LEFT;
    const colMenge = 310;
    const colEinzel = 380;
    const colGesamt = 470;

    // Table header background
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: startY - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.15, 0.25, 0.55),
    });

    const headerY = startY - 13;

    // Column headers
    page.drawText('Beschreibung', {
      x: colDescription + 4,
      y: headerY,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Menge', {
      x: colMenge,
      y: headerY,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Einzelpreis (netto)', {
      x: colEinzel - 10,
      y: headerY,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Gesamt (netto)', {
      x: colGesamt,
      y: headerY,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Line item row
    const rowY = startY - 40;
    const itemDescription = `${data.creditsPurchased} Invoice Credits (${data.packageName})`;

    // Light row background
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: rowY - 8,
      width: CONTENT_WIDTH,
      height: 22,
      color: rgb(0.96, 0.97, 1.0),
    });

    page.drawText(itemDescription, {
      x: colDescription + 4,
      y: rowY,
      size: 9,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('1', {
      x: colMenge + 10,
      y: rowY,
      size: 9,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(formatCurrency(data.amountNet, data.currency), {
      x: colEinzel - 5,
      y: rowY,
      size: 9,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(formatCurrency(data.amountNet, data.currency), {
      x: colGesamt,
      y: rowY,
      size: 9,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Bottom border of table
    const tableBottomY = rowY - 12;
    page.drawLine({
      start: { x: MARGIN_LEFT, y: tableBottomY },
      end: { x: MARGIN_RIGHT, y: tableBottomY },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    return tableBottomY;
  }

  /**
   * Draw the totals block (Zwischensumme, USt., Gesamtbetrag).
   */
  private drawTotals(
    page: PDFPage,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    data: InvoicePdfData,
    startY: number
  ): void {
    const labelX = 370;
    const valueX = 490;

    const rows: Array<{ label: string; value: string; bold?: boolean; size?: number }> = [
      {
        label: 'Zwischensumme (netto):',
        value: formatCurrency(data.amountNet, data.currency),
      },
      {
        label: `USt. ${VAT_RATE_DISPLAY}:`,
        value: formatCurrency(data.amountVat, data.currency),
      },
      {
        label: 'Gesamtbetrag (brutto):',
        value: formatCurrency(data.amountGross, data.currency),
        bold: true,
        size: 11,
      },
    ];

    let y = startY;
    for (const row of rows) {
      // Highlight the total row
      if (row.bold) {
        page.drawRectangle({
          x: labelX - 5,
          y: y - 5,
          width: MARGIN_RIGHT - labelX + 5,
          height: 20,
          color: rgb(0.15, 0.25, 0.55),
        });
        page.drawText(row.label, {
          x: labelX,
          y,
          size: row.size ?? 10,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
        page.drawText(row.value, {
          x: valueX,
          y,
          size: row.size ?? 10,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
      } else {
        page.drawText(row.label, {
          x: labelX,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.3, 0.3, 0.3),
        });
        page.drawText(row.value, {
          x: valueX,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      y -= 22;
    }
  }

  /**
   * Draw the footer with company legal details.
   */
  private drawFooter(page: PDFPage, fontRegular: PDFFont): void {
    const footerY = 50;

    // Footer divider
    page.drawLine({
      start: { x: MARGIN_LEFT, y: footerY + 18 },
      end: { x: MARGIN_RIGHT, y: footerY + 18 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    const footerText =
      `${COMPANY_NAME}  |  ${COMPANY_ADDRESS_LINE1}, ${COMPANY_ADDRESS_LINE2}  |  ` +
      `USt-IdNr.: ${COMPANY_UST_ID}  |  Steuernr.: ${COMPANY_STEUERNUMMER}`;

    page.drawText(footerText, {
      x: MARGIN_LEFT,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

export const invoicePdfService = new InvoicePdfService();
