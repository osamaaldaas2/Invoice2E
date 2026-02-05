import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { GeminiExtractor } from '@/services/ai/gemini.extractor';
import { DeepSeekExtractor } from '@/services/ai/deepseek.extractor';
import { AppError } from '@/lib/errors';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('AI Extractors', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        ExtractorFactory.clear();
        // Setup default valid keys for tests
        process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
        process.env.GEMINI_API_KEY = 'test-gemini-key';
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('ExtractorFactory', () => {
        it('should create DeepSeek extractor by default if no provider specified and default env set', () => {
            // In code, default is deepseek if process.env.AI_PROVIDER is missing
            delete process.env.AI_PROVIDER;
            const extractor = ExtractorFactory.create();
            expect(extractor).toBeInstanceOf(DeepSeekExtractor);
            expect(extractor.getProviderName()).toBe('DeepSeek');
        });

        it('should create Gemini extractor when specified via env', () => {
            process.env.AI_PROVIDER = 'gemini';
            const extractor = ExtractorFactory.create();
            expect(extractor).toBeInstanceOf(GeminiExtractor);
            expect(extractor.getProviderName()).toBe('Gemini');
        });

        it('should create DeepSeek extractor when specified via env', () => {
            process.env.AI_PROVIDER = 'deepseek';
            const extractor = ExtractorFactory.create();
            expect(extractor).toBeInstanceOf(DeepSeekExtractor);
        })

        it('should return cached instance', () => {
            process.env.AI_PROVIDER = 'deepseek';
            const extractor1 = ExtractorFactory.create();
            const extractor2 = ExtractorFactory.create();
            expect(extractor1).toBe(extractor2);
        });

        it('should throw error for invalid provider', () => {
            process.env.AI_PROVIDER = 'invalid';
            expect(() => ExtractorFactory.create()).toThrow(AppError);
        });

        it('should support explicit provider argument', () => {
            process.env.AI_PROVIDER = 'deepseek';
            // Even if env is deepseek, requesting gemini should work
            const extractor = ExtractorFactory.create('gemini');
            expect(extractor).toBeInstanceOf(GeminiExtractor);
        });
    });

    describe('Interface Implementation', () => {
        it('DeepSeek should implement IAIExtractor', () => {
            const extractor = new DeepSeekExtractor();
            expect(extractor.getProviderName()).toBe('DeepSeek');
            expect(typeof extractor.validateConfiguration).toBe('function');
            expect(typeof extractor.extractFromFile).toBe('function');
        });

        it('Gemini should implement IAIExtractor', () => {
            const extractor = new GeminiExtractor();
            expect(extractor.getProviderName()).toBe('Gemini');
            expect(typeof extractor.validateConfiguration).toBe('function');
            expect(typeof extractor.extractFromFile).toBe('function');
        });

        it('should validate configuration correctly', () => {
            delete process.env.DEEPSEEK_API_KEY;
            const dsExtractor = new DeepSeekExtractor();
            expect(dsExtractor.validateConfiguration()).toBe(false);

            process.env.DEEPSEEK_API_KEY = 'key';
            const dsExtractorWithKey = new DeepSeekExtractor(); // Create new instance to pick up new key
            expect(dsExtractorWithKey.validateConfiguration()).toBe(true);
        });
    });
});
