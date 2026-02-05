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
}

export interface HistoryFilters {
    format?: 'CII' | 'UBL';
    status?: 'valid' | 'invalid';
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

        // Build query
        let query = supabase
            .from('invoice_conversions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId);

        // Apply filters
        if (filters?.format) {
            query = query.eq('conversion_format', filters.format);
        }
        if (filters?.status) {
            query = query.eq('validation_status', filters.status);
        }
        if (filters?.startDate) {
            query = query.gte('created_at', filters.startDate);
        }
        if (filters?.endDate) {
            query = query.lte('created_at', filters.endDate);
        }

        // Execute with pagination
        try {
            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                logger.error('Failed to get conversion history', {
                    error,
                    code: error.code,
                    message: error.message,
                    userId
                });
                return {
                    items: [],
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                };
            }

            logger.info('Conversion history fetched', {
                count: data?.length,
                total: count,
                userId
            });

            if (!data || data.length === 0) {
                return {
                    items: [],
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                };
            }

            const items: any[] = data.map(row => ({
                id: row.id,
                invoice_number: row.invoice_number || 'N/A',
                file_name: row.buyer_name || 'Invoice', // Map buyer_name as fallback for file_name
                output_format: row.conversion_format || 'CII',
                status: row.validation_status || 'pending',
                credits_used: row.credits_used || 1,
                created_at: row.created_at,
                // processing_time_ms: row.processing_time_ms // Missing column
            }));

            const total = count || 0;

            return {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };

        } catch (error: any) {
            logger.error('Failed to get conversion history', { error });
            // Return empty list on exception instead of throwing
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
            .select('available_credits')
            .eq('user_id', userId)
            .single();

        if (creditError) {
            logger.warn('Failed to get user credits', { error: creditError, userId });
        }

        logger.info('Fetched user credits', { userId, initialCredits: creditData?.available_credits });

        const availableCredits = creditData?.available_credits || 0;


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


        const total = conversions?.length || 0;
        const successful = conversions?.filter(c => c.validation_status === 'valid').length || 0;
        const failed = total - successful;
        const totalCredits = conversions?.reduce((sum, c) => sum + (c.credits_used || 1), 0) || 0;
        const processingTimes = conversions?.filter(c => c.processing_time_ms).map(c => c.processing_time_ms as number) || [];
        const avgTime = processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0;

        // Calculate format distribution
        const formatCounts: Record<string, number> = {};
        conversions?.forEach(c => {
            const format = c.conversion_format || 'CII';
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

        const { data: conversions, error } = await supabase
            .from('invoice_conversions')
            .select('created_at, validation_status, conversion_format')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString());

        if (error) {
            logger.error('Failed to get charts data', { error });
            throw new Error(`Failed to get charts data: ${error.message}`);
        }

        // Calculate daily conversions
        const dailyMap: Record<string, { total: number; successful: number; failed: number }> = {};
        conversions?.forEach(c => {
            const date = c.created_at.split('T')[0];
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
        conversions?.forEach(c => {
            const format = c.conversion_format || 'CII';
            formatCounts[format] = (formatCounts[format] || 0) + 1;
        });

        const total = conversions?.length || 0;
        const formatDistribution = Object.entries(formatCounts).map(([format, count]) => ({
            format,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }));

        // Calculate weekly trend (aggregate by week)
        const weeklyMap: Record<string, number> = {};
        conversions?.forEach(c => {
            const date = new Date(c.created_at);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().split('T')[0];
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
