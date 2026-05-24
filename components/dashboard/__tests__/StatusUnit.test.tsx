import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusUnit from '../StatusUnit';
import type { UnitStatusCounts } from '@/types/dashboard';

describe('StatusUnit Component', () => {
    const mockStatusCounts: UnitStatusCounts = {
        tersedia: 10,
        ditempati: 15,
        cleaning: 3,
        maintenance: 2,
    };

    it('renders the component with title', () => {
        render(<StatusUnit statusCounts={mockStatusCounts} />);
        expect(screen.getByText('Status Unit')).toBeInTheDocument();
    });

    it('displays all four status categories', () => {
        render(<StatusUnit statusCounts={mockStatusCounts} />);

        expect(screen.getByText('Tersedia')).toBeInTheDocument();
        expect(screen.getByText('Ditempati')).toBeInTheDocument();
        expect(screen.getByText('Cleaning')).toBeInTheDocument();
        expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });

    it('displays correct counts for each status', () => {
        render(<StatusUnit statusCounts={mockStatusCounts} />);

        expect(screen.getByText('10')).toBeInTheDocument(); // tersedia
        expect(screen.getByText('15')).toBeInTheDocument(); // ditempati
        expect(screen.getByText('3')).toBeInTheDocument();  // cleaning
        expect(screen.getByText('2')).toBeInTheDocument();  // maintenance
    });

    it('displays skeleton loaders when isLoading is true', () => {
        const { container } = render(
            <StatusUnit statusCounts={mockStatusCounts} isLoading={true} />
        );

        // Check for skeleton animation classes
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it('handles zero counts correctly', () => {
        const zeroStatusCounts: UnitStatusCounts = {
            tersedia: 0,
            ditempati: 0,
            cleaning: 0,
            maintenance: 0,
        };

        render(<StatusUnit statusCounts={zeroStatusCounts} />);

        // Should display 0 for all statuses
        const zeros = screen.getAllByText('0');
        expect(zeros).toHaveLength(4);
    });

    it('applies correct color classes for each status', () => {
        const { container } = render(<StatusUnit statusCounts={mockStatusCounts} />);

        // Check for color-specific classes
        expect(container.querySelector('.text-green-600')).toBeInTheDocument();
        expect(container.querySelector('.text-blue-600')).toBeInTheDocument();
        expect(container.querySelector('.text-yellow-600')).toBeInTheDocument();
        expect(container.querySelector('.text-red-600')).toBeInTheDocument();
    });

    it('applies correct background classes for each status', () => {
        const { container } = render(<StatusUnit statusCounts={mockStatusCounts} />);

        // Check for background color classes
        expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
        expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
        expect(container.querySelector('.bg-yellow-50')).toBeInTheDocument();
        expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    });

    it('uses responsive grid layout classes', () => {
        const { container } = render(<StatusUnit statusCounts={mockStatusCounts} />);

        // Check for responsive grid classes (2 cols mobile, 4 cols desktop)
        const gridElement = container.querySelector('.grid-cols-2.md\\:grid-cols-4');
        expect(gridElement).toBeInTheDocument();
    });
});
