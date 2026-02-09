import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { InvoiceExtraction, InvoiceConversion } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';

export type CreateExtractionData = {
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore?: number;
    geminiResponseTimeMs?: number;
    status?: string;
};

export type CreateConversionData = {
    userId: string;
    extractionId: string;
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat: string;
    creditsUsed?: number;
    conversionStatus?: string;
};

export type UpdateConversionData = {
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat?: string;
    validationStatus?: string;
    validationErrors?: Record<string, unknown>;
    conversionStatus?: string;
    emailSent?: boolean;
    emailSentAt?: Date;
    emailRecipient?: string;
    fileDownloadTriggered?: boolean;
    downloadTriggeredAt?: Date;
    xmlContent?: string;
    xmlFileName?: string;
};

export class InvoiceDatabaseService {
    private getAdminClient() {
        // Direct admin client using Service Role Key to bypass RLS completely
        // This is necessary because createUserClient() might lack session in some contexts
        // and createServerClient() with SSR helpers can be finicky with Service Key
        return createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );
    }

    async createExtraction(data: CreateExtractionData): Promise<InvoiceExtraction> {
        // Use admin client to ensure reliable inserts from server-side routes
        const supabase = this.getAdminClient();
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
        // Use admin client to bypass RLS for server-side reads
        const supabase = this.getAdminClient();

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
        // Use admin client for server-side reads
        const supabase = this.getAdminClient();

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

        return (data ?? []).map((item) => snakeToCamelKeys(item) as InvoiceExtraction);
    }

    async updateExtraction(
        extractionId: string,
        data: { status?: string; extractionData?: Record<string, unknown> }
    ): Promise<InvoiceExtraction> {
        const supabase = this.getAdminClient();
        const snakeData = camelToSnakeKeys(data);

        const { data: extraction, error } = await supabase
            .from('invoice_extractions')
            .update(snakeData)
            .eq('id', extractionId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update extraction', { extractionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to update extraction', 500);
        }

        return snakeToCamelKeys(extraction) as InvoiceExtraction;
    }

    async deleteExtraction(extractionId: string): Promise<void> {
        const supabase = this.getAdminClient();

        const { error } = await supabase
            .from('invoice_extractions')
            .delete()
            .eq('id', extractionId);

        if (error) {
            logger.error('Failed to delete extraction', { extractionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to delete extraction', 500);
        }
    }

    async createConversion(data: CreateConversionData): Promise<InvoiceConversion> {
        // Use admin client for server-side inserts
        const supabase = this.getAdminClient();
        const snakeData = camelToSnakeKeys(data);

        const { data: conversion, error } = await supabase
            .from('invoice_conversions')
            .insert([snakeData])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create conversion', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to save conversion', 500);
        }

        return snakeToCamelKeys(conversion) as InvoiceConversion;
    }

    async updateConversion(conversionId: string, data: UpdateConversionData): Promise<InvoiceConversion> {
        // Use admin client to ensure we can update regardless of RLS (critical for status updates)
        const supabase = this.getAdminClient();
        const snakeData = camelToSnakeKeys(data);

        const { data: conversion, error } = await supabase
            .from('invoice_conversions')
            .update(snakeData)
            .eq('id', conversionId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update conversion', {
                conversionId,
                errorCode: error.code,
                errorMessage: error.message,
                errorDetails: error.details,
                errorHint: error.hint,
                fullError: JSON.stringify(error)
            });
            throw new AppError('DB_ERROR', 'Failed to update conversion', 500);
        }

        if (!conversion) {
            logger.error('Conversion not found after update', { conversionId });
            throw new NotFoundError('Conversion not found');
        }

        return snakeToCamelKeys(conversion) as InvoiceConversion;
    }

    async getConversionById(conversionId: string): Promise<InvoiceConversion> {
        // Use admin client for server-side reads
        const supabase = this.getAdminClient();

        const { data, error } = await supabase
            .from('invoice_conversions')
            .select('*')
            .eq('id', conversionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundError('Conversion not found');
            }
            logger.error('Failed to get conversion', { conversionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch conversion', 500);
        }
        return snakeToCamelKeys(data) as InvoiceConversion;
    }

    async getUserConversions(userId: string, limit: number = 10): Promise<InvoiceConversion[]> {
        // Use admin client for server-side reads
        const supabase = this.getAdminClient();

        const { data, error } = await supabase
            .from('invoice_conversions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to get conversions', { userId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch conversions', 500);
        }

        return (data ?? []).map((item) => snakeToCamelKeys(item) as InvoiceConversion);
    }

    async getConversionByExtractionId(extractionId: string): Promise<InvoiceConversion | null> {
        // Use admin client for server-side reads
        const supabase = this.getAdminClient();

        const { data, error } = await supabase
            .from('invoice_conversions')
            .select('*')
            .eq('extraction_id', extractionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned
                return null;
            }
            logger.error('Failed to get conversion by extraction ID', { extractionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch conversion', 500);
        }

        return snakeToCamelKeys(data) as InvoiceConversion;
    }

    async processConversionTransaction(userId: string, conversionId: string): Promise<{ success: boolean; remainingCredits?: number; error?: string }> {
        // Use admin client for RPC calls to ensure proper permissions
        const supabase = this.getAdminClient();

        const { data, error } = await supabase.rpc('convert_invoice_with_credit_deduction', {
            p_user_id: userId,
            p_conversion_id: conversionId,
            p_credits_cost: 1
        });

        if (error) {
            logger.error('Failed to process conversion transaction', { userId, conversionId, error: error.message });
            throw new AppError('DB_ERROR', 'Transaction failed', 500);
        }

        const result = data as { success: boolean; remaining_credits?: number; error?: string; message?: string };

        if (!result.success) {
            logger.error('Conversion transaction failed logic', { result });
            return { success: false, error: result.error || result.message || 'Transaction failed' };
        }

        return { success: true, remainingCredits: result.remaining_credits };
    }
}

export const invoiceDbService = new InvoiceDatabaseService();
