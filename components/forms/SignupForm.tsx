'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { emitAuthChanged } from '@/lib/client-auth';

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const tErr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    country: 'DE',
    phone: '',
  });
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const redirectTarget = useMemo(() => {
    const fallback = '/dashboard';
    const returnUrl = searchParams?.get('returnUrl');
    if (!returnUrl) {
      return fallback;
    }

    let decoded = returnUrl;
    try {
      decoded = decodeURIComponent(returnUrl);
    } catch {
      return fallback;
    }

    if (!decoded.startsWith('/')) {
      return fallback;
    }

    return decoded;
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'country' ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError(t('passwordsNoMatch'));
      setLoading(false);
      return;
    }

    // FIX: Re-audit #9 — match server-side password policy (min 10 chars)
    if (formData.password.length < 10) {
      setError(t('passwordMinLength'));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2 || undefined,
          postalCode: formData.postalCode,
          city: formData.city,
          country: formData.country,
          phone: formData.phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || tErr('signupFailed'));
        return;
      }

      emitAuthChanged();
      router.push(redirectTarget);
    } catch {
      setError(tErr('generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-1">
            {t('first_name')}
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="John"
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-1">
            {t('last_name')}
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="Doe"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
          placeholder="you@example.com"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="addressLine1" className="block text-sm font-medium text-slate-300 mb-1">
          {t('address_line1')}
        </label>
        <input
          id="addressLine1"
          name="addressLine1"
          type="text"
          value={formData.addressLine1}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
          placeholder="Street and number"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="addressLine2" className="block text-sm font-medium text-slate-300 mb-1">
          {t('address_line2')}
        </label>
        <input
          id="addressLine2"
          name="addressLine2"
          type="text"
          value={formData.addressLine2}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
          placeholder="Apartment, suite, etc. (optional)"
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="postalCode" className="block text-sm font-medium text-slate-300 mb-1">
            {t('postal_code')}
          </label>
          <input
            id="postalCode"
            name="postalCode"
            type="text"
            value={formData.postalCode}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="12345"
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-slate-300 mb-1">
            {t('city')}
          </label>
          <input
            id="city"
            name="city"
            type="text"
            value={formData.city}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="City"
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-slate-300 mb-1">
            {t('country')}
          </label>
          <input
            id="country"
            name="country"
            type="text"
            value={formData.country}
            onChange={handleChange}
            required
            maxLength={2}
            className="w-full px-4 py-3 uppercase rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="DE"
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">
            {t('phone')}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
            placeholder="+49 170 0000000"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          required
          minLength={8}
          className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
          placeholder="********"
          disabled={loading}
        />
        <p className="text-xs text-faded mt-1">{t('passwordMinChars')}</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
          {t('confirm_password')}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
          placeholder="********"
          disabled={loading}
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="privacyConsent"
          type="checkbox"
          checked={privacyConsent}
          onChange={(e) => setPrivacyConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-sky-400 focus:ring-sky-400/60"
        />
        <label htmlFor="privacyConsent" className="text-sm text-slate-300">
          {t.rich('privacyConsent', {
            link: (chunks) => (
              <Link
                href="/privacy"
                className="text-sky-200 hover:text-sky-100 underline"
                target="_blank"
              >
                {chunks}
              </Link>
            ),
          })}
        </label>
      </div>

      {error && (
        <div className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !privacyConsent}
        className="w-full px-4 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            {t('creatingAccount')}
          </span>
        ) : (
          t('create_account')
        )}
      </button>
    </form>
  );
}
