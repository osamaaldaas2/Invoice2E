/**
 * Template by ID API Route
 * Handles single template operations
 * 
 * @route /api/invoices/templates/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { templateDBService } from '@/services/template.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/invoices/templates/[id]
 * Get a single template by ID
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // AUTH FIX: Use custom JWT auth instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const template = await templateDBService.getTemplate(user.id, id);

        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            template,
        });
    } catch (error) {
        logger.error('Failed to get template', { error });
        return NextResponse.json(
            { error: 'Failed to get template' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/invoices/templates/[id]
 * Update a template
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // AUTH FIX: Use custom JWT auth instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const template = await templateDBService.updateTemplate(user.id, id, body);

        return NextResponse.json({
            success: true,
            template,
        });
    } catch (error) {
        logger.error('Failed to update template', { error });
        return NextResponse.json(
            { error: 'Failed to update template' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/invoices/templates/[id]
 * Delete a template
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // AUTH FIX: Use custom JWT auth instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        await templateDBService.deleteTemplate(user.id, id);

        return NextResponse.json({
            success: true,
            message: 'Template deleted',
        });
    } catch (error) {
        logger.error('Failed to delete template', { error });
        return NextResponse.json(
            { error: 'Failed to delete template' },
            { status: 500 }
        );
    }
}
