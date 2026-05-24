import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KartuRingkasan, { formatCurrency, formatPercentage } from '../KartuRingkasan';

/**
 * Unit tests for KartuRingkasan (KPI Card) component
 * 
 * Tests cover:
 * - Basic rendering with title, value, and icon
 * - Loading state with skeleton loader
 * - Error state with retry button
 * - Trend indicator display (positive and negative)
 * - Indonesian currency formatting
 * - Percentage formatting
 */

describe('KartuRingkasan Component', () => {
    const mockIcon = <svg data-testid="mock-icon">Icon</svg>;

    describe('Basic Rendering', () => {
        it('should render title and value correctly', () => {
            render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                />
            );

            expect(screen.getByText('Booking Hari Ini')).toBeDefined();
            expect(screen.getByText('15')).toBeDefined();
            expect(screen.getByTestId('mock-icon')).toBeDefined();
        });

        it('should render with formatted currency value', () => {
            const formattedValue = formatCurrency(2500000);
            render(
                <KartuRingkasan
                    title="Pendapatan Hari Ini"
                    value={formattedValue}
                    icon={mockIcon}
                />
            );

            expect(screen.getByText('Pendapatan Hari Ini')).toBeDefined();
            expect(screen.getByText(formattedValue)).toBeDefined();
        });

        it('should render with formatted percentage value', () => {
            const formattedValue = formatPercentage(75.5);
            render(
                <KartuRingkasan
                    title="Okupansi Rata-rata"
                    value={formattedValue}
                    icon={mockIcon}
                />
            );

            expect(screen.getByText('Okupansi Rata-rata')).toBeDefined();
            expect(screen.getByText('75.50%')).toBeDefined();
        });
    });

    describe('Loading State', () => {
        it('should display skeleton loader when isLoading is true', () => {
            const { container } = render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                    isLoading={true}
                />
            );

            // Skeleton loader should be present
            const skeletonElements = container.querySelectorAll('.animate-pulse');
            expect(skeletonElements.length).toBeGreaterThan(0);

            // Title and value should not be visible during loading
            expect(screen.queryByText('Booking Hari Ini')).toBeNull();
            expect(screen.queryByText('15')).toBeNull();
        });
    });

    describe('Error State', () => {
        it('should display error message when error prop is provided', () => {
            render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                    error="Gagal memuat data"
                />
            );

            expect(screen.getByText('Gagal memuat data')).toBeDefined();
            expect(screen.queryByText('Booking Hari Ini')).toBeNull();
        });

        it('should display retry button when error and onRetry are provided', () => {
            const mockRetry = vi.fn();
            render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                    error="Gagal memuat data"
                    onRetry={mockRetry}
                />
            );

            const retryButton = screen.getByText('Coba Lagi');
            expect(retryButton).toBeDefined();

            fireEvent.click(retryButton);
            expect(mockRetry).toHaveBeenCalledTimes(1);
        });

        it('should not display retry button when onRetry is not provided', () => {
            render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                    error="Gagal memuat data"
                />
            );

            expect(screen.queryByText('Coba Lagi')).toBeNull();
        });
    });

    describe('Trend Indicator', () => {
        it('should display positive trend with green color and up arrow', () => {
            render(
                <KartuRingkasan
                    title="Pendapatan Hari Ini"
                    value="Rp 2.500.000"
                    icon={mockIcon}
                    trend={{ value: 12.5, isPositive: true }}
                />
            );

            expect(screen.getByText(/\+12\.50%/)).toBeDefined();
            expect(screen.getByText('↑')).toBeDefined();
        });

        it('should display negative trend with red color and down arrow', () => {
            render(
                <KartuRingkasan
                    title="Pendapatan Hari Ini"
                    value="Rp 2.500.000"
                    icon={mockIcon}
                    trend={{ value: -8.3, isPositive: false }}
                />
            );

            expect(screen.getByText(/-8\.30%/)).toBeDefined();
            expect(screen.getByText('↓')).toBeDefined();
        });

        it('should not display trend when isLoading is true', () => {
            render(
                <KartuRingkasan
                    title="Pendapatan Hari Ini"
                    value="Rp 2.500.000"
                    icon={mockIcon}
                    trend={{ value: 12.5, isPositive: true }}
                    isLoading={true}
                />
            );

            expect(screen.queryByText(/12\.50%/)).toBeNull();
        });

        it('should not display trend when error exists', () => {
            render(
                <KartuRingkasan
                    title="Pendapatan Hari Ini"
                    value="Rp 2.500.000"
                    icon={mockIcon}
                    trend={{ value: 12.5, isPositive: true }}
                    error="Gagal memuat data"
                />
            );

            expect(screen.queryByText(/12\.50%/)).toBeNull();
        });
    });

    describe('Styling', () => {
        it('should apply correct CSS classes for card styling', () => {
            const { container } = render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                />
            );

            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('bg-white');
            expect(card.className).toContain('rounded-lg');
            expect(card.className).toContain('shadow-md');
            expect(card.className).toContain('border');
        });

        it('should apply primary blue background to icon container', () => {
            render(
                <KartuRingkasan
                    title="Booking Hari Ini"
                    value="15"
                    icon={mockIcon}
                />
            );

            const iconContainer = screen.getByTestId('mock-icon').parentElement;
            expect(iconContainer?.className).toContain('bg-blue-600');
            expect(iconContainer?.className).toContain('rounded-lg');
        });
    });
});

describe('Helper Functions', () => {
    describe('formatCurrency', () => {
        it('should format currency with Indonesian locale (period as thousand separator)', () => {
            expect(formatCurrency(2500000)).toBe('Rp 2.500.000');
            expect(formatCurrency(1000)).toBe('Rp 1.000');
            expect(formatCurrency(500)).toBe('Rp 500');
            expect(formatCurrency(0)).toBe('Rp 0');
        });

        it('should format currency without decimal places', () => {
            expect(formatCurrency(2500000.99)).toBe('Rp 2.500.001');
            expect(formatCurrency(1234.56)).toBe('Rp 1.235');
        });
    });

    describe('formatPercentage', () => {
        it('should format percentage with 2 decimal places', () => {
            expect(formatPercentage(75.5)).toBe('75.50%');
            expect(formatPercentage(100)).toBe('100.00%');
            expect(formatPercentage(0)).toBe('0.00%');
            expect(formatPercentage(33.333)).toBe('33.33%');
        });

        it('should handle negative percentages', () => {
            expect(formatPercentage(-5.25)).toBe('-5.25%');
        });
    });
});
