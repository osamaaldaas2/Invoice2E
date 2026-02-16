import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'test-invoices');

interface LineItem {
  pos: number;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
  taxCategory?: string;
}

interface TaxBreakdown {
  rate: number;
  category?: string;
  taxableAmount: number;
  taxAmount: number;
  reason?: string;
}

interface Allowance {
  description: string;
  amount: number;
  isCharge: boolean;
  percent?: number;
}

interface InvoiceData {
  filename: string;
  title: string; // RECHNUNG, INVOICE, etc.
  docType: string; // Invoice, Credit Note, etc.
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  currencySymbol: string;
  seller: {
    name: string;
    street: string;
    street2?: string;
    city: string;
    zip: string;
    country: string;
    countryCode: string;
    vatId?: string;
    taxNumber?: string;
    registrationId?: string; // SIREN, KVK, etc.
    registrationLabel?: string;
    email?: string;
    phone?: string;
    endpoint?: string;
    endpointScheme?: string;
  };
  buyer: {
    name: string;
    street: string;
    street2?: string;
    city: string;
    zip: string;
    country: string;
    countryCode: string;
    vatId?: string;
    registrationId?: string;
    registrationLabel?: string;
    buyerReference?: string;
    endpoint?: string;
    endpointScheme?: string;
  };
  lineItems: LineItem[];
  allowances?: Allowance[];
  lineAllowances?: { linePos: number; description: string; amount: number }[];
  payment?: {
    means: string;
    iban?: string;
    bic?: string;
    paypalEmail?: string;
    terms?: string;
    prepaidAmount?: number;
    additionalMeans?: string;
  };
  precedingInvoice?: string;
  notes?: string;
  targetFormat?: string;
  codiceDestinatario?: string;
}

// Replace non-WinAnsi characters with closest ASCII equivalents
function sanitize(s: string): string {
  const map: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
    'ț': 't', 'ș': 's', 'Ț': 'T', 'Ș': 'S', 'ă': 'a', 'Ă': 'A', 'î': 'i', 'Î': 'I',
    'Ω': 'Ohm', 'ő': 'o', 'Ő': 'O', 'ű': 'u', 'Ű': 'U',
  };
  return s.replace(/[^\x00-\xFF]/g, c => map[c] || '?');
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function calcTaxBreakdowns(items: LineItem[], allowances?: Allowance[]): TaxBreakdown[] {
  const map = new Map<string, { taxable: number; rate: number; category?: string }>();
  for (const item of items) {
    const key = `${item.taxPercent}_${item.taxCategory || 'S'}`;
    const existing = map.get(key) || { taxable: 0, rate: item.taxPercent, category: item.taxCategory || 'S' };
    existing.taxable += item.qty * item.unitPrice;
    map.set(key, existing);
  }
  // Apply document-level allowances/charges proportionally to first tax group for simplicity
  if (allowances?.length) {
    const firstKey = map.keys().next().value;
    if (firstKey) {
      const entry = map.get(firstKey)!;
      for (const a of allowances) {
        entry.taxable += a.isCharge ? a.amount : -a.amount;
      }
    }
  }
  return Array.from(map.values()).map(e => ({
    rate: e.rate,
    category: e.category,
    taxableAmount: e.taxable,
    taxAmount: e.taxable * e.rate / 100
  }));
}

async function generateInvoicePDF(data: InvoiceData): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // May need multiple pages for long invoices
  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const lm = 50; // left margin
  const rm = 545; // right margin x

  function checkPage() {
    if (y < 80) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
  }

  function text(t: string, x: number, yy: number, size = 9, f: PDFFont = font) {
    t = sanitize(t);
    // Truncate to avoid issues with very long single lines
    const maxLen = 80;
    if (t.length > maxLen) {
      // Draw wrapped
      let offset = 0;
      let cy = yy;
      while (offset < t.length) {
        const chunk = t.substring(offset, offset + maxLen);
        page.drawText(chunk, { x, y: cy, size, font: f });
        cy -= size + 2;
        offset += maxLen;
        y = Math.min(y, cy);
      }
      return cy;
    }
    page.drawText(t, { x, y: yy, size, font: f });
    return yy;
  }

  function line(x1: number, y1: number, x2: number) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y1 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  }

  // === HEADER ===
  text(data.seller.name.substring(0, 60), lm, y, 11, fontBold);
  text(data.title, 400, y, 18, fontBold);
  y -= 25;
  line(lm, y, rm);
  y -= 15;

  // === SELLER (left) and BUYER (right) ===
  const sellerStartY = y;
  let sy = y;
  text(data.seller.name.substring(0, 70), lm, sy, 9, fontBold); sy -= 12;
  if (data.seller.name.length > 70) {
    text(data.seller.name.substring(70, 140), lm, sy, 8); sy -= 12;
  }
  text(data.seller.street, lm, sy, 8); sy -= 11;
  if (data.seller.street2) { text(data.seller.street2, lm, sy, 8); sy -= 11; }
  text(`${data.seller.zip} ${data.seller.city}`, lm, sy, 8); sy -= 11;
  text(data.seller.country, lm, sy, 8); sy -= 11;
  if (data.seller.vatId) { text(`VAT: ${data.seller.vatId}`, lm, sy, 8); sy -= 11; }
  if (data.seller.taxNumber) { text(`Tax#: ${data.seller.taxNumber}`, lm, sy, 8); sy -= 11; }
  if (data.seller.registrationId) { text(`${data.seller.registrationLabel || 'Reg'}: ${data.seller.registrationId}`, lm, sy, 8); sy -= 11; }
  if (data.seller.email) { text(`Email: ${data.seller.email}`, lm, sy, 8); sy -= 11; }
  if (data.seller.phone) { text(`Tel: ${data.seller.phone}`, lm, sy, 8); sy -= 11; }
  if (data.seller.endpoint) { text(`Endpoint (${data.seller.endpointScheme}): ${data.seller.endpoint}`, lm, sy, 8); sy -= 11; }

  let by = sellerStartY;
  const bx = 320;
  text(data.buyer.name.substring(0, 40), bx, by, 9, fontBold); by -= 12;
  text(data.buyer.street, bx, by, 8); by -= 11;
  if (data.buyer.street2) { text(data.buyer.street2, bx, by, 8); by -= 11; }
  text(`${data.buyer.zip} ${data.buyer.city}`, bx, by, 8); by -= 11;
  text(data.buyer.country, bx, by, 8); by -= 11;
  if (data.buyer.vatId) { text(`VAT: ${data.buyer.vatId}`, bx, by, 8); by -= 11; }
  if (data.buyer.registrationId) { text(`${data.buyer.registrationLabel || 'Reg'}: ${data.buyer.registrationId}`, bx, by, 8); by -= 11; }
  if (data.buyer.buyerReference) { text(`Ref: ${data.buyer.buyerReference}`, bx, by, 8); by -= 11; }
  if (data.buyer.endpoint) { text(`Endpoint (${data.buyer.endpointScheme}): ${data.buyer.endpoint}`, bx, by, 8); by -= 11; }

  y = Math.min(sy, by) - 15;

  // === INVOICE META ===
  line(lm, y, rm); y -= 15;
  text(`${data.docType}`, lm, y, 9, fontBold);
  text(`Nr: ${data.invoiceNumber}`, 200, y, 9);
  text(`Date: ${data.invoiceDate}`, 350, y, 9);
  text(`Due: ${data.dueDate}`, 470, y, 9);
  y -= 12;
  text(`Currency: ${data.currency}`, lm, y, 8);
  if (data.targetFormat) text(`Target: ${data.targetFormat}`, 200, y, 8);
  if (data.precedingInvoice) text(`Ref. Invoice: ${data.precedingInvoice}`, 350, y, 8);
  if (data.codiceDestinatario) text(`Cod. Dest.: ${data.codiceDestinatario}`, 350, y, 8);
  y -= 20;

  // === LINE ITEMS TABLE ===
  line(lm, y, rm); y -= 3;
  const cols = [lm, lm + 25, 280, 310, 345, 395, 440, 500];
  text('Pos', cols[0], y, 7, fontBold);
  text('Description', cols[1], y, 7, fontBold);
  text('Qty', cols[2], y, 7, fontBold);
  text('Unit', cols[3], y, 7, fontBold);
  text('Price', cols[4], y, 7, fontBold);
  text('Tax%', cols[5], y, 7, fontBold);
  text('Cat', cols[6], y, 7, fontBold);
  text('Total', cols[7], y, 7, fontBold);
  y -= 3;
  line(lm, y, rm); y -= 12;

  for (const item of data.lineItems) {
    checkPage();
    const total = item.qty * item.unitPrice;
    text(String(item.pos), cols[0], y, 7);
    // Truncate description for table
    const desc = item.description.length > 38 ? item.description.substring(0, 35) + '...' : item.description;
    text(desc, cols[1], y, 7);
    text(fmt(item.qty, item.qty % 1 === 0 ? 0 : 3), cols[2], y, 7);
    text(item.unit, cols[3], y, 7);
    text(fmt(item.unitPrice), cols[4], y, 7);
    text(`${fmt(item.taxPercent, 1)}%`, cols[5], y, 7);
    text(item.taxCategory || 'S', cols[6], y, 7);
    text(`${data.currencySymbol}${fmt(total)}`, cols[7], y, 7);
    y -= 11;

    // If description is very long, print full on next lines
    if (item.description.length > 38) {
      const remaining = item.description.substring(35);
      let off = 0;
      while (off < remaining.length) {
        checkPage();
        text(remaining.substring(off, off + 70), cols[1], y, 6);
        y -= 9;
        off += 70;
      }
    }
  }

  line(lm, y + 5, rm); y -= 10;

  // === ALLOWANCES & CHARGES ===
  if (data.allowances?.length) {
    checkPage();
    text('Allowances / Charges:', lm, y, 8, fontBold); y -= 12;
    for (const a of data.allowances) {
      checkPage();
      const sign = a.isCharge ? '+' : '-';
      const pct = a.percent ? ` (${a.percent}%)` : '';
      text(`${sign} ${a.description}${pct}: ${data.currencySymbol}${fmt(a.amount)}`, lm + 10, y, 8);
      y -= 11;
    }
    y -= 5;
  }

  if (data.lineAllowances?.length) {
    checkPage();
    text('Line-level allowances:', lm, y, 8, fontBold); y -= 12;
    for (const la of data.lineAllowances) {
      text(`Line ${la.linePos}: -${la.description}: ${data.currencySymbol}${fmt(la.amount)}`, lm + 10, y, 8);
      y -= 11;
    }
    y -= 5;
  }

  // === TAX BREAKDOWN ===
  checkPage();
  const taxBreakdowns = calcTaxBreakdowns(data.lineItems, data.allowances);
  text('Tax Breakdown:', lm, y, 8, fontBold); y -= 12;
  text('Rate', lm + 10, y, 7, fontBold);
  text('Category', lm + 60, y, 7, fontBold);
  text('Taxable', lm + 120, y, 7, fontBold);
  text('Tax', lm + 200, y, 7, fontBold);
  y -= 10;
  let totalTax = 0;
  let subtotal = 0;
  for (const tb of taxBreakdowns) {
    checkPage();
    text(`${fmt(tb.rate, 1)}%`, lm + 10, y, 7);
    text(tb.category || 'S', lm + 60, y, 7);
    text(`${data.currencySymbol}${fmt(tb.taxableAmount)}`, lm + 120, y, 7);
    text(`${data.currencySymbol}${fmt(tb.taxAmount)}`, lm + 200, y, 7);
    if (tb.reason) text(tb.reason, lm + 260, y, 7);
    totalTax += tb.taxAmount;
    subtotal += tb.taxableAmount;
    y -= 11;
  }

  // === TOTALS ===
  y -= 5;
  checkPage();
  line(350, y + 5, rm);
  text(`Subtotal:`, 370, y, 9, fontBold);
  text(`${data.currencySymbol}${fmt(subtotal)}`, 470, y, 9); y -= 13;
  text(`Tax:`, 370, y, 9, fontBold);
  text(`${data.currencySymbol}${fmt(totalTax)}`, 470, y, 9); y -= 13;
  if (data.payment?.prepaidAmount) {
    text(`Prepaid:`, 370, y, 9, fontBold);
    text(`-${data.currencySymbol}${fmt(data.payment.prepaidAmount)}`, 470, y, 9); y -= 13;
  }
  line(350, y + 5, rm);
  const grandTotal = subtotal + totalTax - (data.payment?.prepaidAmount || 0);
  text(`TOTAL:`, 370, y, 11, fontBold);
  text(`${data.currencySymbol}${fmt(grandTotal)}`, 470, y, 11, fontBold); y -= 20;

  // === PAYMENT INFO ===
  checkPage();
  if (data.payment) {
    text('Payment Information:', lm, y, 8, fontBold); y -= 12;
    text(`Method: ${data.payment.means}`, lm + 10, y, 8); y -= 11;
    if (data.payment.iban) { text(`IBAN: ${data.payment.iban}`, lm + 10, y, 8); y -= 11; }
    if (data.payment.bic) { text(`BIC: ${data.payment.bic}`, lm + 10, y, 8); y -= 11; }
    if (data.payment.paypalEmail) { text(`PayPal: ${data.payment.paypalEmail}`, lm + 10, y, 8); y -= 11; }
    if (data.payment.terms) { text(`Terms: ${data.payment.terms}`, lm + 10, y, 8); y -= 11; }
    if (data.payment.additionalMeans) { text(`Also: ${data.payment.additionalMeans}`, lm + 10, y, 8); y -= 11; }
    y -= 5;
  }

  // === NOTES ===
  if (data.notes) {
    checkPage();
    text('Notes:', lm, y, 8, fontBold); y -= 12;
    // Wrap notes
    const words = data.notes.split(' ');
    let line2 = '';
    for (const w of words) {
      if ((line2 + ' ' + w).length > 90) {
        text(line2.trim(), lm + 10, y, 7);
        y -= 10;
        checkPage();
        line2 = w;
      } else {
        line2 += ' ' + w;
      }
    }
    if (line2.trim()) { text(line2.trim(), lm + 10, y, 7); y -= 10; }
  }

  const pdfBytes = await doc.save();
  fs.writeFileSync(path.join(OUT_DIR, data.filename), pdfBytes);
}

// ============ INVOICE DEFINITIONS ============

function de(vatSuffix: string) { return `DE${vatSuffix}`; }

const invoices: InvoiceData[] = [
  // 1. DE standard (XRechnung CII)
  {
    filename: '01-de-xrechnung-cii.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-001', invoiceDate: '2024-10-15', dueDate: '2024-11-14', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Müller & Schmidt GmbH', street: 'Hauptstraße 42', city: 'Berlin', zip: '10115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE123456789', taxNumber: '27/123/45678', email: 'info@mueller-schmidt.de', phone: '+49 30 12345678' },
    buyer: { name: 'Bundesamt für Digitalisierung', street: 'Friedrichstraße 100', city: 'Berlin', zip: '10117', country: 'Deutschland', countryCode: 'DE', buyerReference: '04011000-12345-67' },
    lineItems: [
      { pos: 1, description: 'IT-Beratung Digitalisierung', qty: 40, unit: 'Std', unitPrice: 120.00, taxPercent: 19 },
      { pos: 2, description: 'Softwarelizenz Enterprise', qty: 1, unit: 'Stk', unitPrice: 2500.00, taxPercent: 19 },
      { pos: 3, description: 'Schulungsmaterial (ermäßigt)', qty: 10, unit: 'Stk', unitPrice: 45.00, taxPercent: 7 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', terms: '30 Tage netto' },
  },
  // 2. DE standard (XRechnung UBL)
  {
    filename: '02-de-xrechnung-ubl.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung UBL',
    invoiceNumber: 'RE-2024-002', invoiceDate: '2024-10-16', dueDate: '2024-11-15', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'TechSolutions Berlin GmbH', street: 'Kurfürstendamm 200', city: 'Berlin', zip: '10719', country: 'Deutschland', countryCode: 'DE', vatId: 'DE987654321', taxNumber: '30/567/89012' },
    buyer: { name: 'Stadtverwaltung München', street: 'Marienplatz 8', city: 'München', zip: '80331', country: 'Deutschland', countryCode: 'DE', buyerReference: '09162000-00001-12' },
    lineItems: [
      { pos: 1, description: 'Webentwicklung Frontend', qty: 80, unit: 'Std', unitPrice: 95.00, taxPercent: 19 },
      { pos: 2, description: 'Hosting & Wartung (12 Monate)', qty: 1, unit: 'Psch', unitPrice: 3600.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE75512108001245126199', bic: 'SOLADEST600', terms: '14 Tage netto' },
  },
  // 3. BE PEPPOL BIS
  {
    filename: '03-be-peppol-bis.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-003', invoiceDate: '2024-10-17', dueDate: '2024-11-16', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'TechVision BVBA', street: 'Antwerpsesteenweg 55', city: 'Brussels', zip: '1000', country: 'Belgium', countryCode: 'BE', vatId: 'BE0123456789', endpoint: 'techvision@peppol.be', endpointScheme: '0204' },
    buyer: { name: 'EU Commission - DG DIGIT', street: 'Rue de la Loi 200', city: 'Brussels', zip: '1049', country: 'Belgium', countryCode: 'BE', vatId: 'BE9876543210', endpoint: 'digit@ec.europa.eu', endpointScheme: '0204', buyerReference: 'PO-2024-EU-5567' },
    lineItems: [
      { pos: 1, description: 'Cloud Infrastructure Setup', qty: 1, unit: 'EA', unitPrice: 15000.00, taxPercent: 21 },
      { pos: 2, description: 'Annual Support Contract', qty: 1, unit: 'EA', unitPrice: 6000.00, taxPercent: 21 },
    ],
    payment: { means: 'Credit Transfer', iban: 'BE68539007547034', bic: 'BBRUBEBB', terms: 'Net 30 days' },
  },
  // 4. FR Factur-X EN16931
  {
    filename: '04-fr-facturx-en16931.pdf', title: 'FACTURE', docType: 'Facture', targetFormat: 'Factur-X EN16931',
    invoiceNumber: 'FA-2024-004', invoiceDate: '2024-10-18', dueDate: '2024-11-17', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Solutions Numériques SAS', street: '15 Rue de Rivoli', city: 'Paris', zip: '75001', country: 'France', countryCode: 'FR', vatId: 'FR12345678901', registrationId: '123 456 789', registrationLabel: 'SIREN', email: 'contact@solnum.fr' },
    buyer: { name: 'Ministère de l\'Économie', street: '139 Rue de Bercy', city: 'Paris', zip: '75012', country: 'France', countryCode: 'FR', vatId: 'FR98765432109', buyerReference: 'CMD-2024-8876' },
    lineItems: [
      { pos: 1, description: 'Développement application web', qty: 60, unit: 'H', unitPrice: 110.00, taxPercent: 20 },
      { pos: 2, description: 'Formation utilisateurs', qty: 3, unit: 'Jour', unitPrice: 800.00, taxPercent: 20 },
    ],
    payment: { means: 'Virement bancaire', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP', terms: '30 jours nets' },
  },
  // 5. FR Factur-X Basic
  {
    filename: '05-fr-facturx-basic.pdf', title: 'FACTURE', docType: 'Facture', targetFormat: 'Factur-X Basic',
    invoiceNumber: 'FA-2024-005', invoiceDate: '2024-10-19', dueDate: '2024-11-18', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Petit Commerce SARL', street: '8 Avenue des Champs', city: 'Lyon', zip: '69001', country: 'France', countryCode: 'FR', vatId: 'FR55667788990', registrationId: '987 654 321', registrationLabel: 'SIREN' },
    buyer: { name: 'Restaurant Le Bon Goût', street: '22 Place Bellecour', city: 'Lyon', zip: '69002', country: 'France', countryCode: 'FR', buyerReference: 'BC-2024-112' },
    lineItems: [
      { pos: 1, description: 'Fournitures de bureau', qty: 50, unit: 'Pce', unitPrice: 12.50, taxPercent: 20 },
      { pos: 2, description: 'Papier A4 (ramette)', qty: 20, unit: 'Pce', unitPrice: 5.90, taxPercent: 5.5 },
    ],
    payment: { means: 'Virement', iban: 'FR7612345678901234567890123', terms: '45 jours fin de mois' },
  },
  // 6. IT FatturaPA
  {
    filename: '06-it-fatturapa.pdf', title: 'FATTURA', docType: 'Fattura', targetFormat: 'FatturaPA',
    invoiceNumber: 'FT-2024-006', invoiceDate: '2024-10-20', dueDate: '2024-11-19', currency: 'EUR', currencySymbol: '€',
    codiceDestinatario: 'AABBCC1',
    seller: { name: 'Innovazione Digitale S.r.l.', street: 'Via Roma 25', city: 'Milano', zip: '20121', country: 'Italia', countryCode: 'IT', vatId: 'IT12345678901', registrationId: 'MI-123456', registrationLabel: 'REA' },
    buyer: { name: 'Comune di Roma', street: 'Via del Campidoglio 1', city: 'Roma', zip: '00186', country: 'Italia', countryCode: 'IT', vatId: 'IT98765432109', registrationId: 'UFG1AB', registrationLabel: 'Cod. Uff.' },
    lineItems: [
      { pos: 1, description: 'Servizio consulenza IT', qty: 30, unit: 'Ore', unitPrice: 85.00, taxPercent: 22 },
      { pos: 2, description: 'Licenza software gestionale', qty: 5, unit: 'Pz', unitPrice: 450.00, taxPercent: 22 },
    ],
    payment: { means: 'Bonifico bancario', iban: 'IT60X0542811101000000123456', bic: 'BPMOIT22XXX', terms: '30 giorni data fattura' },
  },
  // 7. PL KSeF
  {
    filename: '07-pl-ksef.pdf', title: 'FAKTURA', docType: 'Faktura VAT', targetFormat: 'KSeF FA(2)',
    invoiceNumber: 'FV/2024/10/007', invoiceDate: '2024-10-21', dueDate: '2024-11-20', currency: 'PLN', currencySymbol: 'zł',
    seller: { name: 'Nowoczesne Rozwiązania Sp. z o.o.', street: 'ul. Marszałkowska 100', city: 'Warszawa', zip: '00-001', country: 'Polska', countryCode: 'PL', vatId: 'PL1234567890', registrationId: '1234567890', registrationLabel: 'NIP' },
    buyer: { name: 'Urząd Miasta Kraków', street: 'pl. Wszystkich Świętych 3-4', city: 'Kraków', zip: '31-004', country: 'Polska', countryCode: 'PL', vatId: 'PL9876543210', registrationId: '9876543210', registrationLabel: 'NIP' },
    lineItems: [
      { pos: 1, description: 'Wdrożenie systemu ERP', qty: 1, unit: 'usł.', unitPrice: 50000.00, taxPercent: 23 },
      { pos: 2, description: 'Szkolenie pracowników', qty: 5, unit: 'dzień', unitPrice: 2000.00, taxPercent: 23 },
      { pos: 3, description: 'Podręcznik użytkownika', qty: 20, unit: 'szt.', unitPrice: 50.00, taxPercent: 8 },
    ],
    payment: { means: 'Przelew bankowy', iban: 'PL61109010140000071219812874', terms: '14 dni' },
  },
  // 8. NL NLCIUS
  {
    filename: '08-nl-nlcius.pdf', title: 'FACTUUR', docType: 'Factuur', targetFormat: 'NLCIUS',
    invoiceNumber: 'NL-2024-008', invoiceDate: '2024-10-22', dueDate: '2024-11-21', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Digital Services B.V.', street: 'Herengracht 500', city: 'Amsterdam', zip: '1017 CB', country: 'Nederland', countryCode: 'NL', vatId: 'NL123456789B01', registrationId: '12345678', registrationLabel: 'KVK' },
    buyer: { name: 'Gemeente Rotterdam', street: 'Coolsingel 40', city: 'Rotterdam', zip: '3011 AD', country: 'Nederland', countryCode: 'NL', registrationId: '12345678901234567890', registrationLabel: 'OIN', buyerReference: 'INK-2024-4456' },
    lineItems: [
      { pos: 1, description: 'Website redesign', qty: 1, unit: 'Stk', unitPrice: 8500.00, taxPercent: 21 },
      { pos: 2, description: 'SEO optimalisatie (3 maanden)', qty: 3, unit: 'Mnd', unitPrice: 1200.00, taxPercent: 21 },
    ],
    payment: { means: 'Bankoverschrijving', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', terms: '30 dagen netto' },
  },
  // 9. RO CIUS-RO
  {
    filename: '09-ro-cius-ro.pdf', title: 'FACTURĂ', docType: 'Factură fiscală', targetFormat: 'CIUS-RO',
    invoiceNumber: 'RO-2024-009', invoiceDate: '2024-10-23', dueDate: '2024-11-22', currency: 'RON', currencySymbol: 'RON ',
    seller: { name: 'Soluții Digitale S.R.L.', street: 'Strada Victoriei 100', city: 'București', zip: '010065', country: 'România', countryCode: 'RO', vatId: 'RO12345678', registrationId: 'J40/1234/2020', registrationLabel: 'CUI' },
    buyer: { name: 'Primăria Municipiului Cluj-Napoca', street: 'Str. Moților 3', city: 'Cluj-Napoca', zip: '400001', country: 'România', countryCode: 'RO', vatId: 'RO98765432', registrationId: 'J12/5678/2019', registrationLabel: 'CUI', buyerReference: 'ACH-2024-RO-789' },
    lineItems: [
      { pos: 1, description: 'Dezvoltare aplicație mobilă', qty: 200, unit: 'Ore', unitPrice: 250.00, taxPercent: 19 },
      { pos: 2, description: 'Testare și QA', qty: 50, unit: 'Ore', unitPrice: 180.00, taxPercent: 19 },
    ],
    payment: { means: 'Transfer bancar', iban: 'RO49AAAA1B31007593840000', terms: '30 zile' },
  },
  // 10. Zero-tax exempt (E)
  {
    filename: '10-tax-exempt-e.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-010', invoiceDate: '2024-10-24', dueDate: '2024-11-23', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Medical Supplies GmbH', street: 'Gesundheitsweg 10', city: 'Hamburg', zip: '20095', country: 'Deutschland', countryCode: 'DE', vatId: 'DE111222333' },
    buyer: { name: 'City Hospital Hamburg', street: 'Klinikstr. 5', city: 'Hamburg', zip: '20099', country: 'Deutschland', countryCode: 'DE', buyerReference: 'PO-MED-2024-100' },
    lineItems: [
      { pos: 1, description: 'Medical equipment (VAT exempt per §4 UStG)', qty: 10, unit: 'EA', unitPrice: 500.00, taxPercent: 0, taxCategory: 'E' },
      { pos: 2, description: 'Surgical masks (exempt)', qty: 1000, unit: 'EA', unitPrice: 0.50, taxPercent: 0, taxCategory: 'E' },
    ],
    payment: { means: 'Bank Transfer', iban: 'DE89370400440532013000', terms: 'Net 30' },
    notes: 'VAT exempt supplies according to Article 132 VAT Directive / §4 UStG.',
  },
  // 11. Reverse charge (AE)
  {
    filename: '11-reverse-charge-ae.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-011', invoiceDate: '2024-10-25', dueDate: '2024-11-24', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Software AG', street: 'Altenkesseler Str. 17', city: 'Saarbrücken', zip: '66115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE444555666' },
    buyer: { name: 'Acme Corp B.V.', street: 'Keizersgracht 100', city: 'Amsterdam', zip: '1015 AA', country: 'Netherlands', countryCode: 'NL', vatId: 'NL999888777B01', buyerReference: 'ACME-2024-RC' },
    lineItems: [
      { pos: 1, description: 'Enterprise Software License (Reverse Charge)', qty: 1, unit: 'EA', unitPrice: 25000.00, taxPercent: 0, taxCategory: 'AE' },
    ],
    payment: { means: 'Bank Transfer', iban: 'DE75512108001245126199', terms: 'Net 60' },
    notes: 'Reverse charge: VAT to be accounted for by the recipient (Art. 196 VAT Directive).',
  },
  // 12. Mixed rates DE 19% + 7%
  {
    filename: '12-mixed-tax-de.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-012', invoiceDate: '2024-10-26', dueDate: '2024-11-25', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Buchhandlung Wissen GmbH', street: 'Leseallee 5', city: 'Frankfurt', zip: '60311', country: 'Deutschland', countryCode: 'DE', vatId: 'DE555666777', taxNumber: '45/678/90123' },
    buyer: { name: 'Universität Frankfurt', street: 'Senckenberganlage 31', city: 'Frankfurt', zip: '60325', country: 'Deutschland', countryCode: 'DE', buyerReference: '06412000-UNI-001' },
    lineItems: [
      { pos: 1, description: 'Büromöbel Schreibtisch', qty: 5, unit: 'Stk', unitPrice: 450.00, taxPercent: 19 },
      { pos: 2, description: 'Bürostuhl ergonomisch', qty: 5, unit: 'Stk', unitPrice: 380.00, taxPercent: 19 },
      { pos: 3, description: 'Fachbücher Informatik', qty: 20, unit: 'Stk', unitPrice: 39.90, taxPercent: 7 },
      { pos: 4, description: 'Lehrmaterial (Zeitschriften)', qty: 12, unit: 'Stk', unitPrice: 15.00, taxPercent: 7 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage netto' },
  },
  // 13. Mixed rates FR 20% + 5.5%
  {
    filename: '13-mixed-tax-fr.pdf', title: 'FACTURE', docType: 'Facture', targetFormat: 'Factur-X EN16931',
    invoiceNumber: 'FA-2024-013', invoiceDate: '2024-10-27', dueDate: '2024-11-26', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Alimentation & Services SAS', street: '45 Boulevard Haussmann', city: 'Paris', zip: '75009', country: 'France', countryCode: 'FR', vatId: 'FR11223344556', registrationId: '111 222 333', registrationLabel: 'SIREN' },
    buyer: { name: 'Hôtel Le Grand Paris', street: '10 Rue de la Paix', city: 'Paris', zip: '75002', country: 'France', countryCode: 'FR', buyerReference: 'HGP-CMD-2024' },
    lineItems: [
      { pos: 1, description: 'Équipement cuisine professionnelle', qty: 2, unit: 'Pce', unitPrice: 3500.00, taxPercent: 20 },
      { pos: 2, description: 'Produits alimentaires bio', qty: 100, unit: 'Kg', unitPrice: 8.50, taxPercent: 5.5 },
      { pos: 3, description: 'Boissons non alcoolisées', qty: 200, unit: 'L', unitPrice: 2.20, taxPercent: 5.5 },
    ],
    payment: { means: 'Virement', iban: 'FR7630006000011234567890189', terms: '30 jours' },
  },
  // 14. Zero-rated export (Z)
  {
    filename: '14-zero-rated-export-z.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'EXP-2024-014', invoiceDate: '2024-10-28', dueDate: '2024-11-27', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Export Masters GmbH', street: 'Hafenstr. 20', city: 'Hamburg', zip: '20457', country: 'Deutschland', countryCode: 'DE', vatId: 'DE777888999' },
    buyer: { name: 'Global Trade LLC', street: '100 Wall Street', city: 'New York', zip: '10005', country: 'United States', countryCode: 'US', buyerReference: 'GT-IMP-2024-55' },
    lineItems: [
      { pos: 1, description: 'Industrial machinery (export)', qty: 1, unit: 'EA', unitPrice: 75000.00, taxPercent: 0, taxCategory: 'Z' },
    ],
    payment: { means: 'Wire Transfer', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', terms: 'Net 45' },
    notes: 'Zero-rated export outside EU. Tax category Z per Art. 146 VAT Directive.',
  },
  // 15. 0% tax with reason
  {
    filename: '15-zero-tax-reason.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-015', invoiceDate: '2024-10-29', dueDate: '2024-11-28', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Education Services Ltd', street: '50 Oxford Road', city: 'London', zip: 'W1D 1BS', country: 'United Kingdom', countryCode: 'GB', vatId: 'GB123456789' },
    buyer: { name: 'University of Amsterdam', street: 'Spui 21', city: 'Amsterdam', zip: '1012 WX', country: 'Netherlands', countryCode: 'NL', vatId: 'NL111222333B01', buyerReference: 'UvA-2024-EDU' },
    lineItems: [
      { pos: 1, description: 'Educational training services (0% - education exemption)', qty: 5, unit: 'Day', unitPrice: 2000.00, taxPercent: 0, taxCategory: 'E' },
    ],
    payment: { means: 'Bank Transfer', iban: 'GB29NWBK60161331926819', bic: 'NWBKGB2L', terms: 'Net 30' },
    notes: 'Exempt from VAT: Educational services as per Art. 132(1)(i) VAT Directive. Reason: Education and vocational training.',
  },
  // 16. Multiple tax categories S + E
  {
    filename: '16-multi-tax-s-e.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung UBL',
    invoiceNumber: 'RE-2024-016', invoiceDate: '2024-10-30', dueDate: '2024-11-29', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Pharma & Office GmbH', street: 'Industriestr. 15', city: 'Stuttgart', zip: '70173', country: 'Deutschland', countryCode: 'DE', vatId: 'DE333444555' },
    buyer: { name: 'Krankenhaus Stuttgart', street: 'Heilbronner Str. 100', city: 'Stuttgart', zip: '70191', country: 'Deutschland', countryCode: 'DE', buyerReference: '08111000-KH-001' },
    lineItems: [
      { pos: 1, description: 'Bürobedarf (19% MwSt)', qty: 100, unit: 'Stk', unitPrice: 5.00, taxPercent: 19, taxCategory: 'S' },
      { pos: 2, description: 'Medizinische Geräte (steuerbefreit)', qty: 2, unit: 'Stk', unitPrice: 8000.00, taxPercent: 0, taxCategory: 'E' },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '14 Tage' },
    notes: 'Medizinische Geräte steuerbefreit nach §4 Nr. 14 UStG.',
  },
  // 17. Kleinunternehmer §19
  {
    filename: '17-kleinunternehmer.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-017', invoiceDate: '2024-11-01', dueDate: '2024-12-01', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Anna Weber Fotografie', street: 'Blumenweg 7', city: 'Freiburg', zip: '79098', country: 'Deutschland', countryCode: 'DE', taxNumber: '08/123/45678', email: 'anna@weber-foto.de' },
    buyer: { name: 'Hochzeitsplanung Rosa GmbH', street: 'Gartenstr. 12', city: 'Freiburg', zip: '79100', country: 'Deutschland', countryCode: 'DE', buyerReference: '08311000-ROSA-01' },
    lineItems: [
      { pos: 1, description: 'Hochzeitsfotografie (Ganztag)', qty: 1, unit: 'Psch', unitPrice: 1800.00, taxPercent: 0, taxCategory: 'E' },
      { pos: 2, description: 'Fotoalbum Premium', qty: 1, unit: 'Stk', unitPrice: 350.00, taxPercent: 0, taxCategory: 'E' },
    ],
    payment: { means: 'Überweisung', iban: 'DE44500105175407324931', terms: '14 Tage netto' },
    notes: 'Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).',
  },
  // 18. Credit note DE
  {
    filename: '18-credit-note-de.pdf', title: 'GUTSCHRIFT', docType: 'Gutschrift', targetFormat: 'XRechnung CII',
    invoiceNumber: 'GS-2024-018', invoiceDate: '2024-11-02', dueDate: '2024-12-02', currency: 'EUR', currencySymbol: '€',
    precedingInvoice: 'RE-2024-001',
    seller: { name: 'Müller & Schmidt GmbH', street: 'Hauptstraße 42', city: 'Berlin', zip: '10115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE123456789' },
    buyer: { name: 'Bundesamt für Digitalisierung', street: 'Friedrichstraße 100', city: 'Berlin', zip: '10117', country: 'Deutschland', countryCode: 'DE', buyerReference: '04011000-12345-67' },
    lineItems: [
      { pos: 1, description: 'Storno: Softwarelizenz Enterprise (Rückgabe)', qty: -1, unit: 'Stk', unitPrice: 2500.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung (Rückzahlung)', iban: 'DE89370400440532013000' },
    notes: 'Gutschrift zu Rechnung RE-2024-001. Rückgabe der Softwarelizenz.',
  },
  // 19. Credit note IT (TD04)
  {
    filename: '19-credit-note-it-td04.pdf', title: 'NOTA DI CREDITO', docType: 'Nota di Credito (TD04)', targetFormat: 'FatturaPA',
    invoiceNumber: 'NC-2024-019', invoiceDate: '2024-11-03', dueDate: '2024-12-03', currency: 'EUR', currencySymbol: '€',
    precedingInvoice: 'FT-2024-006', codiceDestinatario: 'AABBCC1',
    seller: { name: 'Innovazione Digitale S.r.l.', street: 'Via Roma 25', city: 'Milano', zip: '20121', country: 'Italia', countryCode: 'IT', vatId: 'IT12345678901' },
    buyer: { name: 'Comune di Roma', street: 'Via del Campidoglio 1', city: 'Roma', zip: '00186', country: 'Italia', countryCode: 'IT', vatId: 'IT98765432109' },
    lineItems: [
      { pos: 1, description: 'Storno: Servizio consulenza IT (ore non erogate)', qty: -10, unit: 'Ore', unitPrice: 85.00, taxPercent: 22 },
    ],
    payment: { means: 'Bonifico bancario', iban: 'IT60X0542811101000000123456' },
    notes: 'Nota di credito relativa a fattura FT-2024-006. Tipo documento TD04.',
  },
  // 20. Corrective invoice
  {
    filename: '20-corrective-invoice.pdf', title: 'RECHNUNG (KORREKTUR)', docType: 'Korrekturrechnung', targetFormat: 'XRechnung UBL',
    invoiceNumber: 'KR-2024-020', invoiceDate: '2024-11-04', dueDate: '2024-12-04', currency: 'EUR', currencySymbol: '€',
    precedingInvoice: 'RE-2024-002',
    seller: { name: 'TechSolutions Berlin GmbH', street: 'Kurfürstendamm 200', city: 'Berlin', zip: '10719', country: 'Deutschland', countryCode: 'DE', vatId: 'DE987654321' },
    buyer: { name: 'Stadtverwaltung München', street: 'Marienplatz 8', city: 'München', zip: '80331', country: 'Deutschland', countryCode: 'DE', buyerReference: '09162000-00001-12' },
    lineItems: [
      { pos: 1, description: 'Webentwicklung Frontend (korrigiert)', qty: 75, unit: 'Std', unitPrice: 95.00, taxPercent: 19 },
      { pos: 2, description: 'Hosting & Wartung (korrigiert: 10 Monate)', qty: 1, unit: 'Psch', unitPrice: 3000.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE75512108001245126199', terms: '14 Tage' },
    notes: 'Korrekturrechnung zu RE-2024-002. Anpassung der Stunden und Laufzeit.',
  },
  // 21. Self-billing
  {
    filename: '21-self-billing.pdf', title: 'SELF-BILLING INVOICE', docType: 'Self-Billing Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'SB-2024-021', invoiceDate: '2024-11-05', dueDate: '2024-12-05', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Freelancer Max Bauer', street: 'Waldweg 3', city: 'München', zip: '80333', country: 'Deutschland', countryCode: 'DE', vatId: 'DE112233445' },
    buyer: { name: 'Big Corp AG', street: 'Königstr. 50', city: 'Stuttgart', zip: '70173', country: 'Deutschland', countryCode: 'DE', vatId: 'DE998877665', buyerReference: 'SB-BC-2024-021' },
    lineItems: [
      { pos: 1, description: 'Software development services (Oct 2024)', qty: 160, unit: 'Hours', unitPrice: 75.00, taxPercent: 19 },
    ],
    payment: { means: 'Bank Transfer', iban: 'DE44500105175407324931', terms: 'Net 15' },
    notes: 'Self-billing invoice issued by buyer (Big Corp AG) on behalf of seller (Max Bauer) per agreement dated 2024-01-15.',
  },
  // 22. Single line minimal
  {
    filename: '22-single-line-minimal.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'MIN-2024-022', invoiceDate: '2024-11-06', dueDate: '2024-12-06', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Simple Services Ltd', street: '1 Main St', city: 'Dublin', zip: 'D01 F5P2', country: 'Ireland', countryCode: 'IE', vatId: 'IE1234567T' },
    buyer: { name: 'Quick Buy GmbH', street: 'Kurzstr. 1', city: 'Wien', zip: '1010', country: 'Österreich', countryCode: 'AT', vatId: 'ATU12345678', buyerReference: 'QB-001' },
    lineItems: [
      { pos: 1, description: 'Consulting', qty: 1, unit: 'EA', unitPrice: 500.00, taxPercent: 21 },
    ],
    payment: { means: 'Transfer', iban: 'IE29AIBK93115212345678', terms: 'Net 30' },
  },
  // 23. 50+ line items stress test
  {
    filename: '23-many-lines-stress.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-023', invoiceDate: '2024-11-07', dueDate: '2024-12-07', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Großhandel Alles GmbH', street: 'Lagerstr. 999', city: 'Duisburg', zip: '47051', country: 'Deutschland', countryCode: 'DE', vatId: 'DE666777888' },
    buyer: { name: 'Kaufhaus Central AG', street: 'Einkaufsmeile 1', city: 'Düsseldorf', zip: '40213', country: 'Deutschland', countryCode: 'DE', buyerReference: '05111000-KC-001' },
    lineItems: Array.from({ length: 55 }, (_, i) => ({
      pos: i + 1,
      description: `Artikel ${String(i + 1).padStart(3, '0')} - Produkt ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i % 5]}`,
      qty: (i % 10) + 1,
      unit: 'Stk',
      unitPrice: 10.00 + (i * 1.5),
      taxPercent: i % 4 === 0 ? 7 : 19,
    })),
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
  },
  // 24. Very long descriptions
  {
    filename: '24-long-descriptions.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'Factur-X EN16931',
    invoiceNumber: 'INV-2024-024', invoiceDate: '2024-11-08', dueDate: '2024-12-08', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Detailed Products Inc.', street: '123 Description Lane', city: 'Paris', zip: '75001', country: 'France', countryCode: 'FR', vatId: 'FR99887766554' },
    buyer: { name: 'Procurement Office EU', street: 'Rue Montoyer 51', city: 'Brussels', zip: '1000', country: 'Belgium', countryCode: 'BE', vatId: 'BE0987654321', buyerReference: 'EU-PROC-2024' },
    lineItems: [
      { pos: 1, description: 'Premium Enterprise Cloud Infrastructure Service Package including 24/7 monitoring, automatic scaling, disaster recovery, backup management, security patching, compliance reporting, dedicated support team with guaranteed 15-minute response time, monthly performance reviews, and quarterly strategic planning sessions for optimal resource utilization and cost optimization across all deployed workloads', qty: 1, unit: 'Year', unitPrice: 48000.00, taxPercent: 20 },
      { pos: 2, description: 'Custom Software Development and Integration Services encompassing requirements analysis, system architecture design, frontend and backend development, API integration with existing legacy systems, comprehensive unit and integration testing, user acceptance testing coordination, deployment automation, documentation, and knowledge transfer to internal development team members', qty: 1, unit: 'Project', unitPrice: 95000.00, taxPercent: 20 },
    ],
    payment: { means: 'Wire Transfer', iban: 'FR7630006000011234567890189', terms: 'Net 60' },
  },
  // 25. Fractional quantities
  {
    filename: '25-fractional-quantities.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-025', invoiceDate: '2024-11-09', dueDate: '2024-12-09', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Labor Analytik GmbH', street: 'Chemiestr. 8', city: 'Darmstadt', zip: '64283', country: 'Deutschland', countryCode: 'DE', vatId: 'DE222333444' },
    buyer: { name: 'Forschungsinstitut Heidelberg', street: 'Im Neuenheimer Feld 205', city: 'Heidelberg', zip: '69120', country: 'Deutschland', countryCode: 'DE', buyerReference: '08221000-FI-001' },
    lineItems: [
      { pos: 1, description: 'Chemikalie A (0.5 Liter)', qty: 0.5, unit: 'L', unitPrice: 120.00, taxPercent: 19 },
      { pos: 2, description: 'Reagenz B (0.333 kg)', qty: 0.333, unit: 'kg', unitPrice: 450.00, taxPercent: 19 },
      { pos: 3, description: 'Laborzeit (2.75 Stunden)', qty: 2.75, unit: 'Std', unitPrice: 85.00, taxPercent: 19 },
      { pos: 4, description: 'Probe C (0.125 ml)', qty: 0.125, unit: 'ml', unitPrice: 2000.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
  },
  // 26. Very high amounts
  {
    filename: '26-high-amounts.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-026', invoiceDate: '2024-11-10', dueDate: '2025-01-10', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Aerospace Systems AG', street: 'Flughafenstr. 1', city: 'Toulouse', zip: '31000', country: 'France', countryCode: 'FR', vatId: 'FR44556677889' },
    buyer: { name: 'Defence Ministry', street: 'Rue Saint-Dominique 14', city: 'Paris', zip: '75007', country: 'France', countryCode: 'FR', vatId: 'FR11223344556', buyerReference: 'DEF-2024-HIGH' },
    lineItems: [
      { pos: 1, description: 'Satellite Communication System', qty: 1, unit: 'EA', unitPrice: 999999.99, taxPercent: 20 },
      { pos: 2, description: 'Installation & Integration', qty: 1, unit: 'EA', unitPrice: 500000.00, taxPercent: 20 },
    ],
    payment: { means: 'Wire Transfer', iban: 'FR7630006000011234567890189', terms: 'Net 90' },
  },
  // 27. Very small amounts
  {
    filename: '27-small-amounts.pdf', title: 'FACTUUR', docType: 'Factuur', targetFormat: 'NLCIUS',
    invoiceNumber: 'NL-2024-027', invoiceDate: '2024-11-11', dueDate: '2024-12-11', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Micro Parts B.V.', street: 'Kleine Straat 1', city: 'Eindhoven', zip: '5611 AB', country: 'Nederland', countryCode: 'NL', vatId: 'NL444555666B01', registrationId: '87654321', registrationLabel: 'KVK' },
    buyer: { name: 'Electronics Assembly B.V.', street: 'Componentweg 50', city: 'Eindhoven', zip: '5612 CD', country: 'Nederland', countryCode: 'NL', registrationId: '11223344556677889900', registrationLabel: 'OIN', buyerReference: 'EA-MICRO-2024' },
    lineItems: [
      { pos: 1, description: 'Resistor 10kΩ', qty: 10000, unit: 'Stk', unitPrice: 0.01, taxPercent: 21 },
      { pos: 2, description: 'Capacitor 100nF', qty: 5000, unit: 'Stk', unitPrice: 0.02, taxPercent: 21 },
      { pos: 3, description: 'LED 5mm red', qty: 2000, unit: 'Stk', unitPrice: 0.03, taxPercent: 21 },
    ],
    payment: { means: 'Bankoverschrijving', iban: 'NL91ABNA0417164300', terms: '14 dagen' },
  },
  // 28. Document-level discount
  {
    filename: '28-doc-discount.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-028', invoiceDate: '2024-11-12', dueDate: '2024-12-12', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Möbelhaus Schmidt GmbH', street: 'Einrichtungsstr. 10', city: 'Köln', zip: '50667', country: 'Deutschland', countryCode: 'DE', vatId: 'DE888999000' },
    buyer: { name: 'Büroeinrichtung Rhein AG', street: 'Rheinuferstr. 5', city: 'Bonn', zip: '53111', country: 'Deutschland', countryCode: 'DE', buyerReference: '05314000-BER-01' },
    lineItems: [
      { pos: 1, description: 'Konferenztisch Eiche', qty: 1, unit: 'Stk', unitPrice: 2800.00, taxPercent: 19 },
      { pos: 2, description: 'Konferenzstuhl (10er Set)', qty: 1, unit: 'Set', unitPrice: 3500.00, taxPercent: 19 },
    ],
    allowances: [{ description: 'Treuerabatt 10%', amount: 630.00, isCharge: false, percent: 10 }],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
  },
  // 29. Document-level charge
  {
    filename: '29-doc-charge.pdf', title: 'FACTURE', docType: 'Facture', targetFormat: 'Factur-X Basic',
    invoiceNumber: 'FA-2024-029', invoiceDate: '2024-11-13', dueDate: '2024-12-13', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Meubles Express SARL', street: '100 Route de Meuble', city: 'Marseille', zip: '13001', country: 'France', countryCode: 'FR', vatId: 'FR66778899001', registrationId: '444 555 666', registrationLabel: 'SIREN' },
    buyer: { name: 'Bureau Moderne SAS', street: '25 Rue du Commerce', city: 'Marseille', zip: '13002', country: 'France', countryCode: 'FR', buyerReference: 'BM-2024-029' },
    lineItems: [
      { pos: 1, description: 'Bureau direction noyer', qty: 1, unit: 'Pce', unitPrice: 1200.00, taxPercent: 20 },
    ],
    allowances: [{ description: 'Frais de livraison', amount: 150.00, isCharge: true }],
    payment: { means: 'Virement', iban: 'FR7612345678901234567890123', terms: '30 jours' },
  },
  // 30. Both discount + charge
  {
    filename: '30-discount-and-charge.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-030', invoiceDate: '2024-11-14', dueDate: '2024-12-14', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Office World NV', street: 'Industrielaan 20', city: 'Antwerpen', zip: '2000', country: 'Belgium', countryCode: 'BE', vatId: 'BE0111222333', endpoint: 'invoices@officeworld.be', endpointScheme: '0204' },
    buyer: { name: 'Tech Startup BV', street: 'Startupweg 5', city: 'Ghent', zip: '9000', country: 'Belgium', countryCode: 'BE', vatId: 'BE0444555666', buyerReference: 'TS-PO-2024-30' },
    lineItems: [
      { pos: 1, description: 'Standing desk electric', qty: 10, unit: 'EA', unitPrice: 650.00, taxPercent: 21 },
      { pos: 2, description: 'Monitor arm dual', qty: 10, unit: 'EA', unitPrice: 120.00, taxPercent: 21 },
    ],
    allowances: [
      { description: 'Volume discount', amount: 385.00, isCharge: false, percent: 5 },
      { description: 'Express delivery surcharge', amount: 200.00, isCharge: true },
    ],
    payment: { means: 'Bank Transfer', iban: 'BE68539007547034', terms: 'Net 30' },
  },
  // 31. Line-level allowances
  {
    filename: '31-line-allowances.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung UBL',
    invoiceNumber: 'RE-2024-031', invoiceDate: '2024-11-15', dueDate: '2024-12-15', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'IT-Shop Direkt GmbH', street: 'Technikstr. 55', city: 'Nürnberg', zip: '90402', country: 'Deutschland', countryCode: 'DE', vatId: 'DE111000999' },
    buyer: { name: 'Gymnasium Nürnberg', street: 'Schulweg 1', city: 'Nürnberg', zip: '90403', country: 'Deutschland', countryCode: 'DE', buyerReference: '09564000-GYM-01' },
    lineItems: [
      { pos: 1, description: 'Laptop Bildung 14"', qty: 30, unit: 'Stk', unitPrice: 699.00, taxPercent: 19 },
      { pos: 2, description: 'Tablet 10" mit Stift', qty: 30, unit: 'Stk', unitPrice: 449.00, taxPercent: 19 },
      { pos: 3, description: 'Schutzhülle', qty: 60, unit: 'Stk', unitPrice: 25.00, taxPercent: 19 },
    ],
    lineAllowances: [
      { linePos: 1, description: 'Bildungsrabatt 15%', amount: 3145.50 },
      { linePos: 2, description: 'Bildungsrabatt 10%', amount: 1347.00 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
    notes: 'Bildungsrabatte gemäß Rahmenvertrag EDU-2024.',
  },
  // 32. SEPA IBAN+BIC
  {
    filename: '32-sepa-payment.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-032', invoiceDate: '2024-11-16', dueDate: '2024-12-16', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Handwerk Meister GmbH', street: 'Werkstattweg 12', city: 'Dresden', zip: '01067', country: 'Deutschland', countryCode: 'DE', vatId: 'DE222111000', email: 'rechnung@handwerk-meister.de' },
    buyer: { name: 'Hausverwaltung Elbe GmbH', street: 'Elbstr. 30', city: 'Dresden', zip: '01069', country: 'Deutschland', countryCode: 'DE', buyerReference: '14612000-HVE-01' },
    lineItems: [
      { pos: 1, description: 'Sanitärinstallation Bad komplett', qty: 1, unit: 'Psch', unitPrice: 4500.00, taxPercent: 19 },
      { pos: 2, description: 'Material Sanitär', qty: 1, unit: 'Psch', unitPrice: 1800.00, taxPercent: 19 },
    ],
    payment: { means: 'SEPA-Überweisung', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', terms: '14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen' },
    notes: 'Bitte bei Zahlung die Rechnungsnummer angeben.',
  },
  // 33. PayPal
  {
    filename: '33-paypal-payment.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'Factur-X Basic',
    invoiceNumber: 'INV-2024-033', invoiceDate: '2024-11-17', dueDate: '2024-12-17', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Digital Freelancer Pierre Dupont', street: '5 Rue Numérique', city: 'Bordeaux', zip: '33000', country: 'France', countryCode: 'FR', vatId: 'FR33445566778', registrationId: '777 888 999', registrationLabel: 'SIREN' },
    buyer: { name: 'Web Agency Amsterdam', street: 'Prinsengracht 200', city: 'Amsterdam', zip: '1016 HH', country: 'Netherlands', countryCode: 'NL', vatId: 'NL777888999B01', buyerReference: 'WA-2024-033' },
    lineItems: [
      { pos: 1, description: 'UI/UX Design - Mobile App', qty: 40, unit: 'Hours', unitPrice: 85.00, taxPercent: 0, taxCategory: 'AE' },
    ],
    payment: { means: 'PayPal', paypalEmail: 'pierre.dupont@paypal.fr', terms: 'Due on receipt' },
    notes: 'Reverse charge: VAT to be paid by recipient. Payment via PayPal only.',
  },
  // 34. Multiple payment means
  {
    filename: '34-multiple-payment.pdf', title: 'FATTURA', docType: 'Fattura', targetFormat: 'FatturaPA',
    invoiceNumber: 'FT-2024-034', invoiceDate: '2024-11-18', dueDate: '2025-01-18', currency: 'EUR', currencySymbol: '€',
    codiceDestinatario: '0000000',
    seller: { name: 'Catering Italiano S.r.l.', street: 'Via Garibaldi 15', city: 'Firenze', zip: '50123', country: 'Italia', countryCode: 'IT', vatId: 'IT55667788901' },
    buyer: { name: 'Evento Grande S.p.A.', street: 'Piazza della Signoria 1', city: 'Firenze', zip: '50122', country: 'Italia', countryCode: 'IT', vatId: 'IT11223344556' },
    lineItems: [
      { pos: 1, description: 'Servizio catering evento (200 persone)', qty: 1, unit: 'Serv', unitPrice: 12000.00, taxPercent: 10 },
      { pos: 2, description: 'Allestimento sala', qty: 1, unit: 'Serv', unitPrice: 3000.00, taxPercent: 22 },
    ],
    payment: { means: 'Bonifico bancario + Carta di credito', iban: 'IT60X0542811101000000123456', bic: 'BPMOIT22XXX', additionalMeans: 'Visa ending 4242 (50%)', terms: '50% anticipo, 50% a 30 giorni' },
  },
  // 35. Prepaid amount
  {
    filename: '35-prepaid-amount.pdf', title: 'RECHNUNG', docType: 'Schlussrechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'SR-2024-035', invoiceDate: '2024-11-19', dueDate: '2024-12-19', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Bau & Renovierung GmbH', street: 'Baustr. 100', city: 'Hannover', zip: '30159', country: 'Deutschland', countryCode: 'DE', vatId: 'DE333222111' },
    buyer: { name: 'Wohnungsbaugesellschaft Nord', street: 'Wohnallee 50', city: 'Hannover', zip: '30161', country: 'Deutschland', countryCode: 'DE', buyerReference: '03241000-WBN-01' },
    lineItems: [
      { pos: 1, description: 'Dachsanierung Komplett', qty: 1, unit: 'Psch', unitPrice: 45000.00, taxPercent: 19 },
      { pos: 2, description: 'Fassadenreinigung', qty: 500, unit: 'qm', unitPrice: 12.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', terms: '30 Tage netto', prepaidAmount: 20000.00 },
    notes: 'Schlussrechnung. Anzahlung von 20.000,00 EUR bereits erhalten (AR-2024-001).',
  },
  // 36. GBP
  {
    filename: '36-gbp-invoice.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-036', invoiceDate: '2024-11-20', dueDate: '2024-12-20', currency: 'GBP', currencySymbol: '£',
    seller: { name: 'London Consulting Group Ltd', street: '100 Cheapside', city: 'London', zip: 'EC2V 6DT', country: 'United Kingdom', countryCode: 'GB', vatId: 'GB987654321' },
    buyer: { name: 'Manchester City Council', street: 'Town Hall, Albert Square', city: 'Manchester', zip: 'M60 2LA', country: 'United Kingdom', countryCode: 'GB', buyerReference: 'MCC-2024-036' },
    lineItems: [
      { pos: 1, description: 'Strategic consulting services', qty: 20, unit: 'Days', unitPrice: 1500.00, taxPercent: 20 },
      { pos: 2, description: 'Report production', qty: 1, unit: 'EA', unitPrice: 5000.00, taxPercent: 20 },
    ],
    payment: { means: 'BACS Transfer', iban: 'GB29NWBK60161331926819', bic: 'NWBKGB2L', terms: 'Net 30' },
  },
  // 37. CHF
  {
    filename: '37-chf-invoice.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'Factur-X EN16931',
    invoiceNumber: 'CH-2024-037', invoiceDate: '2024-11-21', dueDate: '2024-12-21', currency: 'CHF', currencySymbol: 'CHF ',
    seller: { name: 'Swiss Precision AG', street: 'Bahnhofstrasse 50', city: 'Zürich', zip: '8001', country: 'Schweiz', countryCode: 'CH', vatId: 'CHE-123.456.789 MWST' },
    buyer: { name: 'Uhrenfabrik Basel GmbH', street: 'Rheinweg 10', city: 'Basel', zip: '4058', country: 'Schweiz', countryCode: 'CH', buyerReference: 'UF-2024-037' },
    lineItems: [
      { pos: 1, description: 'Präzisionswerkzeug Set A', qty: 5, unit: 'Set', unitPrice: 2400.00, taxPercent: 8.1 },
      { pos: 2, description: 'Kalibrierungsservice', qty: 10, unit: 'Std', unitPrice: 180.00, taxPercent: 8.1 },
    ],
    payment: { means: 'Banküberweisung', iban: 'CH9300762011623852957', bic: 'UBSWCHZH80A', terms: '30 Tage netto' },
  },
  // 38. USD
  {
    filename: '38-usd-invoice.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'USD-2024-038', invoiceDate: '2024-11-22', dueDate: '2024-12-22', currency: 'USD', currencySymbol: '$',
    seller: { name: 'Atlantic Trade B.V.', street: 'Haven 100', city: 'Rotterdam', zip: '3011 AA', country: 'Netherlands', countryCode: 'NL', vatId: 'NL555666777B01' },
    buyer: { name: 'US Import Corp', street: '500 Harbor Blvd', city: 'Long Beach', zip: '90802', country: 'United States', countryCode: 'US', buyerReference: 'USIMP-2024-038' },
    lineItems: [
      { pos: 1, description: 'Industrial equipment export', qty: 2, unit: 'EA', unitPrice: 35000.00, taxPercent: 0, taxCategory: 'Z' },
    ],
    payment: { means: 'Wire Transfer (USD)', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', terms: 'Net 60' },
    notes: 'Zero-rated export outside EU.',
  },
  // 39. PLN (for KSeF)
  {
    filename: '39-pln-ksef.pdf', title: 'FAKTURA', docType: 'Faktura VAT', targetFormat: 'KSeF FA(2)',
    invoiceNumber: 'FV/2024/11/039', invoiceDate: '2024-11-23', dueDate: '2024-12-23', currency: 'PLN', currencySymbol: 'zł',
    seller: { name: 'Technologie Przyszłości Sp. z o.o.', street: 'ul. Nowy Świat 50', city: 'Warszawa', zip: '00-363', country: 'Polska', countryCode: 'PL', vatId: 'PL5551234567', registrationId: '5551234567', registrationLabel: 'NIP' },
    buyer: { name: 'Polska Agencja Kosmiczna', street: 'ul. Trzy Krzyże 3/5', city: 'Warszawa', zip: '00-507', country: 'Polska', countryCode: 'PL', vatId: 'PL9998887776', registrationId: '9998887776', registrationLabel: 'NIP' },
    lineItems: [
      { pos: 1, description: 'Oprogramowanie do analizy danych satelitarnych', qty: 1, unit: 'lic.', unitPrice: 85000.00, taxPercent: 23 },
      { pos: 2, description: 'Wsparcie techniczne (12 mies.)', qty: 12, unit: 'mies.', unitPrice: 3500.00, taxPercent: 23 },
    ],
    payment: { means: 'Przelew bankowy', iban: 'PL61109010140000071219812874', terms: '21 dni' },
  },
  // 40. RON
  {
    filename: '40-ron-invoice.pdf', title: 'FACTURĂ', docType: 'Factură fiscală', targetFormat: 'CIUS-RO',
    invoiceNumber: 'RO-2024-040', invoiceDate: '2024-11-24', dueDate: '2024-12-24', currency: 'RON', currencySymbol: 'RON ',
    seller: { name: 'Tehnologie Avansată S.R.L.', street: 'Bulevardul Unirii 50', city: 'București', zip: '030167', country: 'România', countryCode: 'RO', vatId: 'RO44556677', registrationId: 'J40/5678/2021', registrationLabel: 'CUI' },
    buyer: { name: 'Spitalul Universitar București', street: 'Splaiul Independenței 169', city: 'București', zip: '050098', country: 'România', countryCode: 'RO', vatId: 'RO11223344', registrationId: 'J40/9012/2015', registrationLabel: 'CUI', buyerReference: 'SUB-ACH-2024-040' },
    lineItems: [
      { pos: 1, description: 'Sistem informatic medical', qty: 1, unit: 'Buc', unitPrice: 150000.00, taxPercent: 19 },
      { pos: 2, description: 'Instruire personal (5 zile)', qty: 5, unit: 'Zi', unitPrice: 2000.00, taxPercent: 19 },
    ],
    payment: { means: 'Transfer bancar', iban: 'RO49AAAA1B31007593840000', terms: '30 zile' },
  },
  // 41. Very long company names
  {
    filename: '41-long-company-names.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-041', invoiceDate: '2024-11-25', dueDate: '2024-12-25', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'The International Consortium for Advanced Technology Solutions and Digital Transformation Services in the European Economic Area - Western Division Headquarters Operating Unit for Special Projects and Innovations GmbH & Co. KG', street: 'Langename Str. 1', city: 'Berlin', zip: '10115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE999888777' },
    buyer: { name: 'Vereinigung der Europäischen Forschungsinstitute für Nachhaltige Energiegewinnung und Umweltschutztechnologien im Rahmen der Deutsch-Französischen Zusammenarbeit für Innovation und Wissenschaftlichen Fortschritt e.V.', street: 'Forschungsallee 100', city: 'München', zip: '80333', country: 'Deutschland', countryCode: 'DE', buyerReference: 'VEFI-2024-041' },
    lineItems: [
      { pos: 1, description: 'Consulting services', qty: 10, unit: 'Days', unitPrice: 1200.00, taxPercent: 19 },
    ],
    payment: { means: 'Bank Transfer', iban: 'DE89370400440532013000', terms: 'Net 30' },
  },
  // 42. Special characters
  {
    filename: '42-special-characters.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-042', invoiceDate: '2024-11-26', dueDate: '2024-12-26', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Bäckerei Müller & Söhne OHG', street: 'Königstraße 15', city: 'Nürnberg', zip: '90402', country: 'Deutschland', countryCode: 'DE', vatId: 'DE111222333', taxNumber: '09/123/45678' },
    buyer: { name: 'Café Résumé & Spécialités françaises', street: 'Große Bleiche 42', city: 'Mainz', zip: '55116', country: 'Deutschland', countryCode: 'DE', buyerReference: '07315000-CAFE-01' },
    lineItems: [
      { pos: 1, description: 'Brötchen "Körner-Knüller" (Größe XL)', qty: 500, unit: 'Stk', unitPrice: 0.85, taxPercent: 7 },
      { pos: 2, description: 'Croissant à la française', qty: 200, unit: 'Stk', unitPrice: 1.20, taxPercent: 7 },
      { pos: 3, description: 'Laugenbrezeln (Spezialität)', qty: 300, unit: 'Stk', unitPrice: 0.95, taxPercent: 7 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '14 Tage' },
  },
  // 43. Minimal fields
  {
    filename: '43-minimal-fields.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'Factur-X Basic',
    invoiceNumber: 'INV-2024-043', invoiceDate: '2024-11-27', dueDate: '2024-12-27', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'J. Smith', street: 'Main Rd 1', city: 'Dublin', zip: 'D01', country: 'Ireland', countryCode: 'IE' },
    buyer: { name: 'A. Jones', street: 'High St 2', city: 'Cork', zip: 'T12', country: 'Ireland', countryCode: 'IE' },
    lineItems: [
      { pos: 1, description: 'Service', qty: 1, unit: 'EA', unitPrice: 100.00, taxPercent: 23 },
    ],
  },
  // 44. PO Box address
  {
    filename: '44-po-box-address.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0',
    invoiceNumber: 'INV-2024-044', invoiceDate: '2024-11-28', dueDate: '2024-12-28', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Mail Order Services GmbH', street: 'Postfach 12 34 56', city: 'Frankfurt', zip: '60047', country: 'Deutschland', countryCode: 'DE', vatId: 'DE444333222' },
    buyer: { name: 'PO Box Receiver Ltd', street: 'P.O. Box 9876', city: 'London', zip: 'EC1A 1BB', country: 'United Kingdom', countryCode: 'GB', buyerReference: 'POBR-2024-044' },
    lineItems: [
      { pos: 1, description: 'Document processing service', qty: 500, unit: 'Docs', unitPrice: 2.50, taxPercent: 0, taxCategory: 'Z' },
    ],
    payment: { means: 'Bank Transfer', iban: 'DE89370400440532013000', terms: 'Net 30' },
    notes: 'Export: zero-rated.',
  },
  // 45. Multiple address lines
  {
    filename: '45-multiple-address-lines.pdf', title: 'FATTURA', docType: 'Fattura', targetFormat: 'FatturaPA',
    invoiceNumber: 'FT-2024-045', invoiceDate: '2024-11-29', dueDate: '2024-12-29', currency: 'EUR', currencySymbol: '€',
    codiceDestinatario: 'XXXXXXX',
    seller: { name: 'Servizi Professionali S.r.l.', street: 'Via Giuseppe Verdi 10', street2: 'Palazzo Rossi, Piano 3, Int. 12', city: 'Roma', zip: '00187', country: 'Italia', countryCode: 'IT', vatId: 'IT99887766554' },
    buyer: { name: 'Azienda Sanitaria Locale Roma 1', street: 'Borgo Santo Spirito 3', street2: 'c/o Direzione Amministrativa, Edificio B, Ala Nord', city: 'Roma', zip: '00193', country: 'Italia', countryCode: 'IT', vatId: 'IT66554433221' },
    lineItems: [
      { pos: 1, description: 'Consulenza amministrativa', qty: 20, unit: 'Ore', unitPrice: 90.00, taxPercent: 22 },
    ],
    payment: { means: 'Bonifico', iban: 'IT60X0542811101000000123456', terms: '60 giorni' },
  },
  // 46. Missing buyer reference (fail XRechnung)
  {
    filename: '46-missing-buyer-ref.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII (SHOULD FAIL)',
    invoiceNumber: 'RE-2024-046', invoiceDate: '2024-12-01', dueDate: '2024-12-31', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Test Firma GmbH', street: 'Teststr. 1', city: 'Berlin', zip: '10115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE123123123' },
    buyer: { name: 'Behörde ohne Referenz', street: 'Amtsweg 5', city: 'Berlin', zip: '10117', country: 'Deutschland', countryCode: 'DE' },
    lineItems: [
      { pos: 1, description: 'Dienstleistung', qty: 1, unit: 'Stk', unitPrice: 1000.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
    notes: 'VALIDATION TEST: Missing Leitweg-ID / buyer reference. Should fail XRechnung validation (BT-10 is mandatory).',
  },
  // 47. Missing seller VAT (fail PEPPOL)
  {
    filename: '47-missing-seller-vat.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0 (SHOULD FAIL)',
    invoiceNumber: 'INV-2024-047', invoiceDate: '2024-12-02', dueDate: '2025-01-01', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'No VAT Company Ltd', street: '1 Anonymous Lane', city: 'Dublin', zip: 'D01 X1X1', country: 'Ireland', countryCode: 'IE' },
    buyer: { name: 'Buyer With VAT B.V.', street: 'Keizersgracht 50', city: 'Amsterdam', zip: '1015 AA', country: 'Netherlands', countryCode: 'NL', vatId: 'NL123456789B01', buyerReference: 'BWV-2024-047' },
    lineItems: [
      { pos: 1, description: 'Services rendered', qty: 1, unit: 'EA', unitPrice: 5000.00, taxPercent: 21 },
    ],
    payment: { means: 'Bank Transfer', iban: 'IE29AIBK93115212345678', terms: 'Net 30' },
    notes: 'VALIDATION TEST: Seller has no VAT ID. Should fail PEPPOL validation (BT-31 or BT-32 required).',
  },
  // 48. Invalid country code
  {
    filename: '48-invalid-country.pdf', title: 'INVOICE', docType: 'Invoice', targetFormat: 'PEPPOL BIS 3.0 (SHOULD FAIL)',
    invoiceNumber: 'INV-2024-048', invoiceDate: '2024-12-03', dueDate: '2025-01-02', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Weird Country Corp', street: 'Str. 1', city: 'Somewhere', zip: '00000', country: 'Atlantis', countryCode: 'XX', vatId: 'XX123456789' },
    buyer: { name: 'Normal Buyer GmbH', street: 'Normalstr. 1', city: 'Berlin', zip: '10115', country: 'Deutschland', countryCode: 'DE', vatId: 'DE111222333', buyerReference: 'NB-2024-048' },
    lineItems: [
      { pos: 1, description: 'Mystery product', qty: 1, unit: 'EA', unitPrice: 999.00, taxPercent: 0, taxCategory: 'Z' },
    ],
    notes: 'VALIDATION TEST: Invalid country code XX. Should fail format validation.',
  },
  // 49. Negative line amounts
  {
    filename: '49-negative-amounts.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung UBL',
    invoiceNumber: 'RE-2024-049', invoiceDate: '2024-12-04', dueDate: '2025-01-03', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Rückgabe Service GmbH', street: 'Retourenstr. 5', city: 'Leipzig', zip: '04109', country: 'Deutschland', countryCode: 'DE', vatId: 'DE555444333' },
    buyer: { name: 'Einkauf Zentral GmbH', street: 'Bestellweg 10', city: 'Leipzig', zip: '04107', country: 'Deutschland', countryCode: 'DE', buyerReference: '14713000-EZ-01' },
    lineItems: [
      { pos: 1, description: 'Produkt A (Lieferung)', qty: 10, unit: 'Stk', unitPrice: 50.00, taxPercent: 19 },
      { pos: 2, description: 'Produkt A (Retoure)', qty: -3, unit: 'Stk', unitPrice: 50.00, taxPercent: 19 },
      { pos: 3, description: 'Gutschrift Transportschaden', qty: 1, unit: 'Psch', unitPrice: -25.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '14 Tage' },
    notes: 'VALIDATION TEST: Contains negative line amounts for returns and damage credit.',
  },
  // 50. Duplicate invoice number format
  {
    filename: '50-duplicate-number.pdf', title: 'RECHNUNG', docType: 'Rechnung', targetFormat: 'XRechnung CII',
    invoiceNumber: 'RE-2024-001', invoiceDate: '2024-12-05', dueDate: '2025-01-04', currency: 'EUR', currencySymbol: '€',
    seller: { name: 'Duplikat Test GmbH', street: 'Doppelstr. 2', city: 'Hamburg', zip: '20095', country: 'Deutschland', countryCode: 'DE', vatId: 'DE777666555' },
    buyer: { name: 'Empfänger Test GmbH', street: 'Testplatz 1', city: 'Hamburg', zip: '20099', country: 'Deutschland', countryCode: 'DE', buyerReference: '02000000-DUP-01' },
    lineItems: [
      { pos: 1, description: 'Testposition', qty: 1, unit: 'Stk', unitPrice: 250.00, taxPercent: 19 },
    ],
    payment: { means: 'Überweisung', iban: 'DE89370400440532013000', terms: '30 Tage' },
    notes: 'VALIDATION TEST: Duplicate invoice number RE-2024-001 (same as invoice #1). Should be detected as duplicate.',
  },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`Generating ${invoices.length} test invoices in ${OUT_DIR}...`);

  for (const inv of invoices) {
    try {
      await generateInvoicePDF(inv);
      console.log(`  ✓ ${inv.filename}`);
    } catch (err) {
      console.error(`  ✗ ${inv.filename}: ${err}`);
    }
  }

  // Verify
  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`\nDone! ${files.length} PDF files created.`);
  if (files.length < 50) {
    console.error(`WARNING: Expected 50, got ${files.length}`);
    process.exit(1);
  }
}

main().catch(console.error);
