'use client';

import { useState, useCallback } from 'react';
import MobileHeader from '@/components/layout/MobileHeader';
import Sidebar from '@/components/layout/Sidebar';

/**
 * MobileNavController
 *
 * Client component that owns the mobile sidebar open/close state.
 * Renders both the MobileHeader (mobile-only sticky top bar) and
 * the Sidebar (desktop fixed + mobile overlay).
 */
export default function MobileNavController() {
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const handleOpen = useCallback(() => setIsMobileOpen(true), []);
    const handleClose = useCallback(() => setIsMobileOpen(false), []);

    return (
        <>
            <MobileHeader onOpenSidebar={handleOpen} />
            <Sidebar isMobileOpen={isMobileOpen} onClose={handleClose} />
        </>
    );
}
