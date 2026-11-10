'use client';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Check, FileUp } from 'lucide-react';
import { getAllFormats } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';
interface FormatRingProps {
  selectedFormat: OutputFormat | null;
  onSelect: (format: OutputFormat) => void;
}
export default function FormatRing({ selectedFormat, onSelect }: FormatRingProps) {
  const t = useTranslations('formats');
  const dashboard = useTranslations('dashboard');
  return (
    <div className="format-workbench">
      <div className="workbench-heading">
        <FileUp size={30} strokeWidth={1.3} />
        <div>
          <span>01 / PDF → E-INVOICE</span>
          <h2>{dashboard('selectTargetFormat')}</h2>
        </div>
      </div>
      <div className="workbench-options" role="group" aria-label={dashboard('selectTargetFormat')}>
        {getAllFormats().map((format) => (
          <button
            type="button"
            key={format.id}
            onClick={() => onSelect(format.id)}
            aria-pressed={selectedFormat === format.id}
          >
            <span>{t(`${format.id}.name`)}</span>
            {selectedFormat === format.id ? <Check size={14} /> : <ArrowUpRight size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
