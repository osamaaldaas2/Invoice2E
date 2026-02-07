/**
 * Admin Stats Service
 * Provides dashboard statistics and analytics for admin panel
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import {
    AdminDashboardStats,
    RevenueDataPoint,
    UserGrowthDataPoint,
    ConversionDataPoint,
} from '@/types/admin';

class AdminStatsService {
    private getSupabase() {
        return createServerClient();
    }

    /**
     * Get main dashboard statistics
     */
    async getDashboardStats(): Promise<AdminDashboardStats> {
        const supabase = this.getSupabase();

        try {
            // Try to use the view first
            const { data: viewData, error: viewError } = await supabase
                .from('admin_dashboard_stats')
                .select('*')
                .single();

            if (!viewError && viewData) {
                return {
                    totalUsers: viewData.total_users || 0,
                    newUsers30d: viewData.new_users_30d || 0,
                    bannedUsers: viewData.banned_users || 0,
                    totalRevenue: parseFloat(viewData.total_revenue) || 0,
                    revenue30d: parseFloat(viewData.revenue_30d) || 0,
                    totalTransactions: viewData.total_transactions || 0,
                    totalConversions: viewData.total_conversions || 0,
                    successfulConversions: viewData.successful_conversions || 0,
                    conversions30d: viewData.conversions_30d || 0,
                    activePackages: viewData.active_packages || 0,
                };
            }

            // Fallback: Calculate stats manually
            return await this.calculateStatsManually();
        } catch (error) {
            logger.error('Failed to get dashboard stats', { error });
            return await this.calculateStatsManually();
        }
    }

    /**
     * Calculate stats manually (fallback)
     */
    private async calculateStatsManually(): Promise<AdminDashboardStats> {
        const supabase = this.getSupabase();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

        // Run queries in parallel
        const [
            usersResult,
            newUsersResult,
            bannedResult,
            revenueResult,
            revenue30dResult,
            transactionsResult,
            conversionsResult,
            successfulResult,
            conversions30dResult,
            packagesResult,
        ] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'user'),
            supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'user')
                .gte('created_at', thirtyDaysAgoStr),
            supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('is_banned', true),
            supabase
                .from('payment_transactions')
                .select('amount')
                .eq('payment_status', 'completed'),
            supabase
                .from('payment_transactions')
                .select('amount')
                .eq('payment_status', 'completed')
                .gte('created_at', thirtyDaysAgoStr),
            supabase
                .from('payment_transactions')
                .select('id', { count: 'exact', head: true })
                .eq('payment_status', 'completed'),
            supabase.from('invoice_conversions').select('id', { count: 'exact', head: true }),
            supabase
                .from('invoice_conversions')
                .select('id', { count: 'exact', head: true })
                .eq('validation_status', 'valid'),
            supabase
                .from('invoice_conversions')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', thirtyDaysAgoStr),
            supabase
                .from('credit_packages')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true),
        ]);

        // Calculate totals
        const totalRevenue =
            revenueResult.data?.reduce((sum: number, tx: { amount: string }) => sum + (parseFloat(tx.amount) || 0), 0) || 0;
        const revenue30d =
            revenue30dResult.data?.reduce((sum: number, tx: { amount: string }) => sum + (parseFloat(tx.amount) || 0), 0) ||
            0;

        return {
            totalUsers: usersResult.count || 0,
            newUsers30d: newUsersResult.count || 0,
            bannedUsers: bannedResult.count || 0,
            totalRevenue,
            revenue30d,
            totalTransactions: transactionsResult.count || 0,
            totalConversions: conversionsResult.count || 0,
            successfulConversions: successfulResult.count || 0,
            conversions30d: conversions30dResult.count || 0,
            activePackages: packagesResult.count || 0,
        };
    }

    /**
     * Get revenue data by period for charts
     */
    async getRevenueByPeriod(
        period: 'day' | 'week' | 'month' = 'day',
        days: number = 30
    ): Promise<RevenueDataPoint[]> {
        const supabase = this.getSupabase();

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('payment_transactions')
            .select('amount, created_at')
            .eq('payment_status', 'completed')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Failed to get revenue data', { error: error.message });
            return [];
        }

        // Group by period
        const grouped = this.groupByPeriod(data || [], period, 'amount');

        return Object.entries(grouped).map(([date, values]) => ({
            date,
            revenue: values.reduce((sum, v) => sum + v, 0),
            transactions: values.length,
        }));
    }

    /**
     * Get user growth data for charts
     */
    async getUserGrowth(
        period: 'day' | 'week' | 'month' = 'day',
        days: number = 30
    ): Promise<UserGrowthDataPoint[]> {
        const supabase = this.getSupabase();

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get new users per period
        const { data: newUsers, error } = await supabase
            .from('users')
            .select('created_at')
            .eq('role', 'user')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Failed to get user growth data', { error: error.message });
            return [];
        }

        // Get total users before start date
        const { count: baseCount } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'user')
            .lt('created_at', startDate.toISOString());

        // Group by period
        const grouped = this.groupByPeriod(newUsers || [], period, null);
        let runningTotal = baseCount || 0;

        return Object.entries(grouped).map(([date, values]) => {
            const newCount = values.length;
            runningTotal += newCount;
            return {
                date,
                newUsers: newCount,
                totalUsers: runningTotal,
            };
        });
    }

    /**
     * Get conversion data for charts
     */
    async getConversionsByPeriod(
        period: 'day' | 'week' | 'month' = 'day',
        days: number = 30
    ): Promise<ConversionDataPoint[]> {
        const supabase = this.getSupabase();

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('invoice_conversions')
            .select('validation_status, created_at')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Failed to get conversion data', { error: error.message });
            return [];
        }

        // Group by period and status
        const result: Record<string, { total: number; successful: number; failed: number }> = {};

        (data || []).forEach((row: { created_at: string; validation_status: string }) => {
            const date = this.getDateKey(new Date(row.created_at), period);
            if (!result[date]) {
                result[date] = { total: 0, successful: 0, failed: 0 };
            }
            result[date].total++;
            if (row.validation_status === 'valid') {
                result[date].successful++;
            } else if (row.validation_status === 'invalid') {
                result[date].failed++;
            }
        });

        return Object.entries(result).map(([date, values]) => ({
            date,
            conversions: values.total,
            successful: values.successful,
            failed: values.failed,
        }));
    }

    /**
     * Helper: Group data by time period
     */
    private groupByPeriod(
        data: { created_at: string; amount?: string }[],
        period: 'day' | 'week' | 'month',
        valueField: string | null
    ): Record<string, number[]> {
        const result: Record<string, number[]> = {};

        data.forEach((row) => {
            const date = this.getDateKey(new Date(row.created_at), period);
            if (!result[date]) {
                result[date] = [];
            }
            const rawValue = valueField ? (row as Record<string, string>)[valueField] : undefined;
            const value = valueField
                ? (rawValue ? parseFloat(rawValue) || 0 : 0)
                : 1;
            result[date].push(value);
        });

        return result;
    }

    /**
     * Helper: Get date key based on period
     */
    private getDateKey(date: Date, period: 'day' | 'week' | 'month'): string {
        switch (period) {
            case 'day':
                return date.toISOString().split('T')[0] || '';
            case 'week': {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                return weekStart.toISOString().split('T')[0] || '';
            }
            case 'month':
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            default:
                return date.toISOString().split('T')[0] || '';
        }
    }
}

export const adminStatsService = new AdminStatsService();
