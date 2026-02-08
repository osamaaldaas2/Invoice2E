import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoundaryDetectionService } from '@/services/boundary-detection.service';

// Mock dependencies
vi.mock('@/services/pdf-splitter.service', () => ({
    pdfSplitterService: {
        getPageCount: vi.fn(),
    },
}));

vi.mock('@/adapters/gemini.adapter', () => ({
    geminiAdapter: {
        sendPrompt: vi.fn(),
    },
}));

vi.mock('@/adapters/deepseek.adapter', () => ({
    deepseekAdapter: {
        sendPrompt: vi.fn(),
    },
}));

import { pdfSplitterService } from '@/services/pdf-splitter.service';
import { deepseekAdapter } from '@/adapters/deepseek.adapter';

describe('BoundaryDetectionService', () => {
    let service: BoundaryDetectionService;

    beforeEach(() => {
        vi.stubEnv('AI_PROVIDER', 'deepseek');
        service = new BoundaryDetectionService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return single invoice for non-PDF files', async () => {
        const result = await service.detect(Buffer.from('test'), 'image/jpeg');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('skip-non-pdf');
        expect(pdfSplitterService.getPageCount).not.toHaveBeenCalled();
    });

    it('should return single invoice for single-page PDFs', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(1);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('single-page');
    });

    it('should return single invoice fallback for oversized PDFs', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(100);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('too-many-pages');
    });

    it('should detect multiple invoices in multi-page PDF', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(4);

        const aiResponse = JSON.stringify({
            totalInvoices: 2,
            totalPages: 4,
            invoices: [
                { invoiceIndex: 1, pages: [1, 2], label: 'INV-001' },
                { invoiceIndex: 2, pages: [3, 4], label: 'INV-002' },
            ],
            confidence: 0.95,
        });

        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue(aiResponse);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(2);
        expect(result.invoices).toHaveLength(2);
        expect(result.invoices[0]!.label).toBe('INV-001');
        expect(result.invoices[1]!.label).toBe('INV-002');
        expect(result.confidence).toBe(0.95);
    });

    it('should handle AI response wrapped in markdown code block', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(3);

        const aiResponse = '```json\n' + JSON.stringify({
            totalInvoices: 2,
            totalPages: 3,
            invoices: [
                { invoiceIndex: 1, pages: [1, 2], label: 'INV-A' },
                { invoiceIndex: 2, pages: [3], label: 'INV-B' },
            ],
            confidence: 0.9,
        }) + '\n```';

        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue(aiResponse);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(2);
        expect(result.invoices[0]!.pages).toEqual([1, 2]);
        expect(result.invoices[1]!.pages).toEqual([3]);
    });

    it('should fallback to single invoice on low confidence', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(4);

        const aiResponse = JSON.stringify({
            totalInvoices: 2,
            totalPages: 4,
            invoices: [
                { invoiceIndex: 1, pages: [1, 2], label: 'INV-001' },
                { invoiceIndex: 2, pages: [3, 4], label: 'INV-002' },
            ],
            confidence: 0.3,
        });

        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue(aiResponse);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('low-confidence');
    });

    it('should fallback to single invoice when AI returns invalid JSON', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(3);
        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue('I cannot process this document');

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('error');
    });

    it('should fallback when AI returns duplicate pages', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(3);

        const aiResponse = JSON.stringify({
            totalInvoices: 2,
            totalPages: 3,
            invoices: [
                { invoiceIndex: 1, pages: [1, 2], label: 'INV-001' },
                { invoiceIndex: 2, pages: [2, 3], label: 'INV-002' },
            ],
            confidence: 0.9,
        });

        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue(aiResponse);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('error');
    });

    it('should fallback when pages do not cover all PDF pages', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(5);

        const aiResponse = JSON.stringify({
            totalInvoices: 2,
            totalPages: 5,
            invoices: [
                { invoiceIndex: 1, pages: [1, 2], label: 'INV-001' },
                { invoiceIndex: 2, pages: [3, 4], label: 'INV-002' },
            ],
            confidence: 0.9,
        });

        vi.mocked(deepseekAdapter.sendPrompt).mockResolvedValue(aiResponse);

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        // Page 5 is missing, should fallback
        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('error');
    });

    it('should fallback when page count error occurs', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockRejectedValue(new Error('corrupt PDF'));

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('page-count-error');
    });

    it('should fallback when AI adapter throws', async () => {
        vi.mocked(pdfSplitterService.getPageCount).mockResolvedValue(3);
        vi.mocked(deepseekAdapter.sendPrompt).mockRejectedValue(new Error('API error'));

        const result = await service.detect(Buffer.from('test'), 'application/pdf');

        expect(result.totalInvoices).toBe(1);
        expect(result.provider).toBe('error');
    });
});
