/**
 * Templates API Route
 * Handles CRUD operations for invoice templates
 *
 * @route /api/invoices/templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { templateDBService, TemplateData } from '@/services/template.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

/**
 * GET /api/invoices/templates
 * List all templates for the authenticated user
 */
export async function GET(req: NextRequest) {
    try {
        // AUTH FIX: Use custom JWT session instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const rateLimitId = `${getRequestIdentifier(req)}:invoices-templates-list:${user.id}`;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
            );
        }

        const templates = await templateDBService.listTemplates(user.id);

        return NextResponse.json({
            success: true,
            data: { templates },
        });
    } catch (error) {
        return handleApiError(error, 'Failed to list templates', {
            message: 'Failed to list templates',
            includeSuccess: true
        });
    }
}

/**
 * POST /api/invoices/templates
 * Create a new template
 */
export async function POST(req: NextRequest) {
    try {
        // AUTH FIX: Use custom JWT session instead of Supabase auth
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const rateLimitId = `${getRequestIdentifier(req)}:invoices-templates:${user.id}`;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
                }
            );
        }

        const body = await req.json();

        // Validate required fields
        if (!body.name || typeof body.name !== 'string') {
            return NextResponse.json(
                { error: 'Template name is required' },
                { status: 400 }
            );
        }

        const templateData: TemplateData = {
            name: body.name,
            description: body.description,
            sellerName: body.sellerName,
            sellerEmail: body.sellerEmail,
            sellerPhone: body.sellerPhone,
            sellerTaxId: body.sellerTaxId,
            sellerIban: body.sellerIban,
            sellerBic: body.sellerBic,
            sellerAddressStreet: body.sellerAddressStreet || body.sellerAddress,
            sellerAddressPostalCode: body.sellerAddressPostalCode || body.sellerPostalCode,
            sellerAddressCity: body.sellerAddressCity || body.sellerCity,
            sellerAddressCountry: body.sellerAddressCountry || body.sellerCountryCode,
            sellerContactName: body.sellerContactName,
            buyerName: body.buyerName,
            buyerEmail: body.buyerEmail,
            buyerAddressStreet: body.buyerAddressStreet || body.buyerAddress,
            buyerAddressPostalCode: body.buyerAddressPostalCode || body.buyerPostalCode,
            buyerAddressCity: body.buyerAddressCity || body.buyerCity,
            buyerAddressCountry: body.buyerAddressCountry || body.buyerCountryCode,
            buyerReference: body.buyerReference,
            paymentTerms: body.paymentTerms,
            paymentInstructions: body.paymentInstructions,
        };

        const template = await templateDBService.saveTemplate(user.id, templateData);

        return NextResponse.json({
            success: true,
            data: { template },
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Failed to create template', {
            message: 'Failed to create template',
        });
    }
}
