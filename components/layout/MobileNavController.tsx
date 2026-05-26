'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

interface Props {
    userEmail?: string | null;
}

export default function MobileNavController({ userEmail }: Props) {
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    if (typeof window !== 'undefined') {
        (window as any).__krOpenMobileSidebar = () => setIsMobileOpen(true);
    }

    return (
        <Sidebar
            isMobileOpen={isMobileOpen}
            onClose={() => setIsMobileOpen(false)}
            userEmail={userEmail}
        />
    );
}
