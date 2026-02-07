import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminAuditService } from '@/services/admin';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

const CreatePackageSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    credits: z.number().int().min(1),
    price: z.number().min(0),
    currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
});

/**
 * GET /api/admin/packages
 * List all credit packages (admin only)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const admin = await requireAdmin(request);

        const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }

        const supabase = createServerClient();

        const { data: packages, error } = await supabase
            .from('credit_packages')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('Failed to fetch packages', { error: error.message });
            return NextResponse.json(
                { success: false, error: 'Failed to fetch packages' },
                { status: 500 }
            );
        }

        const formattedPackages = packages.map((pkg: any) => ({
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            credits: pkg.credits,
            price: parseFloat(pkg.price),
            currency: pkg.currency,
            isActive: pkg.is_active,
            isFeatured: pkg.is_featured,
            sortOrder: pkg.sort_order,
            createdAt: pkg.created_at,
            updatedAt: pkg.updated_at,
        }));

        return NextResponse.json({
            success: true,
            data: { packages: formattedPackages },
        });
    } catch (error) {
        return handleApiError(error, 'Admin packages list error', { includeSuccess: true });
    }
}

/**
 * POST /api/admin/packages
 * Create a new credit package (admin only)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const admin = await requireAdmin(request);

        const rateLimitId = getRequestIdentifier(request) + ':admin:' + admin.id;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'admin');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
                }
            );
        }

        const body = await request.json();
        const validated = CreatePackageSchema.parse(body);

        const supabase = createServerClient();

        const { data: newPackage, error } = await supabase
            .from('credit_packages')
            .insert([
                {
                    name: validated.name,
                    description: validated.description || null,
                    credits: validated.credits,
                    price: validated.price,
                    currency: validated.currency,
                    is_active: validated.isActive,
                    is_featured: validated.isFeatured,
                    sort_order: validated.sortOrder,
                },
            ])
            .select()
            .single();

        if (error) {
            logger.error('Failed to create package', { error: error.message });
            return NextResponse.json(
                { success: false, error: 'Failed to create package' },
                { status: 500 }
            );
        }

        // Log the action
        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'package_created',
            resourceType: 'package',
            resourceId: newPackage.id,
            newValues: {
                name: validated.name,
                credits: validated.credits,
                price: validated.price,
            },
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        logger.info('Package created', {
            adminId: admin.id,
            packageId: newPackage.id,
            name: validated.name,
        });

        return NextResponse.json({
            success: true,
            data: {
                package: {
                    id: newPackage.id,
                    name: newPackage.name,
                    description: newPackage.description,
                    credits: newPackage.credits,
                    price: parseFloat(newPackage.price),
                    currency: newPackage.currency,
                    isActive: newPackage.is_active,
                    isFeatured: newPackage.is_featured,
                    sortOrder: newPackage.sort_order,
                    createdAt: newPackage.created_at,
                    updatedAt: newPackage.updated_at,
                },
            },
        });
    } catch (error) {
        const extra = error instanceof z.ZodError ? { details: error.errors } : undefined;
        return handleApiError(error, 'Admin create package error', {
            includeSuccess: true,
            extra
        });
    }
}
