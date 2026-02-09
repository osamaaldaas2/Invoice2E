import ForgotPasswordForm from '@/components/forms/ForgotPasswordForm';
import Link from 'next/link';

type ForgotPasswordPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
    const { locale } = await params;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
            <div className="w-full max-w-md glass-card-strong p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white font-display">Forgot Password</h1>
                    <p className="text-faded mt-2">Enter your email and we&apos;ll send you a reset link</p>
                </div>

                <ForgotPasswordForm />

                <div className="mt-6 text-center">
                    <p className="text-faded">
                        Remember your password?{' '}
                        <Link href={`/${locale}/login`} className="text-sky-200 hover:text-sky-100 font-medium">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
