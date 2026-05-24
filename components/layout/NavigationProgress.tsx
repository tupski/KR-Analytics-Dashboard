'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * NavigationProgress - Shows a top progress bar during page transitions.
 * Triggers on route change and animates until the new page loads.
 */
export default function NavigationProgress() {
    const pathname = usePathname();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // When pathname changes, the page has loaded - stop loading
        setLoading(false);
        setProgress(100);
        const timeout = setTimeout(() => setProgress(0), 300);
        return () => clearTimeout(timeout);
    }, [pathname]);

    useEffect(() => {
        // Intercept link clicks to show loading state
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const anchor = target.closest('a');
            if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
                const url = new URL(anchor.href);
                if (url.pathname !== pathname) {
                    setLoading(true);
                    setProgress(30);
                    // Simulate progress
                    const interval = setInterval(() => {
                        setProgress(prev => {
                            if (prev >= 90) { clearInterval(interval); return 90; }
                            return prev + 10;
                        });
                    }, 200);
                }
            }
        };

        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [pathname]);

    if (progress === 0) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[100] h-1">
            <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
            />
        </div>
    );
}
