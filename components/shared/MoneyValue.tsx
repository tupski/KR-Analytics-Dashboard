'use client';

import { useState, useRef, useEffect } from 'react';
import { formatCurrencyCompactIDR, formatCurrency } from '@/lib/utils/format';

interface MoneyValueProps {
    /** Raw numeric value to display */
    value: number;
    /** Compact on small viewport / constrained card  (default true) */
    compactOnSmall?: boolean;
    /** Show full value in tooltip on hover (desktop) / tap (mobile) (default true) */
    showTooltip?: boolean;
    /** Additional CSS class names */
    className?: string;
    /** Semantic type hint (currently unused for styling, reserved) */
    semanticType?: 'currency' | 'revenue' | 'expense';
}

/**
 * MoneyValue — Renders an Indonesian Rupiah value with:
 * - Compact format ("Rp 33,35 Jt") on constrained viewports
 * - Full format ("Rp 33.350.000") in title/aria-label
 * - Tooltip on hover (desktop) or tap (mobile) to reveal full value
 * - No ellipsis / truncation of money values
 */
export default function MoneyValue({
    value,
    compactOnSmall = true,
    showTooltip = true,
    className = '',
    semanticType: _semanticType,
}: MoneyValueProps) {
    const [showFull, setShowFull] = useState(false);
    const spanRef = useRef<HTMLSpanElement>(null);
    const fullValue = formatCurrency(value);
    const compactValue = formatCurrencyCompactIDR(value);

    // Determine which display to use.
    // Always show full format for values < 1.000.000 (formatCurrencyCompactIDR handles this).
    // For larger values, show compact, but allow toggle to full on interaction.
    const displayValue = compactOnSmall ? compactValue : fullValue;

    // Handle click/tap toggle
    const handleClick = () => {
        if (!showTooltip) return;
        if (window.innerWidth < 768) {
            // Mobile: toggle between compact and full
            setShowFull(prev => !prev);
        }
    };

    // Reset showFull when value changes
    useEffect(() => {
        setShowFull(false);
    }, [value]);

    return (
        <span
            ref={spanRef}
            className={`inline-flex items-baseline gap-0.5 ${className} ${showTooltip ? 'cursor-help' : ''}`}
            title={showTooltip ? fullValue : undefined}
            aria-label={`Rp ${value.toLocaleString('id-ID')}`}
            onClick={handleClick}
            onMouseEnter={() => {
                if (showTooltip && window.innerWidth >= 768) {
                    setShowFull(true);
                }
            }}
            onMouseLeave={() => {
                if (window.innerWidth >= 768) {
                    setShowFull(false);
                }
            }}
            style={{ overflow: 'visible', textOverflow: 'clip' }}
        >
            {/* On hover (desktop) or tap (mobile) show full value; otherwise compact */}
            <span className={showFull ? '' : 'hidden'}>
                {fullValue}
            </span>
            <span className={showFull ? 'hidden' : ''}>
                {displayValue}
            </span>
        </span>
    );
}
