import { describe, it, expect } from 'vitest';
import { cn, formatDate, formatCurrency, validateEmail } from '@/lib/utils';

describe('Utils', () => {
    describe('cn()', () => {
        it('should merge class names correctly', () => {
            const result = cn('px-2', 'py-2', 'bg-blue-600');
            expect(result).toBe('px-2 py-2 bg-blue-600');
        });

        it('should filter out false values', () => {
            const result = cn('px-2', false, 'py-2', null, 'bg-blue-600', undefined);
            expect(result).toBe('px-2 py-2 bg-blue-600');
        });
    });

    describe('validateEmail()', () => {
        it('should validate correct email', () => {
            expect(validateEmail('test@example.com')).toBe(true);
        });

        it('should reject invalid email', () => {
            expect(validateEmail('invalid-email')).toBe(false);
        });
    });

    describe('formatDate()', () => {
        it('should format date to German format', () => {
            const date = new Date('2024-01-30');
            const result = formatDate(date);
            expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
        });
    });

    describe('formatCurrency()', () => {
        it('should format currency to EUR', () => {
            const result = formatCurrency(100);
            expect(result).toContain('€');
        });
    });
});
