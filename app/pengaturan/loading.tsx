export default function PengaturanLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 animate-pulse">
                <div className="h-8 w-40 bg-gray-200 rounded"></div>
                <div className="h-4 w-56 bg-gray-200 rounded mt-2"></div>
            </div>
            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <div className="max-w-3xl space-y-6">
                    <div className="bg-white rounded-lg border border-gray-200 p-6 h-48 animate-pulse"></div>
                    <div className="bg-white rounded-lg border border-gray-200 p-6 h-64 animate-pulse"></div>
                </div>
            </main>
        </div>
    );
}
