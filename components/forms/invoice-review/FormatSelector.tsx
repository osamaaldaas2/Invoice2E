'use client';

import { useState } from 'react';
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

interface FormatPreselectedProps {
  value: OutputFormat;
  onChangeClick: () => void;
}

export function FormatPreselected({ value, onChangeClick }: FormatPreselectedProps) {
  const formats = getAllFormats();
  const selected = formats.find((f) => f.id === value);
  if (!selected) return null;

  return (
    <div className="border-t border-white/10 pt-4">
      <label className="block text-sm font-medium text-slate-300 mb-1">
        Output Format / Ausgabeformat
      </label>
      <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-400/30">
        <span className="text-white font-medium flex-1">
          {selected.displayName} — {selected.countries.join(', ')} ({selected.fileExtension})
        </span>
        <button
          type="button"
          onClick={onChangeClick}
          className="text-xs text-sky-300 hover:text-sky-200 underline underline-offset-2"
        >
          Ändern
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1">{selected.description}</p>
    </div>
  );
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  const formats = getAllFormats();
  const grouped = groupBySyntax(formats);

  return (
    <div className="border-t border-white/10 pt-4">
      <label htmlFor="outputFormat" className="block text-sm font-medium text-slate-300 mb-1">
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

const DASHBOARD_FORMAT_KEY = 'invoice2e_selected_format';

export function useFormatPreference(): [OutputFormat, (f: OutputFormat) => void, boolean] {
  // hasPreselection: true if format was picked in dashboard
  const [hasPreselection] = useState<boolean>(() => {
    try {
      return !!sessionStorage.getItem(DASHBOARD_FORMAT_KEY);
    } catch {}
    return false;
  });

  const [format, setFormat] = useState<OutputFormat>(() => {
    try {
      // Priority: review key > dashboard key > default
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return saved as OutputFormat;
      const dashboardFormat = sessionStorage.getItem(DASHBOARD_FORMAT_KEY);
      if (dashboardFormat) return dashboardFormat as OutputFormat;
    } catch {}
    return 'xrechnung-cii';
  });

  const setAndPersist = (f: OutputFormat) => {
    setFormat(f);
    try {
      sessionStorage.setItem(SESSION_KEY, f);
    } catch {}
  };

  return [format, setAndPersist, hasPreselection];
}
