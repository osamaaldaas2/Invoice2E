import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/lib/constants';

export default function Footer(): React.ReactElement {
    const t = useTranslations('footer');

    return (
        <footer className="border-t border-white/10 bg-slate-950/60 py-10">
            <div className="container mx-auto px-4">
                <div className="glass-panel rounded-2xl px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-sm text-faded">
                        {t('copyright').replace('Invoice2E', APP_NAME).replace(/20\d{2}/, String(new Date().getFullYear()))}
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                        <a href="/privacy" className="text-faded hover:text-white transition-colors">
                            {t('privacy')}
                        </a>
                        <a href="/terms" className="text-faded hover:text-white transition-colors">
                            {t('terms')}
                        </a>
                        <a href="mailto:support@invoice2e.com" className="text-faded hover:text-white transition-colors">
                            {t('contact')}
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
