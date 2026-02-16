'use client';

import { useState, useEffect } from 'react';
import { getAllFormats, type FormatMetadata } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

const SESSION_KEY = 'invoice2e_output_format';

interface FormatSelectorProps {
  value: OutputFormat;
  onChange: (format: OutputFormat) => void;
}

const SYNTAX_GROUP_LABELS: Record<string, string> = {
  CII: '🇩🇪 CII-based',
  UBL: '🇪🇺 UBL-based',
  'PDF+CII': '📄 Hybrid PDF',
  FatturaPA: '🇮🇹 Italy',
  KSeF: '🇵🇱 Poland',
};

const SYNTAX_ORDER = ['CII', 'UBL', 'PDF+CII', 'FatturaPA', 'KSeF'];

function groupBySyntax(formats: FormatMetadata[]): Map<string, FormatMetadata[]> {
  const groups = new Map<string, FormatMetadata[]>();
  for (const f of formats) {
    const key = f.syntaxType;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  return groups;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  const formats = getAllFormats();
  const grouped = groupBySyntax(formats);

  return (
    <div className="border-t border-white/10 pt-4">
      <label
        htmlFor="outputFormat"
        className="block text-sm font-medium text-slate-300 mb-1"
      >
        Output Format / Ausgabeformat
      </label>
      <select
        id="outputFormat"
        value={value}
        onChange={(e) => onChange(e.target.value as OutputFormat)}
        className="w-full px-4 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white appearance-none cursor-pointer"
      >
        {SYNTAX_ORDER.map((syntax) => {
          const group = grouped.get(syntax);
          if (!group) return null;
          return (
            <optgroup key={syntax} label={SYNTAX_GROUP_LABELS[syntax] || syntax}>
              {group.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName} — {f.countries.join(', ')} ({f.fileExtension})
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <p className="text-xs text-slate-500 mt-1">
        {formats.find((f) => f.id === value)?.description}
      </p>
    </div>
  );
}

export function useFormatPreference(): [OutputFormat, (f: OutputFormat) => void] {
  const [format, setFormat] = useState<OutputFormat>('xrechnung-cii');

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) setFormat(saved as OutputFormat);
    } catch {}
  }, []);

  const setAndPersist = (f: OutputFormat) => {
    setFormat(f);
    try {
      sessionStorage.setItem(SESSION_KEY, f);
    } catch {}
  };

  return [format, setAndPersist];
}
