import { describe, expect, it } from 'vitest';
import {
    sanitizeHtml,
    sanitizeText,
    sanitizeForDisplay,
    sanitizeObject,
    sanitizeArray
} from '@/lib/sanitizer';

describe('Sanitizer', () => {
    describe('sanitizeHtml', () => {
        it('should allow safe HTML tags', () => {
            const input = '<p>Hello <strong>World</strong></p>';
            const result = sanitizeHtml(input);
            expect(result).toContain('<p>');
            expect(result).toContain('<strong>');
        });

        it('should remove dangerous script tags', () => {
            const input = '<script>alert(1)</script><p>Safe</p>';
            const result = sanitizeHtml(input);
            expect(result).not.toContain('<script>');
            expect(result).toContain('<p>Safe</p>');
        });

        it('should remove onclick handlers', () => {
            const input = '<p onclick="alert(1)">Click me</p>';
            const result = sanitizeHtml(input);
            expect(result).not.toContain('onclick');
        });

        it('should keep class attribute', () => {
            const input = '<span class="highlight">Text</span>';
            const result = sanitizeHtml(input);
            expect(result).toContain('class="highlight"');
        });

        it('should remove style attribute', () => {
            const input = '<p style="color:red">Text</p>';
            const result = sanitizeHtml(input);
            expect(result).not.toContain('style=');
        });
    });

    describe('sanitizeText', () => {
        it('should strip all HTML tags', () => {
            const input = '<p>Hello <strong>World</strong></p>';
            const result = sanitizeText(input);
            expect(result).toBe('Hello World');
        });

        it('should trim whitespace', () => {
            const input = '  Hello World  ';
            const result = sanitizeText(input);
            expect(result).toBe('Hello World');
        });

        it('should handle script tags', () => {
            const input = '<script>alert(1)</script>Safe text';
            const result = sanitizeText(input);
            expect(result).not.toContain('<script>');
            expect(result).toContain('Safe text');
        });

        it('should handle empty input', () => {
            const result = sanitizeText('');
            expect(result).toBe('');
        });
    });

    describe('sanitizeForDisplay', () => {
        it('should return empty string for null', () => {
            expect(sanitizeForDisplay(null)).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(sanitizeForDisplay(undefined)).toBe('');
        });

        it('should sanitize string values', () => {
            const input = '<script>alert(1)</script>Hello';
            const result = sanitizeForDisplay(input);
            expect(result).not.toContain('<script>');
        });

        it('should convert numbers to string', () => {
            expect(sanitizeForDisplay(123)).toBe('123');
        });

        it('should convert booleans to string', () => {
            expect(sanitizeForDisplay(true)).toBe('true');
        });
    });

    describe('sanitizeObject', () => {
        it('should sanitize string values in object', () => {
            const input = {
                name: '<script>alert(1)</script>John',
                age: 30,
            };
            const result = sanitizeObject(input);
            expect(result.name).not.toContain('<script>');
            expect(result.age).toBe(30);
        });

        it('should handle nested objects', () => {
            const input = {
                user: {
                    name: '<b>John</b>',
                },
            };
            const result = sanitizeObject(input);
            expect(result.user.name).toBe('John');
        });

        it('should preserve non-string values', () => {
            const input = {
                count: 5,
                active: true,
                data: null,
            };
            const result = sanitizeObject(input);
            expect(result.count).toBe(5);
            expect(result.active).toBe(true);
        });
    });

    describe('sanitizeArray', () => {
        it('should sanitize string elements', () => {
            const input = ['<script>xss</script>', 'safe'];
            const result = sanitizeArray(input);
            expect(result[0]).not.toContain('<script>');
            expect(result[1]).toBe('safe');
        });

        it('should handle nested arrays', () => {
            const input = [['<b>bold</b>']];
            const result = sanitizeArray(input);
            expect((result[0] as string[])[0]).toBe('bold');
        });

        it('should preserve non-string values', () => {
            const input = [1, true, null];
            const result = sanitizeArray(input);
            expect(result).toEqual([1, true, null]);
        });
    });
});
