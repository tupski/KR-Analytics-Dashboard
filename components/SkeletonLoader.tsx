/**
 * SkeletonLoader - Reusable Skeleton Loading Components
 * 
 * Provides consistent skeleton loaders for different component types.
 * Prevents layout shift by matching actual component dimensions.
 * 
 * Features:
 * - KPI card skeleton
 * - Chart skeleton
 * - List item skeleton
 * - Consistent animation
 * - Proper dimensions
 * 
 * Requirements: 1.6, 8.1, 8.2, 8.7
 */

export function KPICardSkeleton() {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="h-4 w-32 bg-gray-200 rounded mb-3"></div>
                    <div className="h-8 w-24 bg-gray-200 rounded"></div>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-3 w-20 bg-gray-200 rounded"></div>
        </div>
    );
}

export function ChartSkeleton() {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="flex items-center justify-between mb-6">
                <div className="h-6 w-48 bg-gray-200 rounded"></div>
                <div className="flex gap-2">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-8 w-20 bg-gray-200 rounded"></div>
                    ))}
                </div>
            </div>
            <div className="h-80 bg-gray-100 rounded"></div>
        </div>
    );
}

export function ListItemSkeleton() {
    return (
        <div className="flex items-center gap-3 p-3 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
                <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 w-24 bg-gray-200 rounded"></div>
            </div>
            <div className="h-4 w-16 bg-gray-200 rounded"></div>
        </div>
    );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4 animate-pulse"></div>
            <div className="space-y-3">
                {[...Array(items)].map((_, i) => (
                    <ListItemSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}

export function StatusCardSkeleton() {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="h-6 w-32 bg-gray-200 rounded mb-4"></div>
            <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                        <div className="flex-1">
                            <div className="h-3 w-16 bg-gray-200 rounded mb-2"></div>
                            <div className="h-5 w-8 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header Skeleton */}
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 animate-pulse">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
                        <div className="h-4 w-96 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-12 w-32 bg-gray-200 rounded"></div>
                </div>
            </div>

            {/* Content Skeleton */}
            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                    {[...Array(4)].map((_, i) => (
                        <KPICardSkeleton key={i} />
                    ))}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    {[...Array(2)].map((_, i) => (
                        <ChartSkeleton key={i} />
                    ))}
                </div>

                {/* Operational Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                    <ListSkeleton />
                    <ListSkeleton />
                    <StatusCardSkeleton />
                </div>
            </main>
        </div>
    );
}
