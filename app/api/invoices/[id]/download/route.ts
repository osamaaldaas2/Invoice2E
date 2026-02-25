/**
 * Invoice PDF Download Route
 * Authenticated endpoint to download a user's invoice as a PDF.
 *
 * @route GET /api/invoices/[id]/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { invoiceDbService } from '@/services/invoice/invoice.db.service';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // P2-4: Rate limit download endpoint
    const rateLimitId = `${getRequestIdentifier(req)}:invoice-download:${user.id}`;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'download');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
      );
    }

    const { id: invoiceId } = await params;

    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const { pdfBuffer, invoiceNumber } = await invoiceDbService.getInvoicePdfWithNumber(invoiceId, user.id);

    if (!pdfBuffer) {
      return NextResponse.json(
        { error: 'PDF not available for this invoice' },
        { status: 404 }
      );
    }

    const filename = `Rechnung_${invoiceNumber}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse BodyInit compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to download invoice PDF', {
      message: 'Failed to download invoice',
    });
  }
}
