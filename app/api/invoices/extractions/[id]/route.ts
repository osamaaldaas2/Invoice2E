import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    // SECURITY FIX (BUG-015): Add authentication check
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(user.id);

    const { id } = await params;
    const extraction = await invoiceDbService.getExtractionById(id, userClient);

    // SECURITY FIX (BUG-015): Add ownership verification
    if (extraction.userId !== user.id) {
      logger.warn('Unauthorized extraction access attempt', {
        extractionId: id,
        requesterId: user.id,
        ownerId: extraction.userId,
      });
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    logger.info('Extraction retrieved', { extractionId: id, userId: user.id });

    // Strip _originalExtraction snapshot from response to reduce payload size
    // (snapshot is preserved in DB for audit but not needed by frontend)
    const { _originalExtraction, ...cleanExtractionData } =
      (extraction.extractionData as Record<string, unknown>) || {};

    return NextResponse.json(
      {
        success: true,
        data: {
          ...extraction,
          extractionData: cleanExtractionData,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    let extractionId: string | undefined;
    try {
      extractionId = (await params).id;
    } catch {
      // params resolution failed
    }
    return handleApiError(error, 'Fetch extraction error', {
      includeSuccess: true,
      message: 'Internal server error',
      extra: { extractionId },
    });
  }
}
