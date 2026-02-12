'use client';

import React, { useState, useMemo } from 'react';
import { Control, useWatch } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { InvoiceReviewFormValues } from './useInvoiceReviewForm';

interface ReadinessPanelProps {
  control: Control<InvoiceReviewFormValues>;
}

const IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CheckKey =
  | 'checkInvoiceNumber'
  | 'checkInvoiceDate'
  | 'checkSellerName'
  | 'checkSellerEmail'
  | 'checkSellerPhone'
  | 'checkSellerStreet'
  | 'checkSellerCity'
  | 'checkSellerPostal'
  | 'checkBuyerEmail'
  | 'checkBuyerCountry'
  | 'checkIban'
  | 'checkPaymentTerms'
  | 'checkLineItems'
  | 'checkMonetary'
  | 'checkBuyerReference';

type CheckLevel = 'error' | 'warning';

interface Check {
  key: CheckKey;
  pass: boolean;
  level: CheckLevel;
}

export const ReadinessPanel: React.FC<ReadinessPanelProps> = ({ control }) => {
  const t = useTranslations('invoiceReview');
  const [expanded, setExpanded] = useState(false);

  const invoiceNumber = useWatch({ control, name: 'invoiceNumber' });
  const invoiceDate = useWatch({ control, name: 'invoiceDate' });
  const sellerName = useWatch({ control, name: 'sellerName' });
  const sellerEmail = useWatch({ control, name: 'sellerEmail' });
  const sellerPhone = useWatch({ control, name: 'sellerPhone' });
  const sellerStreet = useWatch({ control, name: 'sellerParsedAddress.street' });
  const sellerCity = useWatch({ control, name: 'sellerParsedAddress.city' });
  const sellerPostal = useWatch({ control, name: 'sellerParsedAddress.postalCode' });
  const buyerEmail = useWatch({ control, name: 'buyerEmail' });
  const buyerCountry = useWatch({ control, name: 'buyerParsedAddress.country' });
  const buyerReference = useWatch({ control, name: 'buyerReference' });
  const sellerIban = useWatch({ control, name: 'sellerIban' });
  const paymentTerms = useWatch({ control, name: 'paymentTerms' });
  const items = useWatch({ control, name: 'items' });
  const subtotal = useWatch({ control, name: 'subtotal' });
  const taxAmount = useWatch({ control, name: 'taxAmount' });
  const totalAmount = useWatch({ control, name: 'totalAmount' });

  const checks = useMemo(() => {
    const ibanClean = (sellerIban || '').replace(/\s+/g, '').toUpperCase();
    const monetaryOk =
      Math.abs((Number(subtotal) || 0) + (Number(taxAmount) || 0) - (Number(totalAmount) || 0)) <=
      0.02;

    const result: Check[] = [
      // Errors — block XRechnung conversion
      { key: 'checkInvoiceNumber', pass: !!invoiceNumber?.trim(), level: 'error' },
      {
        key: 'checkInvoiceDate',
        pass: !!invoiceDate?.trim() && DATE_PATTERN.test(invoiceDate),
        level: 'error',
      },
      { key: 'checkSellerName', pass: !!sellerName?.trim(), level: 'error' },
      { key: 'checkSellerEmail', pass: !!sellerEmail?.trim(), level: 'error' },
      { key: 'checkSellerPhone', pass: !!sellerPhone?.trim(), level: 'error' },
      { key: 'checkSellerStreet', pass: !!sellerStreet?.trim(), level: 'error' },
      { key: 'checkSellerCity', pass: !!sellerCity?.trim(), level: 'error' },
      { key: 'checkSellerPostal', pass: !!sellerPostal?.trim(), level: 'error' },
      { key: 'checkBuyerEmail', pass: !!buyerEmail?.trim(), level: 'error' },
      { key: 'checkBuyerCountry', pass: !!buyerCountry?.trim(), level: 'error' },
      { key: 'checkIban', pass: !!ibanClean && IBAN_PATTERN.test(ibanClean), level: 'error' },
      { key: 'checkPaymentTerms', pass: !!paymentTerms?.trim(), level: 'error' },
      { key: 'checkLineItems', pass: Array.isArray(items) && items.length > 0, level: 'error' },
      { key: 'checkMonetary', pass: monetaryOk, level: 'error' },
      // Warnings — recommended but non-blocking (matches BR-DE-15 severity)
      { key: 'checkBuyerReference', pass: !!buyerReference?.trim(), level: 'warning' },
    ];
    return result;
  }, [
    invoiceNumber,
    invoiceDate,
    sellerName,
    sellerEmail,
    sellerPhone,
    sellerStreet,
    sellerCity,
    sellerPostal,
    buyerEmail,
    buyerCountry,
    buyerReference,
    sellerIban,
    paymentTerms,
    items,
    subtotal,
    taxAmount,
    totalAmount,
  ]);

  const errorChecks = checks.filter((c) => c.level === 'error');
  const warningChecks = checks.filter((c) => c.level === 'warning');
  const errorsPassed = errorChecks.filter((c) => c.pass).length;
  const warningsPassed = warningChecks.filter((c) => c.pass).length;
  const totalErrors = errorChecks.length;
  const isReady = errorsPassed === totalErrors;
  const hasWarnings = warningsPassed < warningChecks.length;

  const colorClass =
    isReady && !hasWarnings
      ? 'border-emerald-400/30 bg-emerald-500/10'
      : isReady
        ? 'border-amber-400/30 bg-amber-500/10'
        : errorsPassed >= 10
          ? 'border-amber-400/30 bg-amber-500/10'
          : 'border-rose-400/30 bg-rose-500/10';

  const textColor =
    isReady && !hasWarnings
      ? 'text-emerald-200'
      : isReady
        ? 'text-amber-200'
        : errorsPassed >= 10
          ? 'text-amber-200'
          : 'text-rose-200';

  return (
    <div className={`rounded-2xl border ${colorClass} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <span className={`text-sm font-semibold ${textColor}`}>{t('readinessTitle')}</span>
          <span className={`text-xs ml-2 ${textColor}`}>
            {t('readinessCount', { count: errorsPassed, total: totalErrors })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${textColor}`}>
            {isReady ? t('readinessReady') : t('readinessNotReady')}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
          {checks.map(({ key, pass, level }) => (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <span
                className={
                  pass
                    ? 'text-emerald-400'
                    : level === 'warning'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }
              >
                {pass ? '\u2713' : level === 'warning' ? '\u26A0' : '\u2717'}
              </span>
              <span className={`text-xs ${pass ? 'text-slate-400' : 'text-slate-200'}`}>
                {t(key)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
