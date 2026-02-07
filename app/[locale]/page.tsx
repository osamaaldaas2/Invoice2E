import HeroActions from '@/components/home/HeroActions';

type HomePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function Home({ params }: HomePageProps) {
    const { locale } = await params;

    return (
        <div className="relative overflow-hidden">
            <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[160px]" />
            <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[140px]" />
            <main className="container mx-auto px-4 py-20">
                <div className="max-w-3xl mx-auto text-center">
                    <span className="chip mb-6">AI Invoice Conversion</span>
                    <h1 className="text-5xl md:text-6xl font-semibold text-white mb-6 font-display">
                        Convert Invoices to <span className="gradient-text">XRechnung</span>
                    </h1>
                    <p className="text-lg md:text-xl text-faded mb-10">
                        Transform your PDF, JPG, and PNG invoices into German e-invoice standard
                        XRechnung format with AI-powered precision.
                    </p>
                    <HeroActions locale={locale} />
                </div>

                <div className="grid md:grid-cols-3 gap-8 mt-20">
                    <div className="glass-card p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">Upload Invoice</h3>
                        <p className="text-faded">
                            Upload PDF, JPG, or PNG invoices. Our AI extracts all relevant data automatically.
                        </p>
                    </div>

                    <div className="glass-card p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">AI Extraction</h3>
                        <p className="text-faded">
                            Gemini AI analyzes your invoice and extracts structured data with high accuracy.
                        </p>
                    </div>

                    <div className="glass-card p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">XRechnung Ready</h3>
                        <p className="text-faded">
                            Download compliant XRechnung XML file validated against official standards.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
