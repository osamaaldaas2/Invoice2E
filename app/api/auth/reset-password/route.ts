import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { ResetPasswordSchema } from '@/lib/validators';
import { authService } from '@/services/auth.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();
        const validation = ResetPasswordSchema.safeParse(body);
        if (!validation.success) {
            const message = validation.error.errors[0]?.message || 'Invalid input';
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }

        // Rate limit reset attempts
        const rateLimitId = getRequestIdentifier(request) + ':reset-password';
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'login');
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
            );
        }

        await authService.resetPassword(validation.data.token, validation.data.password);

        logger.info('Password reset completed');

        return NextResponse.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in.',
        });
    } catch (error) {
        return handleApiError(error, 'Reset password error', {
            includeSuccess: true,
            message: 'Failed to reset password',
        });
    }
}

/**
 * GET /api/auth/reset-password?token=XXX
 * Validate token without using it.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const token = request.nextUrl.searchParams.get('token');
        if (!token) {
            return NextResponse.json({ success: false, valid: false }, { status: 400 });
        }

        const result = await authService.validateResetToken(token);
        return NextResponse.json({ success: true, valid: !!result });
    } catch (error) {
        return handleApiError(error, 'Validate reset token error', {
            includeSuccess: true,
            message: 'Failed to validate token',
        });
    }
}
