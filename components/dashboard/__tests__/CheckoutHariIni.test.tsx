/**
 * Tests for CheckoutHariIni component
 * 
 * These tests verify that the CheckoutHariIni component renders correctly
 * with different data states: loading, empty, and with data.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CheckoutHariIni from '../CheckoutHariIni';
import type { CheckoutItem } from '@/types';

describe('CheckoutHariIni', () => {
    const mockCheckoutItems: CheckoutItem[] = [
        {
            id: '1',
            apartmentLocation: 'Kakarama Room A',
            roomNumber: '101',
            customerName: 'John Doe',
            time: '12:00',
            checkoutAt: new Date('2024-01-15T12:00:00')
        },
        {
            id: '2',
            apartmentLocation: 'Kakarama Room B',
            roomNumber: '202',
            customerName: 'Jane Smith',
            time: '11:30',
            checkoutAt: new Date('2024-01-15T11:30:00')
        },
        {
            id: '3',
            apartmentLocation: 'Kakarama Room C',
            roomNumber: '303',
            customerName: 'Bob Johnson',
            time: '10:45',
            checkoutAt: new Date('2024-01-15T10:45:00')
        }
    ];

    it('should render loading skeleton when isLoading is true', () => {
        render(<CheckoutHariIni items={[]} isLoading={true} />);

        // Check for title
        expect(screen.getByText('Check-out Hari Ini')).toBeInTheDocument();

        // Check for skeleton elements (using animate-pulse class as indicator)
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should render empty state when no check-outs exist', () => {
        render(<CheckoutHariIni items={[]} isLoading={false} />);

        // Check for title
        expect(screen.getByText('Check-out Hari Ini')).toBeInTheDocument();

        // Check for empty state message
        expect(screen.getByText('Tidak ada check-out hari ini')).toBeInTheDocument();
    });

    it('should render check-out items correctly', () => {
        render(<CheckoutHariIni items={mockCheckoutItems} isLoading={false} />);

        // Check for title
        expect(screen.getByText('Check-out Hari Ini')).toBeInTheDocument();

        // Check for guest count badge
        expect(screen.getByText('3 tamu')).toBeInTheDocument();

        // Check for each check-out item
        mockCheckoutItems.forEach(item => {
            expect(screen.getByText(item.apartmentLocation)).toBeInTheDocument();
            expect(screen.getByText(item.roomNumber)).toBeInTheDocument();
            expect(screen.getByText(item.customerName)).toBeInTheDocument();
            expect(screen.getByText(item.time)).toBeInTheDocument();
        });
    });

    it('should display maximum 5 items', () => {
        const manyItems: CheckoutItem[] = Array.from({ length: 10 }, (_, i) => ({
            id: `${i + 1}`,
            apartmentLocation: `Location ${i + 1}`,
            roomNumber: `${100 + i}`,
            customerName: `Customer ${i + 1}`,
            time: `${10 + i}:00`,
            checkoutAt: new Date(`2024-01-15T${10 + i}:00:00`)
        }));

        render(<CheckoutHariIni items={manyItems} isLoading={false} />);

        // Check that only 5 items are displayed
        expect(screen.getByText('Location 1')).toBeInTheDocument();
        expect(screen.getByText('Location 5')).toBeInTheDocument();
        expect(screen.queryByText('Location 6')).not.toBeInTheDocument();

        // Check for "Lihat Semua" link
        expect(screen.getByText('Lihat Semua')).toBeInTheDocument();
    });

    it('should show "Lihat Semua" link when more than 5 items exist', () => {
        const sixItems: CheckoutItem[] = Array.from({ length: 6 }, (_, i) => ({
            id: `${i + 1}`,
            apartmentLocation: `Location ${i + 1}`,
            roomNumber: `${100 + i}`,
            customerName: `Customer ${i + 1}`,
            time: `${10 + i}:00`,
            checkoutAt: new Date(`2024-01-15T${10 + i}:00:00`)
        }));

        render(<CheckoutHariIni items={sixItems} isLoading={false} />);

        // Check for "Lihat Semua" link
        const link = screen.getByText('Lihat Semua');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/customer');
    });

    it('should not show "Lihat Semua" link when 5 or fewer items exist', () => {
        render(<CheckoutHariIni items={mockCheckoutItems} isLoading={false} />);

        // Check that "Lihat Semua" link is not present
        expect(screen.queryByText('Lihat Semua')).not.toBeInTheDocument();
    });

    it('should display singular "tamu" for single check-out', () => {
        const singleItem: CheckoutItem[] = [mockCheckoutItems[0]];

        render(<CheckoutHariIni items={singleItem} isLoading={false} />);

        // Check for singular form
        expect(screen.getByText('1 tamu')).toBeInTheDocument();
    });

    it('should handle undefined items gracefully', () => {
        render(<CheckoutHariIni items={undefined as any} isLoading={false} />);

        // Should render empty state
        expect(screen.getByText('Tidak ada check-out hari ini')).toBeInTheDocument();
    });

    it('should render check-out icon for each item', () => {
        render(<CheckoutHariIni items={mockCheckoutItems} isLoading={false} />);

        // Check for red background circles (check-out indicators)
        const icons = document.querySelectorAll('.bg-red-100');
        expect(icons.length).toBe(mockCheckoutItems.length);
    });

    it('should apply responsive styling classes', () => {
        const { container } = render(<CheckoutHariIni items={mockCheckoutItems} isLoading={false} />);

        // Check for card styling
        const card = container.querySelector('.rounded-lg.shadow-sm');
        expect(card).toBeInTheDocument();
    });
});
