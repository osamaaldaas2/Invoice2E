import LoginForm from '@/components/forms/LoginForm';
import Link from 'next/link';

type LoginPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function LoginPage({ params }: LoginPageProps) {
    const { locale } = await params;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
            <div className="w-full max-w-md glass-card-strong p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white font-display">Welcome Back</h1>
                    <p className="text-faded mt-2">Sign in to your Invoice2E account</p>
                </div>

                <LoginForm />

                <div className="mt-6 text-center">
                    <p className="text-faded">
                        Don&apos;t have an account?{' '}
                        <Link href={`/${locale}/signup`} className="text-sky-200 hover:text-sky-100 font-medium">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
