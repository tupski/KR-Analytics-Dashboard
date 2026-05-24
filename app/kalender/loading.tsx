export default function KalenderLoading() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 animate-pulse">
                <div className="h-8 w-32 bg-gray-200 rounded"></div>
                <div className="h-4 w-48 bg-gray-200 rounded mt-2"></div>
            </div>
            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <div className="h-20 bg-purple-50 border border-purple-200 rounded-lg animate-pulse"></div>
                <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
                    <div className="h-6 w-40 bg-gray-200 rounded mb-4"></div>
                    <div className="grid grid-cols-7 gap-1">
                        {[...Array(35)].map((_, i) => (<div key={i} className="aspect-square bg-gray-100 rounded-lg"></div>))}
                    </div>
                </div>
            </main>
        </div>
    );
}
