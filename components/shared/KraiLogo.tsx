/**
 * KR·AI Logo Component
 * Displays "KR·AI" with consistent styling:
 * - KR = blue
 * - · = gray separator
 * - AI = black
 */

interface KraiLogoProps {
    size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
    className?: string;
}

export default function KraiLogo({ size = 'base', className = '' }: KraiLogoProps) {
    const sizeClasses = {
        xs: 'text-xs',
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
        '2xl': 'text-2xl',
    };

    return (
        <span className={`${sizeClasses[size]} ${className} inline-flex items-center`}>
            <span className="text-blue-600 font-bold">KR</span>
            <span className="text-gray-400 mx-0.5">·</span>
            <span className="text-gray-900 font-bold">AI</span>
        </span>
    );
}
