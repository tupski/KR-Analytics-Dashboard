/**
 * ModelBadge Component
 * 
 * Displays a small badge indicating model capabilities or pricing tier.
 * Used in model selection dropdowns to show model features at a glance.
 */

import { DollarSign, Eye, Lightbulb, Code, Zap, Crown } from 'lucide-react';

export type BadgeType = 'free' | 'pro' | 'vision' | 'reasoning' | 'coding' | 'flash';

interface ModelBadgeProps {
    type: BadgeType;
    size?: 'xs' | 'sm';
}

const BADGE_CONFIG: Record<BadgeType, { label: string; icon: React.ReactNode; className: string }> = {
    free: {
        label: 'Gratis',
        icon: <DollarSign className="w-3 h-3" />,
        className: 'bg-green-100 text-green-700 border-green-200',
    },
    pro: {
        label: 'Pro',
        icon: <Crown className="w-3 h-3" />,
        className: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    vision: {
        label: 'Vision',
        icon: <Eye className="w-3 h-3" />,
        className: 'bg-purple-100 text-purple-700 border-purple-200',
    },
    reasoning: {
        label: 'Reasoning',
        icon: <Lightbulb className="w-3 h-3" />,
        className: 'bg-orange-100 text-orange-700 border-orange-200',
    },
    coding: {
        label: 'Coding',
        icon: <Code className="w-3 h-3" />,
        className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    },
    flash: {
        label: 'Flash',
        icon: <Zap className="w-3 h-3" />,
        className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    },
};

/**
 * ModelBadge displays a colored badge with an icon and label
 * 
 * @param type - Badge type (free, pro, vision, reasoning, coding, flash)
 * @param size - Badge size (xs or sm, default: sm)
 */
export default function ModelBadge({ type, size = 'sm' }: ModelBadgeProps) {
    const config = BADGE_CONFIG[type];
    const sizeClasses = size === 'xs' ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]';

    return (
        <span
            className={`inline-flex items-center gap-0.5 rounded border font-medium ${sizeClasses} ${config.className}`}
            title={config.label}
        >
            {config.icon}
            <span className="hidden">{config.label}</span>
        </span>
    );
}
