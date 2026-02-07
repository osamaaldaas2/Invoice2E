import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock dependencies
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

import { sanitizeInput, sanitizeHtml, sanitizeFilename } from '@/lib/sanitizer';

describe('Sanitizer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('sanitizeInput', () => {
        it('should return empty string for null/undefined', () => {
            expect(sanitizeInput(null as unknown as string)).toBe('');
            expect(sanitizeInput(undefined as unknown as string)).toBe('');
        });

        it('should trim whitespace', () => {
            expect(sanitizeInput('  hello  ')).toBe('hello');
        });

        it('should remove script tags', () => {
            const input = '<script>alert("xss")</script>hello';
            const result = sanitizeInput(input);
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('alert');
        });

        it('should handle normal text', () => {
            expect(sanitizeInput('Hello World')).toBe('Hello World');
        });

        it('should remove event handlers', () => {
            const input = '<img onerror="alert(1)">';
            const result = sanitizeInput(input);
            expect(result).not.toContain('onerror');
        });
    });

    describe('sanitizeHtml', () => {
        it('should allow safe HTML tags', () => {
            const input = '<p>Hello <strong>World</strong></p>';
            const result = sanitizeHtml(input);
            expect(result).toContain('<p>');
            expect(result).toContain('<strong>');
        });

        it('should remove dangerous tags', () => {
            const input = '<script>alert(1)</script><p>Safe</p>';
            const result = sanitizeHtml(input);
            expect(result).not.toContain('<script>');
            expect(result).toContain('<p>Safe</p>');
        });
    });

    describe('sanitizeFilename', () => {
        it('should replace invalid characters', () => {
            const input = 'file<>:"/\\|?*.txt';
            const result = sanitizeFilename(input);
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
            expect(result).not.toContain(':');
            expect(result).not.toContain('"');
            expect(result).not.toContain('/');
            expect(result).not.toContain('\\');
            expect(result).not.toContain('|');
            expect(result).not.toContain('?');
            expect(result).not.toContain('*');
        });

        it('should handle normal filenames', () => {
            expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
        });

        it('should handle spaces', () => {
            const result = sanitizeFilename('my document.pdf');
            expect(result).toContain('document');
        });
    });
});
