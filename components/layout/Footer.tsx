import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import Brand from './Brand';
export default function Footer(): React.ReactElement {
  const t = useTranslations('footer');
  const d = useTranslations('design');
  return (
    <footer className="site-footer">
      <div className="brand-container">
        <div className="footer-main">
          <div className="footer-brand">
            <Link href="/" aria-label="Invoice2E — Home">
              <Brand />
            </Link>
            <p>{d('footerTagline')}</p>
            <span>{d('footerDescription')}</span>
          </div>
          <div className="footer-column">
            <h4>{t('product')}</h4>
            <Link href="/convert">{t('formats')}</Link>
            <Link href="/pricing">{t('pricing')}</Link>
            <Link href="/blog">Journal</Link>
            <Link href="/signup">{t('getStarted')}</Link>
          </div>
          <div className="footer-column">
            <h4>{t('formats')}</h4>
            <Link href="/pdf-to-xrechnung">XRechnung</Link>
            <Link href="/pdf-to-zugferd">ZUGFeRD</Link>
            <Link href="/pdf-to-peppol">Peppol</Link>
            <Link href="/pdf-to-fatturapa">FatturaPA</Link>
            <Link href="/pdf-to-ksef">KSeF</Link>
          </div>
          <div className="footer-column">
            <h4>{t('legal')}</h4>
            <Link href="/privacy">{t('privacy')}</Link>
            <Link href="/impressum">{t('impressum')}</Link>
            <Link href="/terms">{t('terms')}</Link>
            <a href="mailto:mail@invoice2e.eu">{t('contact')}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t('copyright').replace(/20\d{2}/, String(new Date().getFullYear()))}</span>
          <a href="mailto:mail@invoice2e.eu">
            mail@invoice2e.eu
            <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
    </footer>
  );
}
