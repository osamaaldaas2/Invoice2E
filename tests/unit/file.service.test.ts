import { describe, it, expect, beforeEach } from 'vitest';
import { FileService } from '@/services/file.service';
import { ValidationError } from '@/lib/errors';

describe('FileService', () => {
    let service: FileService;

    beforeEach(() => {
        service = new FileService();
    });

    describe('validateFile', () => {
        it('should reject files with invalid type', () => {
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            expect(() => service.validateFile(file)).toThrow(ValidationError);
        });

        it('should accept PDF files', () => {
            const file = new File(['pdf content'], 'invoice.pdf', { type: 'application/pdf' });
            expect(service.validateFile(file)).toBe(true);
        });

        it('should accept JPEG files', () => {
            const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });
            expect(service.validateFile(file)).toBe(true);
        });

        it('should accept PNG files', () => {
            const file = new File(['image data'], 'scan.png', { type: 'image/png' });
            expect(service.validateFile(file)).toBe(true);
        });

        it('should reject files exceeding size limit', () => {
            // Create a mock file that claims to be 30MB
            const content = new ArrayBuffer(30 * 1024 * 1024);
            const file = new File([content], 'large.pdf', { type: 'application/pdf' });
            expect(() => service.validateFile(file)).toThrow(ValidationError);
        });
    });

    describe('getFileExtension', () => {
        it('should extract pdf extension', () => {
            expect(service.getFileExtension('invoice.pdf')).toBe('pdf');
        });

        it('should extract jpg extension', () => {
            expect(service.getFileExtension('photo.jpg')).toBe('jpg');
        });

        it('should extract png extension', () => {
            expect(service.getFileExtension('scan.png')).toBe('png');
        });

        it('should handle files without extension', () => {
            expect(service.getFileExtension('noextension')).toBe('noextension');
        });

        it('should handle multiple dots in filename', () => {
            expect(service.getFileExtension('invoice.2024.01.pdf')).toBe('pdf');
        });
    });

    describe('generateFileName', () => {
        it('should generate filename with userId and timestamp', () => {
            const fileName = service.generateFileName('invoice.pdf', 'user123');
            expect(fileName).toMatch(/^user123_\d+\.pdf$/);
        });

        it('should generate filename with correct format', () => {
            const fileName1 = service.generateFileName('invoice.pdf', 'user123');
            const fileName2 = service.generateFileName('invoice.pdf', 'user456');
            // Different users should have different prefixes
            expect(fileName1).toContain('user123');
            expect(fileName2).toContain('user456');
        });

        it('should preserve file extension', () => {
            const pdfName = service.generateFileName('doc.pdf', 'user1');
            const jpgName = service.generateFileName('img.jpg', 'user1');
            expect(pdfName).toContain('.pdf');
            expect(jpgName).toContain('.jpg');
        });
    });

    describe('formatFileSize', () => {
        it('should format bytes', () => {
            expect(service.formatFileSize(500)).toBe('500 B');
        });

        it('should format kilobytes', () => {
            expect(service.formatFileSize(1536)).toBe('1.5 KB');
        });

        it('should format megabytes', () => {
            expect(service.formatFileSize(2.5 * 1024 * 1024)).toBe('2.50 MB');
        });
    });

    describe('validatePdfStructure', () => {
        it('should accept valid PDF buffer', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4 content here');
            const result = await service.validatePdfStructure(pdfBuffer);
            expect(result).toBe(true);
        });

        it('should reject invalid PDF buffer', async () => {
            const invalidBuffer = Buffer.from('not a pdf');
            await expect(service.validatePdfStructure(invalidBuffer)).rejects.toThrow(ValidationError);
        });
    });

    describe('validateImageStructure', () => {
        it('should accept valid JPEG buffer', async () => {
            const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
            const result = await service.validateImageStructure(jpegBuffer, 'image/jpeg');
            expect(result).toBe(true);
        });

        it('should reject invalid JPEG buffer', async () => {
            const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
            await expect(
                service.validateImageStructure(invalidBuffer, 'image/jpeg')
            ).rejects.toThrow(ValidationError);
        });

        it('should accept valid PNG buffer', async () => {
            const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
            const result = await service.validateImageStructure(pngBuffer, 'image/png');
            expect(result).toBe(true);
        });

        it('should reject invalid PNG buffer', async () => {
            const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            await expect(
                service.validateImageStructure(invalidBuffer, 'image/png')
            ).rejects.toThrow(ValidationError);
        });
    });
});
