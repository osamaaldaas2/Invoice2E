'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUser } from '@/lib/user-context';

interface Props {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useUser();
  const t = useTranslations('dashboard');

  const navItems = [
    { href: '/dashboard', label: t('navDashboard'), icon: '🏠' },
    { href: '/dashboard/history', label: t('navHistory'), icon: '📋' },
    { href: '/dashboard/analytics', label: t('navAnalytics'), icon: '📊' },
    { href: '/dashboard/templates', label: t('navTemplates'), icon: '📝' },
    { href: '/dashboard/credits', label: t('navCredits'), icon: '💳' },
    { href: '/invoices/bulk-upload', label: t('navBulkUpload'), icon: '📦' },
  ];

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="flex min-w-0">
        {/* Sidebar Navigation */}
        <aside className="hidden md:flex md:flex-col w-60 min-h-screen fixed left-0 top-16 border-r border-white/10 bg-slate-950/80 backdrop-blur-xl">
          {/* User Card */}
          <div className="p-4 pb-3">
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {(user.firstName?.[0] || user.email[0]).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-sky-200 transition-colors">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-faded truncate">{user.email}</p>
              </div>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-100 font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400" />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="p-3 border-t border-white/10">
            <Link
              href="/pricing"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sky-300 hover:text-sky-200 hover:bg-white/5 transition-colors"
            >
              <span>✨</span>
              <span>{t('upgradePlan') || 'Credits kaufen'}</span>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 ml-0 md:ml-60 p-3 md:p-8">
          <div className="max-w-6xl mx-auto overflow-hidden">
            <div className="md:hidden mb-6">
              <div className="flex items-center gap-2 mb-4 min-w-0">
                <span className="chip shrink-0">{user.firstName}</span>
                <span className="text-faded text-sm truncate min-w-0">{user.email}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {navItems.map((item) => {
                  const fullPath = item.href;
                  const isActive = pathname === fullPath;
                  return (
                    <Link
                      key={item.href}
                      href={fullPath}
                      className={`nav-pill whitespace-nowrap ${isActive ? 'nav-pill-active' : ''}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
