'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { getAllFormats } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

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

interface FormatRingProps {
  selectedFormat: OutputFormat | null;
  onSelect: (format: OutputFormat) => void;
}

export default function FormatRing({ selectedFormat, onSelect }: FormatRingProps) {
  const tFormats = useTranslations('formats');
  const ringRef = useRef<HTMLDivElement>(null);
  const formats = getAllFormats();

  useEffect(() => {
    if (!ringRef.current) return;
    const ring = ringRef.current;
    const items = ring.querySelectorAll<HTMLElement>('[data-format-item]');
    const ringW = ring.offsetWidth;
    const ringH = ring.offsetHeight;
    const cx = ringW / 2;
    const cy = ringH / 2;
    const radius = Math.min(cx, cy) - 20;
    const n = items.length;

    items.forEach((item, i) => {
      const angle = ((-90 + (i * 360) / n) * Math.PI) / 180;
      const iw = item.getBoundingClientRect().width;
      const ih = item.getBoundingClientRect().height;
      item.style.left = `${cx + radius * Math.cos(angle) - iw / 2}px`;
      item.style.top = `${cy + radius * Math.sin(angle) - ih / 2}px`;
    });
  }, [formats.length]);

  return (
    <div ref={ringRef} className="relative w-[280px] h-[280px] md:w-[320px] md:h-[320px] mx-auto">
      {/* Connector ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] md:w-[220px] md:h-[220px] rounded-full border border-dashed border-white/[0.04] pointer-events-none" />

      {/* Format items */}
      {formats.map((f) => {
        const isSelected = selectedFormat === f.id;
        return (
          <button
            key={f.id}
            data-format-item
            onClick={() => onSelect(f.id)}
            className={`absolute flex flex-col items-center justify-center gap-0.5 w-[68px] h-[44px] md:w-[80px] md:h-[48px] rounded-xl border transition-all duration-200 ${
              isSelected
                ? 'bg-sky-500/15 border-sky-400/40 shadow-[0_0_24px_rgba(56,189,248,0.1)] scale-105'
                : 'bg-white/[0.03] border-white/[0.06] hover:bg-sky-500/10 hover:border-sky-400/25 hover:scale-105'
            }`}
          >
            <span className="text-sm md:text-base leading-none">{FORMAT_FLAGS[f.id] || '🌐'}</span>
            <span
              className={`text-[8px] md:text-[9px] font-semibold leading-none ${
                isSelected ? 'text-sky-300' : 'text-slate-500'
              }`}
            >
              {tFormats(`${f.id}.name`)}
            </span>
          </button>
        );
      })}

      {/* Upload circle center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-[120px] md:w-[140px] md:h-[140px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.1)_0%,rgba(9,9,11,0.95)_70%)] border-2 border-dashed border-sky-400/25 flex flex-col items-center justify-center z-10 transition-all hover:border-sky-400/50 hover:shadow-[0_0_60px_rgba(56,189,248,0.12)] cursor-pointer">
        <svg
          className="w-7 h-7 md:w-8 md:h-8 text-sky-400 opacity-70 mb-1"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <span className="text-[11px] md:text-xs font-semibold text-sky-400">Hochladen</span>
        <span className="text-[9px] text-slate-600 mt-0.5">PDF · JPG · PNG</span>
      </div>
    </div>
  );
}
