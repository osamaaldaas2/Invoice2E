import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  FileUp,
  SlidersHorizontal,
  Download,
  Plus,
} from 'lucide-react';
import HeroActions from '@/components/home/HeroActions';
import InvoiceDemo from '@/components/home/InvoiceDemo';
import Reveal from '@/components/home/Reveal';

export const metadata: Metadata = { alternates: { canonical: '/' } };
const formats = [
  ['DE', 'XRechnung', 'XML', '/pdf-to-xrechnung'],
  ['DE / FR', 'ZUGFeRD / Factur-X', 'PDF + XML', '/pdf-to-zugferd'],
  ['EU', 'Peppol BIS', 'XML', '/pdf-to-peppol'],
  ['IT', 'FatturaPA', 'XML', '/pdf-to-fatturapa'],
  ['PL', 'KSeF', 'XML', '/pdf-to-ksef'],
  ['NL', 'NL-CIUS', 'XML', '/pdf-to-nlcius'],
];
export default async function Home() {
  const t = await getTranslations('design');
  const home = await getTranslations('home');
  const faq = [0, 1, 2, 3].map((i) => ({ question: t(`faq${i}Q`), answer: t(`faq${i}A`) }));
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Invoice2E',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://www.invoice2e.eu',
      description: t('heroDescription'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ];
  return (
    <div className="brand-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <section className="brand-hero brand-container" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {t('eyebrow')}
          </div>
          <h1 id="hero-heading">
            {t('heroTitle')}
            <br />
            <em>{t('heroAccent')}</em>
          </h1>
          <p className="hero-description">{t('heroDescription')}</p>
          <HeroActions />
          <p className="hero-footnote">
            <Check size={14} />
            {home('noCardRequired')}
          </p>
          <a href="#formats" className="hero-bottom-link">
            {t('madeFor')} <ArrowDown size={15} />
          </a>
        </div>
        <InvoiceDemo />
      </section>
      <div className="format-ribbon">
        <div className="brand-container">
          <span>{t('ribbonLabel')}</span>
          <strong>XRechnung</strong>
          <strong>ZUGFeRD</strong>
          <strong>Peppol</strong>
          <strong>Factur-X</strong>
          <Link href="/convert">
            {t('allFormats')}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <section className="brand-section brand-container" id="how-it-works">
        <Reveal className="section-heading">
          <div>
            <p className="eyebrow">01 / {t('workflowLabel')}</p>
            <h2>
              {t('workflowTitle')}
              <br />
              <em>{t('workflowAccent')}</em>
            </h2>
          </div>
          <p>{t('workflowDescription')}</p>
        </Reveal>
        <div className="workflow-grid">
          {[FileUp, SlidersHorizontal, Download].map((Icon, i) => (
            <Reveal key={i} className="workflow-item">
              <div className="workflow-top">
                <span>0{i + 1}</span>
                <Icon size={28} strokeWidth={1.4} />
              </div>
              <h3>{t(`step${i}Title`)}</h3>
              <p>{t(`step${i}Description`)}</p>
              <span className="workflow-caption">{t(`step${i}Caption`)}</span>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="control-section">
        <div className="brand-container control-grid">
          <Reveal className="control-visual">
            <div className="review-sheet">
              <div className="review-sheet-heading">
                <span>{t('reviewTitle')}</span>
                <span className="review-tag">{t('reviewTag')}</span>
              </div>
              <div className="review-field">
                <span>{t('invoiceNumber')}</span>
                <strong>
                  RE?2026?042
                  <Check size={16} />
                </strong>
              </div>
              <div className="review-field">
                <span>{t('demoSeller')}</span>
                <strong>
                  Atelier Nord
                  <Check size={16} />
                </strong>
              </div>
              <div className="review-field review-field-active">
                <span>{t('total')}</span>
                <strong>
                  1.190,00 ?<span className="review-caret" />
                </strong>
              </div>
              <div className="review-sheet-bottom">
                <span>{t('reviewFootnote')}</span>
                <SlidersHorizontal size={18} />
              </div>
            </div>
            <span className="control-caption">{t('controlCaption')}</span>
          </Reveal>
          <Reveal className="control-copy">
            <p className="eyebrow">02 / {t('controlLabel')}</p>
            <h2>
              {t('controlTitle')}
              <br />
              <em>{t('controlAccent')}</em>
            </h2>
            <p>{t('controlDescription')}</p>
            <ul>
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <Check size={17} />
                  {t(`controlPoint${i}`)}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="text-link">
              {t('controlCta')}
              <ArrowUpRight size={19} />
            </Link>
          </Reveal>
        </div>
      </section>
      <section className="brand-section brand-container" id="formats">
        <Reveal className="section-heading">
          <div>
            <p className="eyebrow">03 / {t('formatsLabel')}</p>
            <h2>
              {t('formatsTitle')}
              <br />
              <em>{t('formatsAccent')}</em>
            </h2>
          </div>
          <p>{t('formatsDescription')}</p>
        </Reveal>
        <div className="formats-editorial">
          {formats.map(([country, name, ext, href]) => (
            <Link href={href!} key={name} className="format-editorial">
              <span className="format-country">{country}</span>
              <h3>{name}</h3>
              <span className="format-extension">{ext}</span>
              <ArrowUpRight size={21} />
            </Link>
          ))}
        </div>
        <Link href="/convert" className="text-link formats-all">
          {t('allFormats')}
          <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="brand-container pricing-note">
        <div>
          <p className="eyebrow">{t('pricingLabel')}</p>
          <h2>{t('pricingTitle')}</h2>
          <p>{t('pricingDescription')}</p>
        </div>
        <Link href="/pricing" className="brand-button brand-button-light">
          {t('pricingCta')}
          <ArrowUpRight size={20} />
        </Link>
      </section>
      <section className="brand-section brand-container faq-section">
        <div>
          <p className="eyebrow">{t('faqLabel')}</p>
          <h2>
            {t('faqTitle')}
            <br />
            <em>{t('faqAccent')}</em>
          </h2>
        </div>
        <div className="faq-list">
          {faq.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={20} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <Reveal className="brand-container closing-inner">
          <span className="closing-asterisk" aria-hidden="true">
            ✳
          </span>
          <p className="eyebrow">{t('closingLabel')}</p>
          <h2>
            {t('closingTitle')}
            <br />
            <em>{t('closingAccent')}</em>
          </h2>
          <HeroActions showDemo={false} />
          <p className="closing-footnote">{home('noCardRequired')}</p>
        </Reveal>
      </section>
    </div>
  );
}
