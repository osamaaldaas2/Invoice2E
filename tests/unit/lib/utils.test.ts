import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('Utils - cn', () => {
    it('should merge class names', () => {
        const result = cn('class1', 'class2');
        expect(result).toContain('class1');
        expect(result).toContain('class2');
    });

    it('should handle conditional classes', () => {
        const result = cn('base', true && 'active', false && 'hidden');
        expect(result).toContain('base');
        expect(result).toContain('active');
        expect(result).not.toContain('hidden');
    });

    it('should handle undefined values', () => {
        const result = cn('base', undefined, 'end');
        expect(result).toContain('base');
        expect(result).toContain('end');
    });

    it('should handle empty strings', () => {
        const result = cn('base', '', 'end');
        expect(result).toContain('base');
        expect(result).toContain('end');
    });

    it('should merge tailwind conflicts correctly', () => {
        // tw-merge should handle conflicting classes
        const result = cn('p-4', 'p-8');
        expect(result).not.toContain('p-4');
        expect(result).toContain('p-8');
    });
    it('should handle array of classes', () => {
        const result = cn(['class1', 'class2']);
        expect(result).toContain('class1');
        expect(result).toContain('class2');
    });
});
