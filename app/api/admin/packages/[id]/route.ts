import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireSuperAdmin, getClientIp, getUserAgent } from '@/lib/authorization';
import { adminAuditService } from '@/services/admin';
import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

const UpdatePackageSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    credits: z.number().int().min(1).optional(),
    price: z.number().min(0).optional(),
    currency: z.enum(['EUR', 'USD', 'GBP']).optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/packages/[id]
 * Get a single package by ID (admin only)
 */
export async function GET(
    request: NextRequest,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const admin = await requireAdmin(request);
        const { id } = await params;

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

        const { data: pkg, error } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !pkg) {
            return NextResponse.json(
                { success: false, error: 'Package not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                package: {
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
                },
            },
        });
    } catch (error) {
        logger.error('Admin get package error', { error });

        if (error instanceof Error) {
            if (error.message === 'Authentication required') {
                return NextResponse.json(
                    { success: false, error: 'Authentication required' },
                    { status: 401 }
                );
            }
            if (error.message === 'Admin access required') {
                return NextResponse.json(
                    { success: false, error: 'Admin access required' },
                    { status: 403 }
                );
            }
        }

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/admin/packages/[id]
 * Update a package (admin only)
 */
export async function PUT(
    request: NextRequest,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const admin = await requireAdmin(request);
        const { id } = await params;

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
        const validated = UpdatePackageSchema.parse(body);

        const supabase = createServerClient();

        // Get current package for audit log
        const { data: oldPackage } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('id', id)
            .single();

        if (!oldPackage) {
            return NextResponse.json(
                { success: false, error: 'Package not found' },
                { status: 404 }
            );
        }

        // Build update object
        const updateData: Record<string, unknown> = {};
        if (validated.name !== undefined) updateData.name = validated.name;
        if (validated.description !== undefined) updateData.description = validated.description;
        if (validated.credits !== undefined) updateData.credits = validated.credits;
        if (validated.price !== undefined) updateData.price = validated.price;
        if (validated.currency !== undefined) updateData.currency = validated.currency;
        if (validated.isActive !== undefined) updateData.is_active = validated.isActive;
        if (validated.isFeatured !== undefined) updateData.is_featured = validated.isFeatured;
        if (validated.sortOrder !== undefined) updateData.sort_order = validated.sortOrder;
        updateData.updated_at = new Date().toISOString();

        const { data: updatedPackage, error } = await supabase
            .from('credit_packages')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update package', { error: error.message });
            return NextResponse.json(
                { success: false, error: 'Failed to update package' },
                { status: 500 }
            );
        }

        // Log the action
        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'package_updated',
            resourceType: 'package',
            resourceId: id,
            oldValues: {
                name: oldPackage.name,
                credits: oldPackage.credits,
                price: parseFloat(oldPackage.price),
                isActive: oldPackage.is_active,
            },
            newValues: validated,
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        logger.info('Package updated', {
            adminId: admin.id,
            packageId: id,
        });

        return NextResponse.json({
            success: true,
            data: {
                package: {
                    id: updatedPackage.id,
                    name: updatedPackage.name,
                    description: updatedPackage.description,
                    credits: updatedPackage.credits,
                    price: parseFloat(updatedPackage.price),
                    currency: updatedPackage.currency,
                    isActive: updatedPackage.is_active,
                    isFeatured: updatedPackage.is_featured,
                    sortOrder: updatedPackage.sort_order,
                    createdAt: updatedPackage.created_at,
                    updatedAt: updatedPackage.updated_at,
                },
            },
        });
    } catch (error) {
        logger.error('Admin update package error', { error });

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        if (error instanceof Error) {
            if (error.message === 'Authentication required') {
                return NextResponse.json(
                    { success: false, error: 'Authentication required' },
                    { status: 401 }
                );
            }
            if (error.message === 'Admin access required') {
                return NextResponse.json(
                    { success: false, error: 'Admin access required' },
                    { status: 403 }
                );
            }
        }

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/packages/[id]
 * Delete a package (super_admin only)
 */
export async function DELETE(
    request: NextRequest,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        // Require super admin for deletion
        const admin = await requireSuperAdmin(request);
        const { id } = await params;

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

        // Get package info for audit log
        const { data: pkg } = await supabase
            .from('credit_packages')
            .select('*')
            .eq('id', id)
            .single();

        if (!pkg) {
            return NextResponse.json(
                { success: false, error: 'Package not found' },
                { status: 404 }
            );
        }

        // Check if package has been used in any transactions
        const { count } = await supabase
            .from('payment_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('package_id', id);

        if (count && count > 0) {
            // Soft delete by deactivating instead
            const { error } = await supabase
                .from('credit_packages')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) {
                logger.error('Failed to deactivate package', { error: error.message });
                return NextResponse.json(
                    { success: false, error: 'Failed to deactivate package' },
                    { status: 500 }
                );
            }

            await adminAuditService.logAdminAction({
                adminUserId: admin.id,
                action: 'package_deactivated',
                resourceType: 'package',
                resourceId: id,
                oldValues: { name: pkg.name, isActive: true },
                newValues: { isActive: false, reason: 'Has existing transactions' },
                ipAddress: getClientIp(request),
                userAgent: getUserAgent(request),
            });

            return NextResponse.json({
                success: true,
                data: {
                    message: 'Package deactivated (has existing transactions)',
                    deactivated: true,
                },
            });
        }

        // Hard delete if no transactions
        const { error } = await supabase
            .from('credit_packages')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Failed to delete package', { error: error.message });
            return NextResponse.json(
                { success: false, error: 'Failed to delete package' },
                { status: 500 }
            );
        }

        await adminAuditService.logAdminAction({
            adminUserId: admin.id,
            action: 'package_deleted',
            resourceType: 'package',
            resourceId: id,
            oldValues: { name: pkg.name, credits: pkg.credits, price: parseFloat(pkg.price) },
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
        });

        logger.info('Package deleted', {
            adminId: admin.id,
            packageId: id,
            packageName: pkg.name,
        });

        return NextResponse.json({
            success: true,
            data: { message: 'Package deleted successfully' },
        });
    } catch (error) {
        logger.error('Admin delete package error', { error });

        if (error instanceof Error) {
            if (error.message === 'Authentication required') {
                return NextResponse.json(
                    { success: false, error: 'Authentication required' },
                    { status: 401 }
                );
            }
            if (error.message === 'Admin access required' || error.message === 'Super admin access required') {
                return NextResponse.json(
                    { success: false, error: 'Super admin access required' },
                    { status: 403 }
                );
            }
        }

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
