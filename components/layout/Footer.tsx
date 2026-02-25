import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/lib/constants';

export default function Footer(): React.ReactElement {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-white/10 bg-slate-950/60 py-10">
      <div className="container mx-auto px-4">
        <div className="glass-panel rounded-2xl px-6 py-8">
          {/* Link Columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            {/* Formats */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('formats')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="/pdf-to-xrechnung"
                    className="text-faded hover:text-white transition-colors"
                  >
                    PDF → XRechnung
                  </a>
                </li>
                <li>
                  <a
                    href="/pdf-to-zugferd"
                    className="text-faded hover:text-white transition-colors"
                  >
                    PDF → ZUGFeRD
                  </a>
                </li>
                <li>
                  <a
                    href="/pdf-to-peppol"
                    className="text-faded hover:text-white transition-colors"
                  >
                    PDF → PEPPOL
                  </a>
                </li>
                <li>
                  <a
                    href="/pdf-to-fatturapa"
                    className="text-faded hover:text-white transition-colors"
                  >
                    PDF → FatturaPA
                  </a>
                </li>
                <li>
                  <a href="/pdf-to-ksef" className="text-faded hover:text-white transition-colors">
                    PDF → KSeF
                  </a>
                </li>
              </ul>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('product')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/pricing" className="text-faded hover:text-white transition-colors">
                    {t('pricing')}
                  </a>
                </li>
                <li>
                  <a href="/blog" className="text-faded hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/signup" className="text-faded hover:text-white transition-colors">
                    {t('getStarted')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/privacy" className="text-faded hover:text-white transition-colors">
                    {t('privacy')}
                  </a>
                </li>
                <li>
                  <a href="/impressum" className="text-faded hover:text-white transition-colors">
                    {t('impressum')}
                  </a>
                </li>
                <li>
                  <a href="/terms" className="text-faded hover:text-white transition-colors">
                    {t('terms')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('contactTitle')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="mailto:mail@invoice2e.eu"
                    className="text-faded hover:text-white transition-colors"
                  >
                    {t('contact')}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-faded">
              {t('copyright')
                .replace('Invoice2E', APP_NAME)
                .replace(/20\d{2}/, String(new Date().getFullYear()))}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
