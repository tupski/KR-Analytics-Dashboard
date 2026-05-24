'use client';

import RealTimeClock from './RealTimeClock';

/**
 * HeaderDashboard - Dashboard Header Component
 * 
 * Displays the dashboard title and real-time clock.
 * Responsive layout for mobile and desktop.
 * 
 * Features:
 * - Dashboard title
 * - Integrated real-time clock
 * - Responsive layout
 * - Consistent typography and spacing
 * 
 * Requirements: 16.1, 16.8
 */
export default function HeaderDashboard() {
    return (
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                        Dashboard Analytics
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Pantau performa dan operasional Kakarama Room secara real-time
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <RealTimeClock />
                </div>
            </div>
        </div>
    );
}
