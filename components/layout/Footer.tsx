import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/lib/constants';

export default function Footer(): React.ReactElement {
    const t = useTranslations('footer');

    return (
        <footer className="border-t border-border bg-muted/50 py-8">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                        {t('copyright').replace('Invoice2E', APP_NAME)}
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t('privacy')}
                        </a>
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t('terms')}
                        </a>
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t('contact')}
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
