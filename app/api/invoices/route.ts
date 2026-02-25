/**
 * Invoices List Route
 * Returns the authenticated user's list of payment invoices.
 *
 * @route GET /api/invoices
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { invoiceDbService } from '@/services/invoice/invoice.db.service';
import { handleApiError } from '@/lib/api-helpers';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invoices = await invoiceDbService.getUserInvoices(user.id);

    return NextResponse.json(
      {
        success: true,
        data: invoices,
        total: invoices.length,
      },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  } catch (error) {
    return handleApiError(error, 'Failed to list invoices', {
      message: 'Failed to retrieve invoices',
    });
  }
}
