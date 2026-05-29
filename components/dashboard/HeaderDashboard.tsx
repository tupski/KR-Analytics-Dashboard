'use client';

import SyncStatusBadge from './SyncStatusBadge';

/**
 * HeaderDashboard - Dashboard Header Component
 * 
 * Displays the dashboard title, subtitle, and sync freshness badge.
 * Clock is now in the AutoRefreshWrapper bar.
 */
export default function HeaderDashboard() {
    return (
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                        Dashboard Analytics
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500">
                        Pantau performa dan operasional Kakarama Room secara real-time
                    </p>
                </div>
                <div className="flex-shrink-0 hidden sm:block w-64">
                    <SyncStatusBadge />
                </div>
            </div>
        </div>
    );
}
