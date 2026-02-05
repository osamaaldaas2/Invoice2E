import { PricingCards } from '@/components/payment/PricingCards';

interface PricingPageProps {
    params: { locale: string };
}

export default function PricingPage({ params }: PricingPageProps) {
    const isGerman = params.locale === 'de';

    return (
        <div className="container mx-auto px-4 py-12">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">
                    {isGerman ? 'Preise' : 'Pricing'}
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    {isGerman
                        ? 'Wählen Sie das passende Paket für Ihre Rechnungskonvertierungen. Alle Credits sind 12 Monate gültig.'
                        : 'Choose the right package for your invoice conversions. All credits are valid for 12 months.'}
                </p>
            </div>

            <PricingCards locale={params.locale} />

            <div className="mt-12 text-center text-sm text-muted-foreground">
                <p>
                    🔒 {isGerman ? 'Sichere Zahlung mit Stripe & PayPal' : 'Secure payment with Stripe & PayPal'}
                </p>
                <p className="mt-2">
                    {isGerman
                        ? 'Credits verfallen nicht vor 12 Monaten. Keine Abos, keine versteckten Kosten.'
                        : 'Credits don\'t expire for 12 months. No subscriptions, no hidden fees.'}
                </p>
            </div>
        </div>
    );
}
