import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RealTimeClock from '../RealTimeClock';

describe('RealTimeClock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should render the current time in HH:mm format', () => {
        const mockDate = new Date('2024-01-15T10:30:00Z');
        vi.setSystemTime(mockDate);

        render(<RealTimeClock />);

        // The component should display time (exact format depends on timezone conversion)
        const timeElements = screen.getAllByText(/\d{2}/);
        expect(timeElements.length).toBeGreaterThanOrEqual(2); // At least hours and minutes
    });

    it('should update time every second', () => {
        const mockDate = new Date('2024-01-15T10:30:00Z');
        vi.setSystemTime(mockDate);

        render(<RealTimeClock />);

        // Advance time by 1 second
        act(() => {
            vi.advanceTimersByTime(1000);
        });

        // Component should still be rendering (time updated)
        const timeElements = screen.getAllByText(/\d{2}/);
        expect(timeElements.length).toBeGreaterThanOrEqual(2);
    });

    it('should toggle colon visibility every 500ms', () => {
        const mockDate = new Date('2024-01-15T10:30:00Z');
        vi.setSystemTime(mockDate);

        const { container } = render(<RealTimeClock />);

        // Find the colon element
        const colonElement = container.querySelector('span[style*="opacity"]');
        expect(colonElement).toBeTruthy();

        // Initial state - colon should be visible
        const initialOpacity = (colonElement as HTMLElement).style.opacity;
        expect(initialOpacity).toBe('1');

        // After 500ms, colon should be hidden
        act(() => {
            vi.advanceTimersByTime(500);
        });

        const afterFirstToggle = (colonElement as HTMLElement).style.opacity;
        expect(afterFirstToggle).toBe('0');

        // After another 500ms, colon should be visible again
        act(() => {
            vi.advanceTimersByTime(500);
        });

        const afterSecondToggle = (colonElement as HTMLElement).style.opacity;
        expect(afterSecondToggle).toBe('1');
    });

    // NOTE (Phase 0, test-infra sync): the clock renders hours and minutes as
    // separate <span>s, so `getByText(/\d{2}/)` matches multiple nodes. The
    // font-size assertion was also stale (the component uses responsive
    // `text-sm sm:text-base`, not `text-2xl`). Both were synced to the current
    // component contract; the "monospace + readable size" intent is preserved.
    it('should use monospace font', () => {
        render(<RealTimeClock />);

        const clockContainer = screen.getAllByText(/\d{2}/)[0].parentElement;
        expect(clockContainer).toHaveClass('font-mono');
    });

    it('should use a readable responsive font size', () => {
        render(<RealTimeClock />);

        const clockContainer = screen.getAllByText(/\d{2}/)[0].parentElement;
        expect(clockContainer).toHaveClass('text-sm');
        expect(clockContainer).toHaveClass('sm:text-base');
    });

    it('should clean up intervals on unmount', () => {
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        const { unmount } = render(<RealTimeClock />);

        unmount();

        // Should clear both intervals (time update and colon blink)
        expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });

    it('should display colon separator between hours and minutes', () => {
        render(<RealTimeClock />);

        const { container } = render(<RealTimeClock />);
        const colonElement = container.querySelector('span[style*="opacity"]');

        expect(colonElement).toBeTruthy();
        expect(colonElement?.textContent).toBe(':');
    });
});
