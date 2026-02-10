/**
 * Analytics Service
 * Provides conversion history and statistics for users
 * 
 * @module services/analytics.service
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { API_TIMEOUTS } from '@/lib/constants';

export interface BatchResultItem {
    filename: string;
    status: string;
    invoiceNumber?: string;
    extractionId?: string;
}

export interface ConversionHistoryItem {
    id: string;
    invoice_number: string;
    file_name: string;
    output_format: string;
    status: string;
    credits_used: number;
    created_at: string;
    record_type?: 'conversion' | 'draft' | 'batch';
    extraction_id?: string;
    // Batch-specific fields (only when record_type === 'batch')
    total_files?: number;
    completed_files?: number;
    failed_files?: number;
    batch_results?: BatchResultItem[];
}

export interface HistoryFilters {
    format?: 'CII' | 'UBL';
    status?: 'valid' | 'invalid' | 'draft' | 'completed';
    startDate?: string;
    endDate?: string;
}

export interface PaginatedHistory {
    items: ConversionHistoryItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UserStatistics {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    totalCreditsUsed: number;
    successRate: number;
    avgProcessingTime: number;
    availableCredits: number;
    formatsUsed: { format: string; count: number; percentage: number }[];
}

export interface ChartDataPoint {
    date: string;
    conversions: number;
    successful?: number;
    failed?: number;
}

export interface ChartsData {
    dailyConversions: ChartDataPoint[];
    formatDistribution: { format: string; count: number; percentage: number }[];
    weeklyTrend: ChartDataPoint[];
}

export class AnalyticsService {
    private async queryWithTimeout<T>(
        query: PromiseLike<T>,
        timeoutMs: number = API_TIMEOUTS.DATABASE_QUERY
    ): Promise<T> {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            const queryPromise = Promise.resolve(query);
            return await Promise.race([
                queryPromise,
                new Promise<T>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('Query timeout')), timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    /**
     * Get paginated conversion history
     */
    async getConversionHistory(
        userId: string,
        page: number = 1,
        limit: number = 20,
        filters?: HistoryFilters
    ): Promise<PaginatedHistory> {
        logger.info('Getting conversion history', { userId, page, limit, filters });

        const supabase = createServerClient();
        const offset = (page - 1) * limit;

        const statusFilter = filters?.status;
        const wantsDrafts = !statusFilter || statusFilter === 'draft';
        const wantsConversions = !statusFilter || statusFilter === 'completed' || statusFilter === 'valid' || statusFilter === 'invalid';
        const wantsBatches = !statusFilter || statusFilter === 'completed';

        const mapConversion = (row: any): ConversionHistoryItem => ({
            id: row.id,
            invoice_number: row.invoice_number || 'N/A',
            file_name: row.buyer_name || 'Invoice',
            output_format: row.conversion_format || 'CII',
            status: row.conversion_status || 'completed',
            credits_used: row.credits_used || 1,
            created_at: row.created_at,
            record_type: 'conversion',
            extraction_id: row.extraction_id,
        });

        const mapDraft = (row: any): ConversionHistoryItem => {
            const data = row.extraction_data || {};
            const invoiceNumber = data.invoiceNumber || data.invoice_number || 'N/A';
            const buyerName = data.buyerName || data.buyer_name || data.sellerName || data.seller_name || 'Draft';
            return {
                id: row.id,
                invoice_number: invoiceNumber,
                file_name: buyerName,
                output_format: '',
                status: 'draft',
                credits_used: 1,
                created_at: row.created_at,
                record_type: 'draft',
                extraction_id: row.id,
            };
        };

        type BatchRow = Record<string, unknown>;
        type BatchResultRecord = Record<string, unknown>;

        const mapBatch = (row: BatchRow): ConversionHistoryItem => {
            const results = (row.results as BatchResultRecord[]) || [];
            const batchResults: BatchResultItem[] = results
                .filter((r) => r.status === 'success' && r.extractionId)
                .map((r) => ({
                    filename: String(r.filename || ''),
                    status: String(r.status),
                    invoiceNumber: r.invoiceNumber as string | undefined,
                    extractionId: r.extractionId as string,
                }));
            return {
                id: row.id as string,
                invoice_number: `Batch (${row.total_files} files)`,
                file_name: 'ZIP Upload',
                output_format: 'XRechnung',
                status: row.status as string,
                credits_used: (row.completed_files as number) || 0,
                created_at: row.created_at as string,
                record_type: 'batch',
                total_files: row.total_files as number | undefined,
                completed_files: row.completed_files as number | undefined,
                failed_files: row.failed_files as number | undefined,
                batch_results: batchResults,
            };
        };

        try {
            let conversionItems: ConversionHistoryItem[] = [];
            let draftItems: ConversionHistoryItem[] = [];
            let batchItems: ConversionHistoryItem[] = [];
            let conversionCount = 0;
            let draftCount = 0;

            if (wantsConversions) {
                let conversionQuery = supabase
                    .from('invoice_conversions')
                    .select('*', { count: 'exact' })
                    .eq('user_id', userId);

                if (filters?.format) {
                    conversionQuery = conversionQuery.eq('conversion_format', filters.format);
                }
                if (filters?.status === 'valid' || filters?.status === 'invalid') {
                    conversionQuery = conversionQuery.eq('validation_status', filters.status);
                }
                if (filters?.startDate) {
                    conversionQuery = conversionQuery.gte('created_at', filters.startDate);
                }
                if (filters?.endDate) {
                    conversionQuery = conversionQuery.lte('created_at', filters.endDate);
                }

                // Fetch all rows (no .range()) — pagination happens after dedup in memory
                const conversionResponse: any = await this.queryWithTimeout(
                    conversionQuery
                        .order('created_at', { ascending: false }),
                    API_TIMEOUTS.DATABASE_QUERY
                );
                const { data, count, error } = conversionResponse;

                if (error) {
                    logger.error('Failed to get conversion history', {
                        error,
                        code: error.code,
                        message: error.message,
                        userId
                    });
                } else {
                    conversionItems = (data || []).map(mapConversion);
                    conversionCount = count || 0;
                }
            }

            if (wantsDrafts) {
                let extractionQuery = supabase
                    .from('invoice_extractions')
                    .select('*', { count: 'exact' })
                    .eq('user_id', userId)
                    .in('status', ['draft', 'pending', 'processing']);

                if (filters?.startDate) {
                    extractionQuery = extractionQuery.gte('created_at', filters.startDate);
                }
                if (filters?.endDate) {
                    extractionQuery = extractionQuery.lte('created_at', filters.endDate);
                }

                const extractionResponse: any = await this.queryWithTimeout(
                    extractionQuery
                        .order('created_at', { ascending: false }),
                    API_TIMEOUTS.DATABASE_QUERY
                );
                const { data, count, error } = extractionResponse;

                if (error) {
                    logger.error('Failed to get draft history', {
                        error,
                        code: error.code,
                        message: error.message,
                        userId
                    });
                } else {
                    draftItems = (data || []).map(mapDraft);
                    draftCount = count || 0;
                }
            }

            if (wantsBatches) {
                let batchQuery = supabase
                    .from('batch_jobs')
                    .select('*', { count: 'exact' })
                    .eq('user_id', userId)
                    .in('status', ['completed', 'partial_success', 'failed']);

                if (filters?.startDate) {
                    batchQuery = batchQuery.gte('created_at', filters.startDate);
                }
                if (filters?.endDate) {
                    batchQuery = batchQuery.lte('created_at', filters.endDate);
                }

                const batchResponse: any = await this.queryWithTimeout(
                    batchQuery
                        .order('created_at', { ascending: false }),
                    API_TIMEOUTS.DATABASE_QUERY
                );
                const { data, error } = batchResponse;

                if (error) {
                    logger.error('Failed to get batch history', {
                        error,
                        code: error.code,
                        message: error.message,
                        userId
                    });
                } else {
                    batchItems = (data || []).map(mapBatch);
                }
            }

            // Collect ALL extraction IDs owned by batch jobs to deduplicate
            const batchExtractionIds = new Set<string>();
            try {
                const allBatchResponse: any = await this.queryWithTimeout(
                    supabase
                        .from('batch_jobs')
                        .select('results')
                        .eq('user_id', userId),
                    API_TIMEOUTS.DATABASE_QUERY
                );
                if (!allBatchResponse.error && allBatchResponse.data) {
                    for (const row of allBatchResponse.data) {
                        const results = (row.results as BatchResultRecord[]) || [];
                        for (const r of results) {
                            if (r.extractionId) batchExtractionIds.add(r.extractionId as string);
                        }
                    }
                }
            } catch {
                // Non-critical — worst case we show duplicates
            }

            // Filter out individual items that belong to a batch
            if (batchExtractionIds.size > 0) {
                const beforeDrafts = draftItems.length;
                const beforeConversions = conversionItems.length;
                draftItems = draftItems.filter(d => !d.extraction_id || !batchExtractionIds.has(d.extraction_id));
                conversionItems = conversionItems.filter(c => !c.extraction_id || !batchExtractionIds.has(c.extraction_id));
                draftCount -= (beforeDrafts - draftItems.length);
                conversionCount -= (beforeConversions - conversionItems.length);
            }

            // Dedup: remove draft items that already have a conversion record
            // (same extraction can exist in both invoice_extractions and invoice_conversions)
            if (conversionItems.length > 0 && draftItems.length > 0) {
                const conversionExtractionIds = new Set(
                    conversionItems.map(c => c.extraction_id).filter(Boolean)
                );
                const beforeDrafts = draftItems.length;
                draftItems = draftItems.filter(d => !d.extraction_id || !conversionExtractionIds.has(d.extraction_id));
                draftCount -= (beforeDrafts - draftItems.length);
            }

            // Combine all items based on filter, then paginate in memory
            let allItems: ConversionHistoryItem[];
            if (!statusFilter) {
                allItems = [...conversionItems, ...draftItems, ...batchItems];
            } else if (statusFilter === 'draft') {
                allItems = draftItems;
            } else {
                allItems = [...conversionItems, ...batchItems];
            }

            // Sort by date descending
            allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            // Use actual post-dedup count for consistent pagination
            const total = allItems.length;
            const items = allItems.slice(offset, offset + limit);

            return {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        } catch (error: any) {
            logger.error('Failed to get conversion history', { error });
            return {
                items: [],
                total: 0,
                page,
                limit,
                totalPages: 0,
            };
        }
    }

    /**
     * Get user statistics
     */
    async getStatistics(userId: string): Promise<UserStatistics> {
        logger.info('Getting user statistics', { userId });

        const supabase = createServerClient();

        // Get credits
        const creditResponse: any = await this.queryWithTimeout(
            supabase
                .from('user_credits')
                .select('available_credits, used_credits')
                .eq('user_id', userId)
                .single(),
            API_TIMEOUTS.DATABASE_QUERY
        );
        const { data: creditData, error: creditError } = creditResponse;

        if (creditError) {
            logger.warn('Failed to get user credits', { error: creditError, userId });
        }

        logger.info('Fetched user credits', { userId, initialCredits: creditData?.available_credits });

        const availableCredits = creditData?.available_credits || 0;
        const usedCredits = creditData?.used_credits || 0;


        // Get overall stats - handle missing table/columns gracefully
        let conversions: Array<{
            validation_status: string | null;
            credits_used: number | null;
            conversion_format: string | null;
        }> = [];

        try {
            const conversionsResponse: any = await this.queryWithTimeout(
                supabase
                    .from('invoice_conversions')
                    .select('validation_status, credits_used, conversion_format')
                    .eq('user_id', userId),
                API_TIMEOUTS.DATABASE_QUERY
            );
            const { data, error } = conversionsResponse;

            if (error) {
                logger.warn('Failed to get conversions, returning zero stats', { error: error.message, userId });
            } else {
                conversions = data || [];
            }
        } catch (queryError) {
            logger.warn('Exception getting conversions, returning zero stats', { error: queryError, userId });
        }


        const total = conversions.length;
        const successful = conversions.filter((c) => c.validation_status === 'valid').length;
        const failed = total - successful;
        const totalCredits = usedCredits || conversions.reduce((sum, c) => sum + (c.credits_used || 1), 0);
        const avgTime = 0;

        // Calculate format distribution
        const formatCounts: Record<string, number> = {};
        conversions.forEach((c) => {
            const format = c.conversion_format ?? 'CII';
            formatCounts[format] = (formatCounts[format] || 0) + 1;
        });

        const formatsUsed = Object.entries(formatCounts).map(([format, count]) => ({
            format,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }));

        return {
            totalConversions: total,
            successfulConversions: successful,
            failedConversions: failed,
            totalCreditsUsed: totalCredits,
            successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
            avgProcessingTime: Math.round(avgTime),
            availableCredits,
            formatsUsed,
        };
    }

    /**
     * Get charts data
     */
    async getChartsData(userId: string, period: 'week' | 'month' | 'year' = 'month'): Promise<ChartsData> {
        logger.info('Getting charts data', { userId, period });

        const supabase = createServerClient();

        // Calculate date range
        const now = new Date();
        let startDate: Date;
        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'year':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const chartsResponse: any = await this.queryWithTimeout(
            supabase
                .from('invoice_conversions')
                .select('created_at, validation_status, conversion_format')
                .eq('user_id', userId)
                .gte('created_at', startDate.toISOString()),
            API_TIMEOUTS.DATABASE_QUERY
        );
        const { data, error } = chartsResponse;

        if (error) {
            logger.error('Failed to get charts data', { error });
            throw new AppError('ANALYTICS_ERROR', `Failed to get charts data: ${error.message}`, 500);
        }

        const conversions: Array<{
            created_at: string;
            validation_status: string | null;
            conversion_format: string | null;
        }> = data || [];

        // Calculate daily conversions
        const dailyMap: Record<string, { total: number; successful: number; failed: number }> = {};
        conversions.forEach((c) => {
            const date = c.created_at.split('T')[0] || '';
            if (!dailyMap[date]) {
                dailyMap[date] = { total: 0, successful: 0, failed: 0 };
            }
            dailyMap[date].total++;
            if (c.validation_status === 'valid') {
                dailyMap[date].successful++;
            } else {
                dailyMap[date].failed++;
            }
        });

        const dailyConversions: ChartDataPoint[] = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => ({
                date,
                conversions: data.total,
                successful: data.successful,
                failed: data.failed,
            }));

        // Calculate format distribution
        const formatCounts: Record<string, number> = {};
        conversions.forEach((c) => {
            const format = c.conversion_format ?? 'CII';
            formatCounts[format] = (formatCounts[format] || 0) + 1;
        });

        const total = conversions.length;
        const formatDistribution = Object.entries(formatCounts).map(([format, count]) => ({
            format,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }));

        // Calculate weekly trend (aggregate by week)
        const weeklyMap: Record<string, number> = {};
        conversions.forEach((c) => {
            const date = new Date(c.created_at);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().split('T')[0] || '';
            weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + 1;
        });

        const weeklyTrend: ChartDataPoint[] = Object.entries(weeklyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, conversions]) => ({ date, conversions }));

        return {
            dailyConversions,
            formatDistribution,
            weeklyTrend,
        };
    }

    /**
     * Export history as CSV
     */
    async exportHistoryAsCSV(userId: string): Promise<string> {
        logger.info('Exporting history as CSV', { userId });

        const { items } = await this.getConversionHistory(userId, 1, 10000);

        // CSV header
        const headers = ['Invoice Number', 'Buyer Name', 'Format', 'Status', 'Credits Used', 'Processing Time (ms)', 'Date'];

        // CSV rows
        const rows = items.map(item => [
            item.invoice_number,
            item.file_name,
            item.output_format,
            item.status,
            item.credits_used.toString(),
            'N/A', // item.processing_time_ms?.toString() || 'N/A',
            new Date(item.created_at).toLocaleDateString('de-DE'),
        ]);

        // Combine
        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
        ].join('\n');

        return csv;
    }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
