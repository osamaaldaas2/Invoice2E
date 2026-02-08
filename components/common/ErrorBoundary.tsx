'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error('React error boundary caught error', error);
        logger.warn('React error boundary component stack', {
            componentStack: errorInfo.componentStack,
        });
    }

    render() {
        if (this.state.hasError) {
            const isDev = process.env.NODE_ENV !== 'production';
            return this.props.fallback || (
                <div className="min-h-screen flex items-center justify-center bg-slate-950">
                    <div className="text-center glass-card p-8 max-w-md">
                        <h1 className="text-2xl font-bold text-white mb-3">
                            Something went wrong
                        </h1>
                        <p className="text-slate-300 mb-6">
                            {isDev
                                ? (this.state.error?.message || 'An unexpected error occurred')
                                : 'An unexpected error occurred. Please try again.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-sky-500 text-white rounded-full hover:brightness-110"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
