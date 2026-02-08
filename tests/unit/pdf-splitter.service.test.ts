import { describe, it, expect } from 'vitest';
import { PdfSplitterService } from '@/services/pdf-splitter.service';
import { PDFDocument } from 'pdf-lib';

describe('PdfSplitterService', () => {
    const service = new PdfSplitterService();

    async function createTestPdf(pageCount: number): Promise<Buffer> {
        const doc = await PDFDocument.create();
        for (let i = 0; i < pageCount; i++) {
            doc.addPage();
        }
        const bytes = await doc.save();
        return Buffer.from(bytes);
    }

    describe('getPageCount', () => {
        it('should return correct page count for a 1-page PDF', async () => {
            const pdf = await createTestPdf(1);
            const count = await service.getPageCount(pdf);
            expect(count).toBe(1);
        });

        it('should return correct page count for a multi-page PDF', async () => {
            const pdf = await createTestPdf(5);
            const count = await service.getPageCount(pdf);
            expect(count).toBe(5);
        });
    });

    describe('splitByPageGroups', () => {
        it('should split a 4-page PDF into 2 groups', async () => {
            const pdf = await createTestPdf(4);
            const groups = [[1, 2], [3, 4]];
            const results = await service.splitByPageGroups(pdf, groups);

            expect(results).toHaveLength(2);

            const count1 = await service.getPageCount(results[0]!);
            const count2 = await service.getPageCount(results[1]!);
            expect(count1).toBe(2);
            expect(count2).toBe(2);
        });

        it('should handle single-page groups', async () => {
            const pdf = await createTestPdf(3);
            const groups = [[1], [2], [3]];
            const results = await service.splitByPageGroups(pdf, groups);

            expect(results).toHaveLength(3);
            for (const buf of results) {
                const count = await service.getPageCount(buf);
                expect(count).toBe(1);
            }
        });

        it('should handle uneven page groups', async () => {
            const pdf = await createTestPdf(5);
            const groups = [[1, 2, 3], [4, 5]];
            const results = await service.splitByPageGroups(pdf, groups);

            expect(results).toHaveLength(2);
            const count1 = await service.getPageCount(results[0]!);
            const count2 = await service.getPageCount(results[1]!);
            expect(count1).toBe(3);
            expect(count2).toBe(2);
        });
    });
});
