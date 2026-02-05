'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CreditPackage } from '@/types/credit-package';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PricingCardsProps {
    locale?: string;
}

export function PricingCards({ locale = 'en' }: PricingCardsProps) {
    const router = useRouter();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                const response = await fetch('/api/packages');
                const data = await response.json();
                if (data.success) {
                    setPackages(data.packages || []);
                }
            } catch (error) {
                console.error('Failed to load packages:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, []);

    const handleSelectPackage = (slug: string) => {
        setSelectedSlug(slug);
        router.push(`/${locale}/checkout?package=${slug}`);
    };

    const getLocalizedName = (pkg: CreditPackage) =>
        locale === 'de' && pkg.name_de ? pkg.name_de : pkg.name;

    const getLocalizedDescription = (pkg: CreditPackage) =>
        locale === 'de' && pkg.description_de ? pkg.description_de : pkg.description;

    if (loading) {
        return (
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card rounded-lg p-6 animate-pulse">
                        <div className="h-8 bg-muted rounded w-32 mb-4" />
                        <div className="h-4 bg-muted rounded w-48 mb-6" />
                        <div className="h-12 bg-muted rounded w-24 mb-6" />
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map((j) => (
                                <div key={j} className="h-4 bg-muted rounded w-full" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {packages.map((pkg) => (
                <div
                    key={pkg.id}
                    className={cn(
                        'relative bg-card rounded-lg border p-6 transition-all',
                        pkg.is_popular && 'border-primary shadow-lg scale-105 z-10'
                    )}
                >
                    {pkg.is_popular && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                            {locale === 'de' ? 'Am beliebtesten' : 'Most Popular'}
                        </span>
                    )}

                    <h3 className="text-2xl font-bold mb-2">{getLocalizedName(pkg)}</h3>
                    <p className="text-muted-foreground mb-4">{getLocalizedDescription(pkg)}</p>

                    <div className="mb-6">
                        <span className="text-4xl font-bold">
                            {pkg.currency === 'EUR' ? '€' : '$'}{pkg.price}
                        </span>
                        {pkg.savings_percent && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                                {locale === 'de' ? 'Spare' : 'Save'} {pkg.savings_percent}%
                            </span>
                        )}
                    </div>

                    <ul className="space-y-2 mb-6">
                        <li className="flex items-center text-sm">
                            <CheckIcon />
                            {pkg.credits} {locale === 'de' ? 'Konvertierungen' : 'conversions'}
                        </li>
                        <li className="flex items-center text-sm">
                            <CheckIcon />
                            {locale === 'de' ? '1 Jahr gültig' : 'Valid for 1 year'}
                        </li>
                        <li className="flex items-center text-sm">
                            <CheckIcon />
                            XRechnung & ZUGFeRD
                        </li>
                        <li className="flex items-center text-sm">
                            <CheckIcon />
                            {locale === 'de' ? 'E-Mail Support' : 'Email support'}
                        </li>
                    </ul>

                    <Button
                        className="w-full"
                        variant={pkg.is_popular ? 'default' : 'outline'}
                        disabled={selectedSlug !== null}
                        onClick={() => handleSelectPackage(pkg.slug)}
                    >
                        {selectedSlug === pkg.slug ? (
                            <span className="animate-spin mr-2">⏳</span>
                        ) : null}
                        {locale === 'de' ? 'Paket wählen' : 'Select Package'}
                    </Button>
                </div>
            ))}
        </div>
    );
}

function CheckIcon() {
    return (
        <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    );
}
