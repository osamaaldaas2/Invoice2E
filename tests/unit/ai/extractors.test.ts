import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { GeminiExtractor } from '@/services/ai/gemini.extractor';
import { OpenAIExtractor } from '@/services/ai/openai.extractor';
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
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ExtractorFactory', () => {
    it('should create Gemini extractor by default if no provider specified', () => {
      delete process.env.AI_PROVIDER;
      const extractor = ExtractorFactory.create();
      // Factory wraps in ValidatedExtractor; verify via provider name
      expect(extractor.getProviderName()).toBe('Gemini');
    });

    it('should create Gemini extractor when specified via env', () => {
      process.env.AI_PROVIDER = 'gemini';
      const extractor = ExtractorFactory.create();
      expect(extractor.getProviderName()).toBe('Gemini');
    });

    it('should return cached instance', () => {
      process.env.AI_PROVIDER = 'gemini';
      const extractor1 = ExtractorFactory.create();
      const extractor2 = ExtractorFactory.create();
      expect(extractor1).toBe(extractor2);
    });

    it('should throw error for invalid provider', () => {
      process.env.AI_PROVIDER = 'invalid';
      expect(() => ExtractorFactory.create()).toThrow(AppError);
    });

    it('should create OpenAI extractor when specified via env', () => {
      process.env.AI_PROVIDER = 'openai';
      const extractor = ExtractorFactory.create();
      // Factory wraps in ValidatedExtractor; verify via provider name
      expect(extractor.getProviderName()).toBe('OpenAI');
    });

    it('should support explicit provider argument', () => {
      process.env.AI_PROVIDER = 'openai';
      // Even if env is openai, requesting gemini should work
      const extractor = ExtractorFactory.create('gemini');
      expect(extractor.getProviderName()).toBe('Gemini');
    });
  });

  describe('Interface Implementation', () => {
    it('Gemini should implement IAIExtractor', () => {
      const extractor = new GeminiExtractor();
      expect(extractor.getProviderName()).toBe('Gemini');
      expect(typeof extractor.validateConfiguration).toBe('function');
      expect(typeof extractor.extractFromFile).toBe('function');
    });

    it('OpenAI should implement IAIExtractor', () => {
      const extractor = new OpenAIExtractor();
      expect(extractor.getProviderName()).toBe('OpenAI');
      expect(typeof extractor.validateConfiguration).toBe('function');
      expect(typeof extractor.extractFromFile).toBe('function');
    });
  });
});
