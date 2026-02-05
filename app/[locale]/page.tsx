import Link from 'next/link';

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
            <header className="container mx-auto px-4 py-6">
                <nav className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-white">Invoice2E</h1>
                    <div className="flex gap-4">
                        <Link
                            href="/login"
                            className="px-4 py-2 text-white hover:text-blue-200 font-medium transition-colors"
                        >
                            Login
                        </Link>
                        <Link
                            href="/signup"
                            className="px-4 py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors"
                        >
                            Sign Up
                        </Link>
                    </div>
                </nav>
            </header>

            <main className="container mx-auto px-4 py-20">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-5xl font-bold text-white mb-6">
                        Convert Invoices to XRechnung
                    </h2>
                    <p className="text-xl text-blue-100 mb-10">
                        Transform your PDF, JPG, and PNG invoices into German e-invoice standard
                        XRechnung format with AI-powered precision.
                    </p>
                    <div className="flex justify-center gap-4 flex-wrap">
                        <Link
                            href="/signup"
                            className="px-8 py-4 bg-white text-blue-700 rounded-lg font-bold text-lg hover:bg-blue-50 transition-colors shadow-lg"
                        >
                            Get Started Free
                        </Link>
                        <Link
                            href="/login"
                            className="px-8 py-4 border-2 border-white text-white rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
                        >
                            Login
                        </Link>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-8 mt-20">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white">
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold mb-2">Upload Invoice</h3>
                        <p className="text-blue-100">
                            Upload PDF, JPG, or PNG invoices. Our AI extracts all relevant data automatically.
                        </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white">
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold mb-2">AI Extraction</h3>
                        <p className="text-blue-100">
                            Gemini AI analyzes your invoice and extracts structured data with high accuracy.
                        </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white">
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold mb-2">XRechnung Ready</h3>
                        <p className="text-blue-100">
                            Download compliant XRechnung XML file validated against official standards.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
