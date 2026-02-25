interface FaqItem {
  question: string;
  answer: string;
}

interface FormatPageSchemaProps {
  formatName: string;
  faqItems: FaqItem[];
}

export function FormatPageSchema({ formatName, faqItems }: FormatPageSchemaProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: `Invoice2E – PDF to ${formatName}`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: 'https://www.invoice2e.eu',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          description: 'Free credits on signup',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
