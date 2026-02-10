import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { ForgotPasswordSchema } from '@/lib/validators';
import { authService } from '@/services/auth.service';
import { emailService } from '@/services/email.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();
        const validation = ForgotPasswordSchema.safeParse(body);
        if (!validation.success) {
            const message = validation.error.errors[0]?.message || 'Invalid email';
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }

        const email = validation.data.email.toLowerCase();

        // Rate limit: 3 requests per hour per email
        const rateLimitId = getRequestIdentifier(request) + ':forgot:' + email;
        const rateLimit = await checkRateLimitAsync(rateLimitId, 'login');
        if (!rateLimit.allowed) {
            // Still return 200 to prevent enumeration
            return NextResponse.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.',
            });
        }

        // Generate token and get user info
        const result = await authService.createPasswordResetToken(email);

        if (result) {
            // Build reset URL
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const resetUrl = `${appUrl}/reset-password?token=${result.token}`;

            // Send email
            await emailService.sendPasswordResetEmail(email, {
                userName: result.userName,
                resetUrl,
                expiryMinutes: 60,
            });

            logger.info('Password reset email sent', { email });
        }

        // Always return success to prevent email enumeration
        return NextResponse.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.',
        });
    } catch (error) {
        return handleApiError(error, 'Forgot password error', {
            includeSuccess: true,
            message: 'Failed to process password reset request',
        });
    }
}
