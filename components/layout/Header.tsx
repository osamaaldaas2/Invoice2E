'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { LOCALE_COOKIE_NAME } from '@/lib/constants';
import { emitAuthChanged } from '@/lib/client-auth';
import { logger } from '@/lib/logger';
import { useToast } from '@/lib/toast-context';
import { useUser } from '@/lib/user-context';
import Brand from './Brand';

export default function Header(): React.ReactElement {
  const t = useTranslations('common');
  const d = useTranslations('design');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { user } = useUser();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const menuOpen = openPath !== null && openPath === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const paper =
    pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/pricing';
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPath(null);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);
  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error(`Logout failed (${response.status})`);
      emitAuthChanged();
      setOpenPath(null);
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast({ title: tErrors('logoutFailed'), variant: 'error' });
      logger.error('Header logout failed', error);
    } finally {
      setLoggingOut(false);
    }
  };
  const switchLocale = useCallback(
    (newLocale: string) => {
      if (newLocale === locale) return;
      document.cookie = `${LOCALE_COOKIE_NAME}=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      if (user) {
        void fetch('/api/users/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: newLocale }),
          keepalive: true,
        }).catch(() => {});
      }
      window.location.reload();
    },
    [user, locale]
  );
  const languages = (
    <div className="locale-switch" role="group" aria-label={d('language')}>
      {['de', 'en'].map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={locale === lang}
          lang={lang}
          onClick={() => switchLocale(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
  const navLinks = [
    { href: '/#how-it-works', label: d('howNav') },
    { href: '/convert', label: t('formats') },
    { href: '/pricing', label: d('pricingNav') },
    { href: '/blog', label: 'Journal' },
  ];
  return (
    <header className={`site-header ${paper ? 'site-header-paper' : ''}`}>
      <nav
        className="site-nav brand-container"
        aria-label={locale === 'de' ? 'Hauptnavigation' : 'Main navigation'}
      >
        <Link href="/" aria-label="Invoice2E — Home" onClick={() => setOpenPath(null)}>
          <Brand />
        </Link>
        <div className="desktop-links">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="header-actions">
          {languages}
          {user ? (
            <>
              <Link className="header-login" href="/dashboard/profile">
                {t('profile')}
              </Link>
              <Link className="brand-button" href="/dashboard">
                {d('workspace')}
                <ArrowUpRight size={15} />
              </Link>
              <button type="button" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? t('loading') : t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link className="header-login" href="/login">
                {t('login')}
              </Link>
              <Link className="brand-button" href="/signup">
                {t('signup')}
                <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
        <button
          ref={toggleRef}
          type="button"
          className="mobile-menu-toggle"
          aria-label={d(menuOpen ? 'closeMenu' : 'openMenu')}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setOpenPath(menuOpen ? null : pathname)}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </nav>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="mobile-nav brand-container"
          aria-label={d('openMenu')}
        >
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpenPath(null)}>
              {link.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/dashboard" onClick={() => setOpenPath(null)}>
                {d('workspace')}
              </Link>
              <Link href="/dashboard/profile" onClick={() => setOpenPath(null)}>
                {t('profile')}
              </Link>
              <button type="button" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? t('loading') : t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setOpenPath(null)}>
                {t('login')}
              </Link>
              <Link href="/signup" onClick={() => setOpenPath(null)}>
                {t('signup')} ↗
              </Link>
            </>
          )}
          {languages}
        </nav>
      )}
    </header>
  );
}
