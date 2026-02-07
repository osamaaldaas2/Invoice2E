/**
 * Analytics Service
 * Provides conversion history and statistics for users
 * 
 * @module services/analytics.service
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';

export interface ConversionHistoryItem {
    id: string;
    invoice_number: string;
    file_name: string;
    output_format: string; // Changed from format to match implementation/frontend
    status: string;
    credits_used: number;
    // processing_time_ms: number | null; // Commented out until column added
    created_at: string;
    record_type?: 'conversion' | 'draft';
    extraction_id?: string;
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

        const fetchEnd = offset + limit - 1;
        const combinedRange = { start: 0, end: fetchEnd };

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

        try {
            let conversionItems: ConversionHistoryItem[] = [];
            let draftItems: ConversionHistoryItem[] = [];
            let conversionCount = 0;
            let draftCount = 0;

            if (wantsConversions) {
                let conversionQuery = supabase
                    .from('invoice_conversions')
                    .select('*', { count: 'exact' })
                    .eq('user_id', userId)
                    .or('conversion_status.eq.completed,validation_status.not.is.null');

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

                const range = statusFilter ? { start: offset, end: fetchEnd } : combinedRange;
                const { data, count, error } = await conversionQuery
                    .order('created_at', { ascending: false })
                    .range(range.start, range.end);

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

                const range = statusFilter ? { start: offset, end: fetchEnd } : combinedRange;
                const { data, count, error } = await extractionQuery
                    .order('created_at', { ascending: false })
                    .range(range.start, range.end);

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

            let items: ConversionHistoryItem[] = [];
            if (!statusFilter) {
                items = [...conversionItems, ...draftItems]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(offset, offset + limit);
            } else if (statusFilter === 'draft') {
                items = draftItems;
            } else {
                items = conversionItems;
            }

            const total = conversionCount + draftCount;

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
        const { data: creditData, error: creditError } = await supabase
            .from('user_credits')
            .select('available_credits, used_credits')
            .eq('user_id', userId)
            .single();

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
            processing_time_ms: number | null;
            conversion_format: string | null;
        }> = [];

        try {
            const { data, error } = await supabase
                .from('invoice_conversions')
                .select('validation_status, credits_used, processing_time_ms, conversion_format')
                .eq('user_id', userId);

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
        const processingTimes = conversions.filter((c) => c.processing_time_ms).map((c) => c.processing_time_ms as number);
        const avgTime = processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0;

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

        const { data, error } = await supabase
            .from('invoice_conversions')
            .select('created_at, validation_status, conversion_format')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString());

        if (error) {
            logger.error('Failed to get charts data', { error });
            throw new Error(`Failed to get charts data: ${error.message}`);
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
