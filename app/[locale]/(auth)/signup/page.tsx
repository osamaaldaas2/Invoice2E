import SignupForm from '@/components/forms/SignupForm';
import Link from 'next/link';

type SignupPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function SignupPage({ params }: SignupPageProps) {
    const { locale } = await params;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
            <div className="w-full max-w-md glass-card-strong p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white font-display">Create Account</h1>
                    <p className="text-faded mt-2">Start converting invoices to XRechnung</p>
                </div>

                <SignupForm />

                <div className="mt-6 text-center">
                    <p className="text-faded">
                        Already have an account?{' '}
                        <Link href={`/${locale}/login`} className="text-sky-200 hover:text-sky-100 font-medium">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
