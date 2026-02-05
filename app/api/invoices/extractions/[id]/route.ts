import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/auth';

type RouteParams = {
    params: Promise<{ id: string }>;
};

export async function GET(
    request: NextRequest,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        // SECURITY FIX (BUG-015): Add authentication check
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const extraction = await invoiceDbService.getExtractionById(id);

        // SECURITY FIX (BUG-015): Add ownership verification
        if (extraction.userId !== user.id) {
            logger.warn('Unauthorized extraction access attempt', {
                extractionId: id,
                requesterId: user.id,
                ownerId: extraction.userId,
            });
            return NextResponse.json(
                { success: false, error: 'Access denied' },
                { status: 403 }
            );
        }

        logger.info('Extraction retrieved', { extractionId: id, userId: user.id });

        return NextResponse.json(
            {
                success: true,
                data: extraction,
            },
            { status: 200 }
        );
    } catch (error) {
        logger.error('Fetch extraction error', error);

        if (error instanceof AppError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
