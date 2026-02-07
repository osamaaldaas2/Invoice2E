import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { InvoiceExtraction } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { CreateExtractionData } from './types';

export class ExtractionService {
    private getSupabase() {
        return createServerClient();
    }

    async createExtraction(data: CreateExtractionData): Promise<InvoiceExtraction> {
        const supabase = this.getSupabase();
        const snakeData = camelToSnakeKeys(data);

        const { data: extraction, error } = await supabase
            .from('invoice_extractions')
            .insert([snakeData])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create extraction', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to save extraction', 500);
        }

        return snakeToCamelKeys(extraction) as InvoiceExtraction;
    }

    async getExtractionById(extractionId: string): Promise<InvoiceExtraction> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('invoice_extractions')
            .select('*')
            .eq('id', extractionId)
            .single();

        if (error) {
            logger.error('Failed to get extraction', { extractionId, error: error.message });
            throw new NotFoundError('Extraction not found');
        }

        return snakeToCamelKeys(data) as InvoiceExtraction;
    }

    async getUserExtractions(userId: string, limit: number = 10): Promise<InvoiceExtraction[]> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('invoice_extractions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to get extractions', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch extractions', 500);
        }

        return (data ?? []).map((item: Record<string, unknown>) => snakeToCamelKeys(item) as InvoiceExtraction);
    }
}

export const extractionService = new ExtractionService();
