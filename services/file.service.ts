import { logger } from '@/lib/logger';
import { ValidationError, AppError } from '@/lib/errors';
import { FILE_LIMITS } from '@/lib/constants';

export type FileUploadResult = {
    fileName: string;
    fileSize: number;
    fileType: string;
    buffer: Buffer;
    uploadedAt: Date;
};

/**
 * File service for handling file uploads and validation
 * Follows CONSTITUTION rules for error handling and validation
 */
export class FileService {
    /**
     * Validate file size and type
     */
    validateFile(file: File): boolean {
        if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            throw new ValidationError(
                `File size (${sizeMB}MB) exceeds maximum (${FILE_LIMITS.MAX_FILE_SIZE_MB}MB)`
            );
        }

        const allowedTypes = FILE_LIMITS.ALLOWED_MIME_TYPES as readonly string[];
        if (!allowedTypes.includes(file.type)) {
            throw new ValidationError(
                `File type ${file.type} not allowed. Allowed: PDF, JPG, PNG`
            );
        }

        return true;
    }

    /**
     * Convert File to Buffer for server-side processing
     */
    async fileToBuffer(file: File): Promise<Buffer> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            logger.error('Failed to convert file to buffer', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new AppError('FILE_ERROR', 'Failed to process file', 500);
        }
    }

    /**
     * Extract file extension from filename
     */
    getFileExtension(fileName: string): string {
        return fileName.split('.').pop()?.toLowerCase() || '';
    }

    /**
     * FIX (BUG-035): Sanitize filename to prevent path traversal and other attacks
     * Removes directory components and dangerous characters
     */
    sanitizeFileName(fileName: string): string {
        if (!fileName) return 'unnamed_file';

        // Remove any directory components (path traversal prevention)
        let sanitized = fileName.replace(/^.*[\\\/]/, '');

        // Remove null bytes
        sanitized = sanitized.replace(/\0/g, '');

        // Remove or replace dangerous characters
        sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

        // Prevent hidden files (starting with dot)
        if (sanitized.startsWith('.')) {
            sanitized = '_' + sanitized.substring(1);
        }

        // Limit filename length
        if (sanitized.length > 255) {
            const ext = this.getFileExtension(sanitized);
            const base = sanitized.substring(0, 250 - ext.length);
            sanitized = `${base}.${ext}`;
        }

        // Ensure we have a valid filename
        if (!sanitized || sanitized === '.' || sanitized === '..') {
            return 'unnamed_file';
        }

        return sanitized;
    }

    /**
     * Generate unique filename with userId and timestamp
     */
    generateFileName(originalName: string, userId: string): string {
        const timestamp = Date.now();
        const extension = this.getFileExtension(originalName);
        return `${userId}_${timestamp}.${extension}`;
    }

    /**
     * Validate PDF file structure using magic number
     */
    async validatePdfStructure(buffer: Buffer): Promise<boolean> {
        const pdfMagic = buffer.toString('latin1', 0, 4);
        if (!pdfMagic.startsWith('%PDF')) {
            throw new ValidationError('Invalid PDF file structure');
        }
        return true;
    }

    /**
     * Validate image file structure using magic numbers
     */
    async validateImageStructure(buffer: Buffer, fileType: string): Promise<boolean> {
        if (fileType === 'image/jpeg') {
            if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
                throw new ValidationError('Invalid JPEG file structure');
            }
        } else if (fileType === 'image/png') {
            const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
            const isValidPng = pngHeader.every((byte, i) => buffer[i] === byte);
            if (!isValidPng) {
                throw new ValidationError('Invalid PNG file structure');
            }
        }
        return true;
    }

    /**
     * Validate file integrity by checking magic numbers
     */
    async validateFileIntegrity(buffer: Buffer, fileType: string): Promise<boolean> {
        try {
            if (fileType === 'application/pdf') {
                return await this.validatePdfStructure(buffer);
            } else if (fileType.startsWith('image/')) {
                return await this.validateImageStructure(buffer, fileType);
            }
            return true;
        } catch (error) {
            logger.error('File validation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                fileType,
            });
            throw error;
        }
    }

    /**
     * Get human-readable file size
     */
    formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }
}

export const fileService = new FileService();
