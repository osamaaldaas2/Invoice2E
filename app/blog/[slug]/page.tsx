import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getPostBySlug, getAllPosts } from '@/lib/blog/posts';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const locale = (await getLocale()) as 'en' | 'de';
  const translation = post.translations[locale];
  return {
    title: translation.title,
    description: translation.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: translation.title,
      description: translation.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const locale = (await getLocale()) as 'en' | 'de';
  const t = await getTranslations('blog');
  const translation = post.translations[locale];

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: translation.title,
    description: translation.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'Invoice2E',
      url: 'https://www.invoice2e.eu',
    },
    mainEntityOfPage: `https://www.invoice2e.eu/blog/${slug}`,
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav className="text-sm text-faded mb-8">
        <Link href="/" className="hover:text-white transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/blog" className="hover:text-white transition-colors">
          Blog
        </Link>
        <span className="mx-2">/</span>
        <span className="text-white">{translation.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display leading-tight">
          {translation.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-faded">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
          <span>•</span>
          <span>{post.author}</span>
          <span>•</span>
          <span>
            {post.readTime} {t('minRead')}
          </span>
        </div>
      </header>

      {/* Content */}
      <article className="blog-content" dangerouslySetInnerHTML={{ __html: translation.content }} />

      {/* CTA */}
      <div className="mt-16 glass-panel rounded-xl p-8 text-center border border-sky-500/20">
        <h2 className="text-2xl font-bold text-white mb-3 font-display">{t('ctaTitle')}</h2>
        <p className="text-faded mb-6">{t('ctaDescription')}</p>
        <Link
          href="/signup"
          className="inline-flex items-center px-6 py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors"
        >
          {t('ctaButton')}
        </Link>
      </div>

      {/* Back */}
      <div className="mt-8">
        <Link href="/blog" className="text-sky-400 hover:underline">
          ← {t('backToBlog')}
        </Link>
      </div>
    </div>
  );
}
