import { NextRequest, NextResponse } from 'next/server';
import { fileService } from '@/services/file.service';
import { logger } from '@/lib/logger';
import { ValidationError, AppError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * FIX (BUG-034): Added authentication requirement for file uploads
 * FIX (BUG-035): Sanitize filename to prevent path traversal
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // Require authentication for file uploads
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No file provided' },
                { status: 400 }
            );
        }

        // Sanitize filename to prevent path traversal attacks
        const sanitizedFileName = fileService.sanitizeFileName(file.name);

        // Validate file size and type
        fileService.validateFile(file);

        // Convert to buffer for processing
        const buffer = await fileService.fileToBuffer(file);

        // Validate file integrity (magic numbers)
        await fileService.validateFileIntegrity(buffer, file.type);

        logger.info('File uploaded successfully', {
            userId: user.id,
            fileName: sanitizedFileName,
            fileSize: file.size,
            fileType: file.type,
        });

        return NextResponse.json(
            {
                success: true,
                data: {
                    fileName: sanitizedFileName,
                    fileSize: file.size,
                    fileType: file.type,
                    formattedSize: fileService.formatFileSize(file.size),
                    uploadedAt: new Date().toISOString(),
                },
                message: 'File uploaded successfully',
            },
            { status: 200 }
        );
    } catch (error) {
        logger.error('File upload error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof ValidationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            );
        }

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

export async function OPTIONS(): Promise<NextResponse> {
    return NextResponse.json({}, { status: 200 });
}
