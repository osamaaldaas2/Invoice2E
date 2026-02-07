/**
 * Packages API Route
 * Public endpoint for fetching active credit packages
 * 
 * GET /api/packages - Returns all active packages for pricing page
 */

import { NextResponse } from 'next/server';
import { packageService } from '@/services/package.service';
import { handleApiError } from '@/lib/api-helpers';

export async function GET() {
    try {
        const packages = await packageService.getActivePackages();

        return NextResponse.json({
            success: true,
            packages,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return handleApiError(error, 'Failed to fetch packages', {
            includeSuccess: true,
            message: 'Failed to load pricing packages',
            extra: { timestamp: new Date().toISOString() }
        });
    }
}
