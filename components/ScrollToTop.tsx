'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * ScrollToTop — floating button that appears after scrolling down 300px.
 * Scrolls the nearest overflow-y-auto ancestor (works with the layout's
 * scrollable content div).
 */
export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);
    const [scrollEl, setScrollEl] = useState<Element | null>(null);

    useEffect(() => {
        // Find the scrollable ancestor at mount time
        const el = document.querySelector('[data-scroll-container]');
        setScrollEl(el);

        const target = el || window;

        const handleScroll = () => {
            const y = el ? el.scrollTop : window.scrollY;
            setVisible(y > 300);
        };

        target.addEventListener('scroll', handleScroll, { passive: true });
        return () => target.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        if (scrollEl) {
            scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (!visible) return null;

    return (
        <button
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="fixed bottom-20 left-4 sm:bottom-6 sm:left-auto sm:right-20 z-30 w-10 h-10 bg-white border border-gray-200 text-gray-600 rounded-full shadow-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center"
        >
            <ArrowUp className="w-4 h-4" />
        </button>
    );
}
