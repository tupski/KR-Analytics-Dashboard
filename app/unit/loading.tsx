export default function UnitLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 animate-pulse">
                <div className="h-8 w-24 bg-gray-200 rounded"></div>
                <div className="h-4 w-72 bg-gray-200 rounded mt-2"></div>
            </div>
            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Overview skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                            <div className="h-4 w-24 bg-gray-200 rounded mb-3"></div>
                            <div className="h-8 w-16 bg-gray-200 rounded"></div>
                        </div>
                    ))}
                </div>
                {/* Location cards skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                            <div className="h-5 w-32 bg-gray-200 rounded mb-3"></div>
                            <div className="h-4 w-full bg-gray-100 rounded mb-2"></div>
                            <div className="h-3 w-24 bg-gray-200 rounded"></div>
                        </div>
                    ))}
                </div>
                {/* Grid skeleton */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[...Array(12)].map((_, i) => (
                        <div key={i} className="h-20 bg-white rounded-lg border border-gray-200 animate-pulse"></div>
                    ))}
                </div>
            </main>
        </div>
    );
}
