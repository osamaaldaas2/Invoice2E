/**
 * Package Service
 * Handles CRUD operations for credit packages with caching
 * 
 * @module services/package.service
 */

import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { CreditPackage, CreatePackageInput, UpdatePackageInput } from '@/types/credit-package';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PackageService {
    private cache: CreditPackage[] | null = null;
    private cacheExpiry: number = 0;

    /**
     * Get all active packages (cached)
     */
    async getActivePackages(): Promise<CreditPackage[]> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        const supabase = createServerClient();

        const { data, error } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            logger.error('Failed to fetch packages', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to load pricing packages', 500);
        }

        this.cache = data || [];
        this.cacheExpiry = Date.now() + CACHE_TTL_MS;

        return this.cache ?? [];
    }

    /**
     * Get package by slug
     */
    async getPackageBySlug(slug: string): Promise<CreditPackage | null> {
        const packages = await this.getActivePackages();
        return packages.find(p => p.slug === slug) || null;
    }

    /**
     * Get package by ID (direct DB query, not cached)
     */
    async getPackageById(id: string): Promise<CreditPackage | null> {
        const supabase = createServerClient();

        const { data, error } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            logger.error('Failed to get package by ID', { id, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to fetch package', 500);
        }

        return data;
    }

    /**
     * Invalidate cache (call after admin updates)
     */
    invalidateCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
        logger.info('Package cache invalidated');
    }

    // ============ ADMIN METHODS ============

    /**
     * Get all packages including inactive (admin only)
     */
    async getAllPackages(): Promise<CreditPackage[]> {
        const supabase = createServerClient();

        const { data, error } = await supabase
            .from('credit_packages')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            throw new AppError('DB_ERROR', 'Failed to fetch all packages', 500);
        }

        return data || [];
    }

    /**
     * Create new package (admin only)
     */
    async createPackage(input: CreatePackageInput): Promise<CreditPackage> {
        const supabase = createServerClient();

        const { data, error } = await supabase
            .from('credit_packages')
            .insert({
                slug: input.slug,
                name: input.name,
                name_de: input.name_de,
                description: input.description,
                description_de: input.description_de,
                credits: input.credits,
                price: input.price,
                currency: input.currency || 'EUR',
                is_popular: input.is_popular || false,
                savings_percent: input.savings_percent,
                sort_order: input.sort_order || 0,
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create package', { error: error.message });
            throw new AppError('DB_ERROR', 'Failed to create package', 500);
        }

        this.invalidateCache();
        return data;
    }

    /**
     * Update package (admin only)
     */
    async updatePackage(id: string, input: UpdatePackageInput): Promise<CreditPackage> {
        const supabase = createServerClient();

        const { data, error } = await supabase
            .from('credit_packages')
            .update(input)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update package', { id, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to update package', 500);
        }

        this.invalidateCache();
        return data;
    }

    /**
     * Soft delete package (admin only) - just deactivates
     */
    async deletePackage(id: string): Promise<void> {
        const supabase = createServerClient();

        const { error } = await supabase
            .from('credit_packages')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            logger.error('Failed to delete package', { id, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to delete package', 500);
        }

        this.invalidateCache();
    }
}

export const packageService = new PackageService();
