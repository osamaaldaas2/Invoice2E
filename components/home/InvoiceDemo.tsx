'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, FileText, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Illustrative local data: no file uploads, provider calls or credit charges. */
export default function InvoiceDemo() {
  const t = useTranslations('design');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !playing || step === 2) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), 2200);
    return () => window.clearTimeout(timer);
  }, [step, playing, visible]);
  return (
    <div className="invoice-demo" ref={ref} data-step={step} id="product-demo">
      <div className="demo-topline">
        <span>
          <i /> {t('demoLabel')}
        </span>
        <span>PDF → E-INVOICE</span>
      </div>
      <div className="demo-stage">
        <div className="demo-orbit" aria-hidden="true" />
        <div className="demo-paper">
          <div className="paper-brand">
            <span className="paper-brand-mark">a.</span>
            <span>
              atelier nord
              <br />
              <small>STUDIO & DESIGN</small>
            </span>
            <FileText size={19} />
          </div>
          <div className="paper-heading">
            <strong>{t('invoice')}</strong>
            <span>RE–2026–042</span>
          </div>
          <div className="paper-address">
            <span>Atelier Nord · Berlin</span>
            <span>{t('sampleCustomer')}</span>
          </div>
          <div className="paper-rule" />
          <div className="paper-row">
            <span>{t('demoService')}</span>
            <span>1.000,00 €</span>
          </div>
          <div className="paper-row">
            <span>{t('vat')} · 19 %</span>
            <span>190,00 €</span>
          </div>
          <div className="paper-total">
            <span>{t('total')}</span>
            <strong>1.190,00 €</strong>
          </div>
          <div className="paper-bottom">
            <span>IBAN DE•• •••• •••• ••••</span>
            <span>01 / 01</span>
          </div>
          {step === 1 && <div className="scan-line" aria-hidden="true" />}
        </div>
        <div className="demo-connector" aria-hidden="true">
          <ArrowDown size={22} />
        </div>
        <div className="demo-result" key={step}>
          <div className="demo-result-heading">
            <span className="demo-file-icon">
              {step === 2 ? <Check size={18} /> : <FileText size={18} />}
            </span>
            <div>
              <strong>{t(`demoStep${step}Title`)}</strong>
              <span>{t(`demoStep${step}Detail`)}</span>
            </div>
            <span className="demo-file-type">{step === 2 ? 'XML' : 'PDF'}</span>
          </div>
          <div className="demo-result-body">
            {step === 2 ? (
              <code>
                <span>&lt;Invoice&gt;</span>
                <br />
                {'  '}&lt;ID&gt;RE–2026–042&lt;/ID&gt;
                <br />
                {'  '}&lt;Total&gt;1190.00&lt;/Total&gt;
                <br />
                <span>&lt;/Invoice&gt;</span>
              </code>
            ) : (
              <>
                <div>
                  <span>{t('invoiceNumber')}</span>
                  <b>
                    RE–2026–042 <Check size={13} />
                  </b>
                </div>
                <div>
                  <span>{t('total')}</span>
                  <b>
                    1.190,00 € <Check size={13} />
                  </b>
                </div>
              </>
            )}
          </div>
        </div>
        <span className="demo-note">
          {t('demoNote')}
          <ArrowUpRight size={21} />
        </span>
      </div>
      <div className="demo-controls" aria-label={t('demoControls')}>
        {[0, 1, 2].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={step === s}
            onClick={() => {
              setPlaying(false);
              setStep(s);
            }}
          >
            <span>{s + 1}</span>
            {t(`step${s}Short`)}
          </button>
        ))}
        <button
          type="button"
          className="demo-replay"
          aria-label={t('replay')}
          onClick={() => {
            setStep(0);
            setPlaying(true);
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <p className="demo-disclaimer">{t('demoDisclaimer')}</p>
    </div>
  );
}
