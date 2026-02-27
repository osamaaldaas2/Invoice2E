'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getAllFormats, type FormatMetadata } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

const SESSION_KEY = 'invoice2e_selected_format';

const FORMAT_FLAGS: Record<string, string> = {
  'xrechnung-cii': '🇩🇪',
  'xrechnung-ubl': '🇩🇪',
  'facturx-en16931': '🇩🇪🇫🇷',
  'facturx-basic': '🇫🇷',
  'peppol-bis': '🇪🇺',
  fatturapa: '🇮🇹',
  ksef: '🇵🇱',
  nlcius: '🇳🇱',
  'cius-ro': '🇷🇴',
};

const POPULAR_FORMATS: OutputFormat[] = [
  'xrechnung-cii',
  'xrechnung-ubl',
  'facturx-en16931',
  'peppol-bis',
];

interface FormatSelectorCardProps {
  selectedFormat: OutputFormat | null;
  onSelect: (format: OutputFormat) => void;
}

export default function FormatSelectorCard({ selectedFormat, onSelect }: FormatSelectorCardProps) {
  const t = useTranslations('dashboard');
  const tFormats = useTranslations('formats');
  const formats = getAllFormats();

  const popular = formats.filter((f) => POPULAR_FORMATS.includes(f.id));
  const others = formats.filter((f) => !POPULAR_FORMATS.includes(f.id));

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300 mb-3">{t('selectFormat')}</h3>

      {/* Popular formats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {popular.map((f) => (
          <FormatCard
            key={f.id}
            format={f}
            flag={FORMAT_FLAGS[f.id] || ''}
            isSelected={selectedFormat === f.id}
            isPopular
            onClick={() => onSelect(f.id)}
            name={tFormats(`${f.id}.name`)}
          />
        ))}
      </div>

      {/* Other formats - collapsible */}
      <details className="group">
        <summary className="text-xs text-slate-400 hover:text-slate-300 cursor-pointer mb-2 select-none">
          {t('moreFormats')} ({others.length})
          <svg
            className="w-3 h-3 inline-block ml-1 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {others.map((f) => (
            <FormatCard
              key={f.id}
              format={f}
              flag={FORMAT_FLAGS[f.id] || ''}
              isSelected={selectedFormat === f.id}
              isPopular={false}
              onClick={() => onSelect(f.id)}
              name={tFormats(`${f.id}.name`)}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function FormatCard({
  format,
  flag,
  isSelected,
  isPopular,
  onClick,
  name,
}: {
  format: FormatMetadata;
  flag: string;
  isSelected: boolean;
  isPopular: boolean;
  onClick: () => void;
  name: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-all duration-200 ${
        isSelected
          ? 'bg-sky-500/15 border-sky-400/50 ring-1 ring-sky-400/30'
          : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/8'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{flag}</span>
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            format.fileExtension === '.pdf'
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-sky-500/20 text-sky-300'
          }`}
        >
          {format.fileExtension === '.pdf' ? 'PDF' : 'XML'}
        </span>
        {isSelected && (
          <svg
            className="w-4 h-4 text-sky-400 ml-auto shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <div className="text-sm font-medium text-white leading-tight">{name}</div>
      {isPopular && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          {format.countries.slice(0, 3).join(', ')}
        </div>
      )}
    </button>
  );
}

/**
 * Hook to manage format selection with URL param + sessionStorage persistence.
 */
export function useFormatSelection(): [OutputFormat | null, (f: OutputFormat) => void] {
  const searchParams = useSearchParams();

  const [format, setFormat] = useState<OutputFormat | null>(() => {
    // URL param takes priority
    const urlFormat = searchParams.get('format');
    if (urlFormat) return urlFormat as OutputFormat;

    // Then sessionStorage
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return saved as OutputFormat;
    } catch {
      // SSR or no sessionStorage
    }
    return null;
  });

  // Sync URL param on mount
  useEffect(() => {
    const urlFormat = searchParams.get('format');
    if (urlFormat && urlFormat !== format) {
      setFormat(urlFormat as OutputFormat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectFormat = (f: OutputFormat) => {
    setFormat(f);
    try {
      sessionStorage.setItem(SESSION_KEY, f);
    } catch {
      // Ignore
    }
  };

  return [format, selectFormat];
}
