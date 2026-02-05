import SignupForm from '@/components/forms/SignupForm';
import Link from 'next/link';

export default function SignupPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
                    <p className="text-gray-600 mt-2">Start converting invoices to XRechnung</p>
                </div>

                <SignupForm />

                <div className="mt-6 text-center">
                    <p className="text-gray-600">
                        Already have an account?{' '}
                        <Link href="/login" className="text-green-600 hover:text-green-800 font-medium">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
