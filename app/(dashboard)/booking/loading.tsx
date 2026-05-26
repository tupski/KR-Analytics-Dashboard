export default function BookingLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 animate-pulse">
                <div className="h-8 w-32 bg-gray-200 rounded"></div>
                <div className="h-4 w-64 bg-gray-200 rounded mt-2"></div>
            </div>
            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Stats skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                            <div className="h-4 w-24 bg-gray-200 rounded mb-3"></div>
                            <div className="h-7 w-16 bg-gray-200 rounded"></div>
                        </div>
                    ))}
                </div>
                {/* Filter skeleton */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                    <div className="flex gap-4">
                        <div className="h-10 flex-1 bg-gray-200 rounded"></div>
                        <div className="h-10 w-40 bg-gray-200 rounded"></div>
                        <div className="h-10 w-36 bg-gray-200 rounded"></div>
                    </div>
                </div>
                {/* Table skeleton */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                    <div className="space-y-3">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="h-12 bg-gray-100 rounded"></div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
