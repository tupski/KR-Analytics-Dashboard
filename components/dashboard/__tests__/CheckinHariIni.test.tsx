/**
 * Tests for CheckinHariIni component
 * 
 * These tests verify that the CheckinHariIni component renders correctly
 * with different data states: loading, empty, and with data.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// jest-dom matchers are registered globally via vitest.setup.ts
import CheckinHariIni from '../CheckinHariIni';
import type { CheckinItem } from '@/types';

describe('CheckinHariIni', () => {
    const mockCheckinItems: CheckinItem[] = [
        {
            id: '1',
            apartmentLocation: 'Kakarama Room A',
            roomNumber: '101',
            customerName: 'John Doe',
            time: '14:00',
            checkinAt: new Date('2024-01-15T14:00:00')
        },
        {
            id: '2',
            apartmentLocation: 'Kakarama Room B',
            roomNumber: '202',
            customerName: 'Jane Smith',
            time: '15:30',
            checkinAt: new Date('2024-01-15T15:30:00')
        },
        {
            id: '3',
            apartmentLocation: 'Kakarama Room C',
            roomNumber: '303',
            customerName: 'Bob Johnson',
            time: '16:45',
            checkinAt: new Date('2024-01-15T16:45:00')
        }
    ];

    // NOTE (Phase 0, test-infra sync): the component heading was renamed from
    // "Check-in Hari Ini" to "Baru Check-in Hari Ini" and the overflow link
    // changed from "Lihat Semua" (/customer) to "+N check-in lainnya"
    // (/booking?rangePreset=today&status=checkin). Expectations below were
    // synced to the current component contract; coverage intent is unchanged.
    it('should render loading skeleton when isLoading is true', () => {
        render(<CheckinHariIni items={[]} isLoading={true} />);

        // Check for title
        expect(screen.getByText('Baru Check-in Hari Ini')).toBeInTheDocument();

        // Check for skeleton elements (using animate-pulse class as indicator)
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should render empty state when no check-ins exist', () => {
        render(<CheckinHariIni items={[]} isLoading={false} />);

        // Check for title
        expect(screen.getByText('Baru Check-in Hari Ini')).toBeInTheDocument();

        // Check for empty state message
        expect(screen.getByText('Tidak ada check-in hari ini')).toBeInTheDocument();
    });

    it('should render check-in items correctly', () => {
        render(<CheckinHariIni items={mockCheckinItems} isLoading={false} />);

        // Check for title
        expect(screen.getByText('Baru Check-in Hari Ini')).toBeInTheDocument();

        // Check for guest count badge
        expect(screen.getByText('3 tamu')).toBeInTheDocument();

        // Check for each check-in item
        mockCheckinItems.forEach(item => {
            expect(screen.getByText(item.apartmentLocation)).toBeInTheDocument();
            expect(screen.getByText(item.roomNumber)).toBeInTheDocument();
            expect(screen.getByText(item.customerName)).toBeInTheDocument();
            expect(screen.getByText(item.time)).toBeInTheDocument();
        });
    });

    it('should display maximum 5 items', () => {
        const manyItems: CheckinItem[] = Array.from({ length: 10 }, (_, i) => ({
            id: `${i + 1}`,
            apartmentLocation: `Location ${i + 1}`,
            roomNumber: `${100 + i}`,
            customerName: `Customer ${i + 1}`,
            time: `${14 + i}:00`,
            checkinAt: new Date(`2024-01-15T${14 + i}:00:00`)
        }));

        render(<CheckinHariIni items={manyItems} isLoading={false} />);

        // Items are sorted newest-first, so the 5 most recent (Location 10..6)
        // are displayed and older ones are hidden.
        expect(screen.getByText('Location 10')).toBeInTheDocument();
        expect(screen.getByText('Location 6')).toBeInTheDocument();
        expect(screen.queryByText('Location 5')).not.toBeInTheDocument();

        // Overflow link points at the full booking list
        expect(screen.getByText('+5 check-in lainnya')).toBeInTheDocument();
    });

    it('should show the overflow link when more than 5 items exist', () => {
        const sixItems: CheckinItem[] = Array.from({ length: 6 }, (_, i) => ({
            id: `${i + 1}`,
            apartmentLocation: `Location ${i + 1}`,
            roomNumber: `${100 + i}`,
            customerName: `Customer ${i + 1}`,
            time: `${14 + i}:00`,
            checkinAt: new Date(`2024-01-15T${14 + i}:00:00`)
        }));

        render(<CheckinHariIni items={sixItems} isLoading={false} />);

        // Overflow link points at the full booking list
        const link = screen.getByText('+1 check-in lainnya');
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('href', '/booking?rangePreset=today&status=checkin');
    });

    it('should not show the overflow link when 5 or fewer items exist', () => {
        render(<CheckinHariIni items={mockCheckinItems} isLoading={false} />);

        // Check that the overflow link is not present
        expect(screen.queryByText(/check-in lainnya/)).not.toBeInTheDocument();
    });

    it('should display singular "tamu" for single check-in', () => {
        const singleItem: CheckinItem[] = [mockCheckinItems[0]];

        render(<CheckinHariIni items={singleItem} isLoading={false} />);

        // Check for singular form
        expect(screen.getByText('1 tamu')).toBeInTheDocument();
    });

    it('should handle undefined items gracefully', () => {
        render(<CheckinHariIni items={undefined as any} isLoading={false} />);

        // Should render empty state
        expect(screen.getByText('Tidak ada check-in hari ini')).toBeInTheDocument();
    });

    it('should render check-in icon for each item', () => {
        render(<CheckinHariIni items={mockCheckinItems} isLoading={false} />);

        // Check for green background circles (check-in indicators)
        const icons = document.querySelectorAll('.bg-green-100');
        expect(icons.length).toBe(mockCheckinItems.length);
    });

    it('should apply responsive styling classes', () => {
        const { container } = render(<CheckinHariIni items={mockCheckinItems} isLoading={false} />);

        // Check for card styling
        const card = container.querySelector('.rounded-lg.shadow-sm');
        expect(card).toBeInTheDocument();
    });
});
