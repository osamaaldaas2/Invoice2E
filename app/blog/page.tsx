import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getAllPosts } from '@/lib/blog/posts';

export const metadata: Metadata = {
  title: 'Blog – E-Invoicing Insights & Guides',
  description:
    'Expert guides on XRechnung, ZUGFeRD, and e-invoicing in Germany. Learn about compliance, conversion, and best practices.',
  alternates: { canonical: '/blog' },
};

export default async function BlogPage() {
  const locale = (await getLocale()) as 'en' | 'de';
  const t = await getTranslations('blog');
  const posts = getAllPosts();

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display">
          {t('title')}
        </h1>
        <p className="text-lg text-faded max-w-2xl mx-auto">{t('subtitle')}</p>
      </div>

      <div className="space-y-6">
        {posts.map((post) => {
          const translation = post.translations[locale];
          return (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block glass-panel rounded-xl p-6 hover:border-sky-500/30 transition-colors border border-white/5"
            >
              <div className="flex items-center gap-3 text-sm text-faded mb-3">
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <span>•</span>
                <span>
                  {post.readTime} {t('minRead')}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2 font-display">
                {translation.title}
              </h2>
              <p className="text-faded">{translation.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
