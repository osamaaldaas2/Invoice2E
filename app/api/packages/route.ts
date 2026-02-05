/**
 * Packages API Route
 * Public endpoint for fetching active credit packages
 * 
 * GET /api/packages - Returns all active packages for pricing page
 */

import { NextResponse } from 'next/server';
import { packageService } from '@/services/package.service';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const packages = await packageService.getActivePackages();

        return NextResponse.json({
            success: true,
            packages,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to fetch packages', { error });

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to load pricing packages',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
