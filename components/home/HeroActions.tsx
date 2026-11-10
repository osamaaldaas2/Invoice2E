'use client';
import Link from 'next/link';
import { ArrowUpRight, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/lib/user-context';
export default function HeroActions({ showDemo = true }: { showDemo?: boolean }) {
  const t = useTranslations('home');
  const design = useTranslations('design');
  const { user } = useUser();
  return (
    <div className="hero-actions">
      <Link href={user ? '/dashboard' : '/signup'} className="brand-button">
        {user ? t('goToDashboard') : t('getStartedFree')}
        <ArrowUpRight size={20} />
      </Link>
      {showDemo && (
        <a className="demo-link" href="#how-it-works">
          <span>
            <Play size={12} fill="currentColor" />
          </span>
          {design('seeHow')}
        </a>
      )}
    </div>
  );
}
