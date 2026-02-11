import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { IAIExtractor } from './IAIExtractor';
import { GeminiExtractor } from './gemini.extractor';
import { DeepSeekExtractor } from './deepseek.extractor';

export type AIProvider = 'gemini' | 'deepseek' | 'aws';

export class ExtractorFactory {
  private static instances: Map<AIProvider, IAIExtractor> = new Map();

  static create(provider?: AIProvider): IAIExtractor {
    // Use env variable if not specified, default to deepseek
    const selectedProvider = (provider || process.env.AI_PROVIDER || 'gemini') as AIProvider;

    logger.info('Creating AI extractor', { provider: selectedProvider });

    // Return cached instance if exists
    if (this.instances.has(selectedProvider)) {
      // logger.info('Using cached extractor', { provider: selectedProvider });
      return this.instances.get(selectedProvider)!;
    }

    let extractor: IAIExtractor;

    switch (selectedProvider) {
      case 'gemini':
        extractor = new GeminiExtractor();
        break;

      case 'deepseek':
        extractor = new DeepSeekExtractor();
        break;

      case 'aws':
        // Placeholder for AWS implementation
        throw new AppError('NOT_IMPLEMENTED', 'AWS Textract integration coming soon', 501);

      default:
        // Fallback or error? Let's error if unknown, but maybe fallback to deepseek?
        // Better to error to be explicit.
        // However, if env var includes quotes or space, might fail.
        throw new AppError('INVALID_PROVIDER', `Unknown AI provider: ${selectedProvider}`, 400);
    }

    // Validate configuration
    if (!extractor.validateConfiguration()) {
      throw new AppError(
        'CONFIG_ERROR',
        `${extractor.getProviderName()} not properly configured. Check API keys.`,
        500
      );
    }

    // Cache instance
    this.instances.set(selectedProvider, extractor);

    logger.info('AI extractor created successfully', {
      provider: selectedProvider,
      name: extractor.getProviderName(),
    });

    return extractor;
  }

  static getAvailableProviders(): AIProvider[] {
    return ['gemini', 'deepseek'];
  }

  static clear(): void {
    this.instances.clear();
    logger.info('Extractor cache cleared');
  }
}
