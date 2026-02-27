'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { APP_NAME, LOCALE_COOKIE_NAME } from '@/lib/constants';
import { emitAuthChanged } from '@/lib/client-auth';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/toast-context';
import { useUser } from '@/lib/user-context';

export default function Header(): React.ReactElement {
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Logout failed (${response.status})`);
      }
      emitAuthChanged();
      setMobileMenuOpen(false);
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast({ title: tErrors('logoutFailed'), variant: 'error' });
      logger.error('Header logout failed', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const switchLocale = useCallback(
    (newLocale: string) => {
      document.cookie = `${LOCALE_COOKIE_NAME}=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      // If logged in, also save to DB (fire-and-forget)
      if (user) {
        fetch('/api/users/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: newLocale }),
        }).catch(() => {});
      }
      window.location.reload();
    },
    [user]
  );

  // Prevent hydration mismatch by not rendering auth buttons until mounted
  if (!mounted) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="text-2xl font-semibold font-display tracking-tight gradient-text hover:opacity-90 transition-opacity"
          >
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-3">{/* Placeholder for hydration */}</div>
        </nav>
      </header>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="text-xl font-semibold font-display tracking-tight gradient-text hover:opacity-90 transition-opacity"
          >
            {APP_NAME}
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            {/* Formats dropdown */}
            <div className="relative group">
              <button
                className={`nav-pill ${pathname?.startsWith('/pdf-to-') || pathname === '/convert' ? 'nav-pill-active' : ''}`}
              >
                {t('formats')}
                <svg
                  className="w-3 h-3 ml-1 inline-block"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-56 py-2 bg-slate-950/95 border border-white/10 rounded-xl backdrop-blur-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <Link
                  href="/pdf-to-xrechnung"
                  className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                >
                  🇩🇪 PDF → XRechnung
                </Link>
                <Link
                  href="/pdf-to-zugferd"
                  className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                >
                  🇩🇪🇫🇷 PDF → ZUGFeRD
                </Link>
                <Link
                  href="/pdf-to-peppol"
                  className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                >
                  🇪🇺 PDF → PEPPOL
                </Link>
                <Link
                  href="/pdf-to-fatturapa"
                  className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                >
                  🇮🇹 PDF → FatturaPA
                </Link>
                <Link
                  href="/pdf-to-ksef"
                  className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                >
                  🇵🇱 PDF → KSeF
                </Link>
                <div className="border-t border-white/10 my-1" />
                <Link
                  href="/convert"
                  className="block px-4 py-2 text-sm text-sky-300 hover:text-sky-200 hover:bg-white/5 transition-colors"
                >
                  {t('allFormats')} →
                </Link>
              </div>
            </div>
            <Link
              href="/blog"
              className={`nav-pill ${pathname?.startsWith('/blog') ? 'nav-pill-active' : ''}`}
            >
              Blog
            </Link>
            <div className="flex items-center border border-white/10 rounded-lg overflow-hidden text-xs">
              <button
                onClick={() => switchLocale('en')}
                className={`px-2 py-1 transition-colors ${locale === 'en' ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                EN
              </button>
              <button
                onClick={() => switchLocale('de')}
                className={`px-2 py-1 transition-colors ${locale === 'de' ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                DE
              </button>
            </div>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={`nav-pill ${pathname?.startsWith('/dashboard') ? 'nav-pill-active' : ''}`}
                >
                  Dashboard
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                    </div>
                    <svg
                      className="w-3 h-3 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <div className="absolute top-full right-0 mt-1 w-48 py-2 bg-slate-950/95 border border-white/10 rounded-xl backdrop-blur-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="px-4 py-2 border-b border-white/10">
                      <p className="text-sm text-white font-medium">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-faded truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/dashboard/profile"
                      className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {t('profile')}
                    </Link>
                    <Link
                      href="/dashboard/credits"
                      className="block px-4 py-2 text-sm text-faded hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {t('credits') || 'Credits'}
                    </Link>
                    <div className="border-t border-white/10 my-1" />
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                    >
                      {loggingOut ? t('loading') : t('logout')}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-pill">
                  {t('login')}
                </Link>
                <Link href="/signup" className="nav-pill nav-pill-active">
                  {t('signup')}
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </Button>
        </nav>
      </header>

      {/* Mobile menu backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div
          ref={menuRef}
          className="fixed top-[var(--header-height,65px)] left-0 right-0 z-50 md:hidden border-b border-white/10 bg-slate-950/95 backdrop-blur-xl"
        >
          <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
            <div className="flex items-center justify-center border border-white/10 rounded-lg overflow-hidden text-xs self-center">
              <button
                onClick={() => switchLocale('en')}
                className={`px-3 py-1.5 transition-colors ${locale === 'en' ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                EN
              </button>
              <button
                onClick={() => switchLocale('de')}
                className={`px-3 py-1.5 transition-colors ${locale === 'de' ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                DE
              </button>
            </div>
            {user ? (
              <>
                <Link
                  href="/dashboard/profile"
                  className={`nav-pill block text-center ${pathname === '/dashboard/profile' ? 'nav-pill-active' : ''}`}
                  onClick={closeMobileMenu}
                >
                  {t('profile')}
                </Link>
                <Link
                  href="/dashboard"
                  className={`nav-pill block text-center ${pathname === '/dashboard' ? 'nav-pill-active' : ''}`}
                  onClick={closeMobileMenu}
                >
                  Dashboard
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? t('loading') : t('logout')}
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="nav-pill block text-center"
                  onClick={closeMobileMenu}
                >
                  {t('login')}
                </Link>
                <Link
                  href="/signup"
                  className="nav-pill nav-pill-active block text-center"
                  onClick={closeMobileMenu}
                >
                  {t('signup')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
