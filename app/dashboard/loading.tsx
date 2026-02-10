import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
    return (
        <div className="container mx-auto px-4 py-8">
            {/* Welcome header skeleton */}
            <div className="mb-8">
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
            </div>

            {/* Stats grid skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass-card p-4">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            {/* Main content skeleton */}
            <div className="grid md:grid-cols-2 gap-8">
                <div className="glass-card p-6">
                    <Skeleton className="h-6 w-40 mb-4" />
                    <Skeleton className="h-48 w-full" />
                </div>
                <div className="glass-card p-6">
                    <Skeleton className="h-6 w-48 mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-14 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
