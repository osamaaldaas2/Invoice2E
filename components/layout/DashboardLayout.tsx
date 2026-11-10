'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Clock, CreditCard, User } from 'lucide-react';
import { useUser } from '@/lib/user-context';

interface Props {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useUser();

  const t = useTranslations('common');
  const links = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/dashboard/history', label: t('viewHistory'), icon: Clock },
    { href: '/dashboard/credits', label: t('credits'), icon: CreditCard },
    { href: '/dashboard/profile', label: t('profile'), icon: User },
  ];

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
    <div className="workspace-shell min-h-[calc(100vh-120px)]">
      <div className="brand-container pb-12">
        <nav className="workspace-nav" aria-label={t('dashboard')}>
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
