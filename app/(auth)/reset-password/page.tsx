import ResetPasswordForm from '@/components/forms/ResetPasswordForm';
import Link from 'next/link';
import { Suspense } from 'react';

export default function ResetPasswordPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
            <div className="w-full max-w-md glass-card-strong p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white font-display">Reset Password</h1>
                    <p className="text-faded mt-2">Choose a new password for your account</p>
                </div>

                <Suspense fallback={
                    <div className="text-center py-8">
                        <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 inline-block" />
                        <p className="text-faded mt-4">Loading...</p>
                    </div>
                }>
                    <ResetPasswordForm />
                </Suspense>

                <div className="mt-6 text-center">
                    <p className="text-faded">
                        <Link href="/login" className="text-sky-200 hover:text-sky-100 font-medium">
                            Back to Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
