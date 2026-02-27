'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';

interface Props {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useUser();

  const isSubPage = pathname !== '/dashboard';

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-120px)]">
      <main className="p-3 md:p-8">
        <div className="max-w-6xl mx-auto">
          {isSubPage && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Dashboard
            </Link>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
