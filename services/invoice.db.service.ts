import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError } from '@/lib/errors';
import type { InvoiceExtraction, InvoiceConversion } from '@/types';
import { camelToSnakeKeys, snakeToCamelKeys } from '@/lib/database-helpers';
import { createAdminClient } from '@/lib/supabase.server';

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
    /**
     * P0-1: Fail-fast pattern - NO ADMIN FALLBACK.
     * User-facing operations MUST provide a SupabaseClient.
     * If client is missing, throws an error instead of silently bypassing RLS.
     * Admin operations should use explicit *Admin() methods.
     */
    private assertClientProvided(client: SupabaseClient | undefined, methodName: string): asserts client is SupabaseClient {
        if (!client) {
            throw new AppError(
                'MISSING_CLIENT',
                `${methodName} requires a Supabase client for RLS enforcement. Pass createUserScopedClient(userId) or use *Admin() method variant.`,
                500
            );
        }
    }

    async createExtraction(data: CreateExtractionData, client?: SupabaseClient): Promise<InvoiceExtraction> {
        // P0-1: Client required - fail fast if missing
        this.assertClientProvided(client, 'createExtraction');
        const snakeData = camelToSnakeKeys(data);

        const { data: extraction, error } = await client!
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

    async getExtractionById(extractionId: string, client?: SupabaseClient): Promise<InvoiceExtraction> {
        // P0-1: Client required - fail fast if missing
        this.assertClientProvided(client, 'getExtractionById');

        const { data, error } = await client!
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

    async getUserExtractions(userId: string, limit: number = 10, client?: SupabaseClient): Promise<InvoiceExtraction[]> {
        // P0-1: Client required - fail fast if missing
        this.assertClientProvided(client, 'getUserExtractions');

        const { data, error } = await client!
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
        data: { status?: string; extractionData?: Record<string, unknown> },
        client?: SupabaseClient
    ): Promise<InvoiceExtraction> {
        this.assertClientProvided(client, 'updateExtraction');
        const snakeData = camelToSnakeKeys(data);

        const { data: extraction, error } = await client!
            .from('invoice_extractions')
            .update(snakeData)
            .eq('id', extractionId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update extraction', { extractionId, error: error.message, code: error.code, details: error.details, hint: error.hint });
            throw new AppError('DB_ERROR', 'Failed to update extraction', 500);
        }

        return snakeToCamelKeys(extraction) as InvoiceExtraction;
    }

    async deleteExtraction(extractionId: string, client?: SupabaseClient): Promise<void> {
        this.assertClientProvided(client, 'deleteExtraction');

        const { error } = await client!
            .from('invoice_extractions')
            .delete()
            .eq('id', extractionId);

        if (error) {
            logger.error('Failed to delete extraction', { extractionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to delete extraction', 500);
        }
    }

    async createConversion(data: CreateConversionData, client?: SupabaseClient): Promise<InvoiceConversion> {
        this.assertClientProvided(client, 'createConversion');
        const snakeData = camelToSnakeKeys(data);

        const { data: conversion, error } = await client!
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

    async updateConversion(conversionId: string, data: UpdateConversionData, client?: SupabaseClient): Promise<InvoiceConversion> {
        this.assertClientProvided(client, 'updateConversion');
        const snakeData = camelToSnakeKeys(data);

        const { data: conversion, error } = await client!
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

    async getConversionById(conversionId: string, client?: SupabaseClient): Promise<InvoiceConversion> {
        this.assertClientProvided(client, 'getConversionById');

        const { data, error } = await client!
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

    async getUserConversions(userId: string, limit: number = 10, client?: SupabaseClient): Promise<InvoiceConversion[]> {
        this.assertClientProvided(client, 'getUserConversions');

        const { data, error } = await client!
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

    async getConversionByExtractionId(extractionId: string, client?: SupabaseClient): Promise<InvoiceConversion | null> {
        this.assertClientProvided(client, 'getConversionByExtractionId');

        const { data, error } = await client!
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

    async processConversionTransaction(userId: string, conversionId: string, client?: SupabaseClient): Promise<{ success: boolean; remainingCredits?: number; error?: string }> {
        this.assertClientProvided(client, 'processConversionTransaction');

        const { data, error } = await client!.rpc('convert_invoice_with_credit_deduction', {
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

    // ============================================================
    // ADMIN METHODS - Use ONLY in admin routes or background jobs
    // These methods bypass RLS by design
    // ============================================================

    /**
     * Admin-only: Get any extraction by ID (bypasses RLS).
     * Use ONLY in admin routes or background jobs.
     */
    async getExtractionByIdAdmin(extractionId: string): Promise<InvoiceExtraction> {
        const adminClient = createAdminClient();
        const { data, error } = await adminClient
            .from('invoice_extractions')
            .select('*')
            .eq('id', extractionId)
            .single();

        if (error) {
            logger.error('Failed to get extraction (admin)', { extractionId, error: error.message });
            throw new NotFoundError('Extraction not found');
        }

        return snakeToCamelKeys(data) as InvoiceExtraction;
    }

    /**
     * Admin-only: Update any extraction (bypasses RLS).
     * Use ONLY in admin routes or background jobs.
     */
    async updateExtractionAdmin(
        extractionId: string,
        data: { status?: string; extractionData?: Record<string, unknown> }
    ): Promise<InvoiceExtraction> {
        const adminClient = createAdminClient();
        const snakeData = camelToSnakeKeys(data);

        const { data: extraction, error } = await adminClient
            .from('invoice_extractions')
            .update(snakeData)
            .eq('id', extractionId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update extraction (admin)', { extractionId, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to update extraction', 500);
        }

        return snakeToCamelKeys(extraction) as InvoiceExtraction;
    }
}

export const invoiceDbService = new InvoiceDatabaseService();
