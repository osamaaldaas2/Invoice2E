'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/forms/LoginForm';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { fetchSessionUser } from '@/lib/client-auth';

export default function LoginPage() {
  const router = useRouter();
  const d = useTranslations('design');
  const t = useTranslations('auth');
  const common = useTranslations('common');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchSessionUser()
      .then((user) => {
        if (user) {
          router.replace('/dashboard');
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) return null;

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <span className="closing-asterisk" aria-hidden="true">
          ✳
        </span>
        <h2>
          {d('authAsideTitle')}
          <br />
          <em>{d('authAsideAccent')}</em>
        </h2>
        <p>{d('authAsideDescription')}</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-panel">
          <div className="eyebrow">{d('loginEyebrow')}</div>
          <h1>{d('loginTitle')}</h1>
          <p>{d('loginDescription')}</p>
          <LoginForm />
          <div className="auth-switch">
            {t('no_account')} <Link href="/signup">{common('signup')}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
