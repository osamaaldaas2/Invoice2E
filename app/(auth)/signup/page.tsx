'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SignupForm from '@/components/forms/SignupForm';
import Link from 'next/link';
import { fetchSessionUser } from '@/lib/client-auth';

export default function SignupPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        fetchSessionUser().then((user) => {
            if (user) {
                router.replace('/dashboard');
            } else {
                setReady(true);
            }
        }).catch(() => setReady(true));
    }, [router]);

    if (!ready) return null;

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
                        <Link href="/login" className="text-sky-200 hover:text-sky-100 font-medium">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
