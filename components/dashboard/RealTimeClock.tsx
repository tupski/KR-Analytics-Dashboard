'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * RealTimeClock Component
 * 
 * Displays the current time in Asia/Jakarta timezone with a blinking colon separator.
 * Updates every second and blinks the colon every 500ms.
 * 
 * Requirements: 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.9
 */
export default function RealTimeClock() {
    const [time, setTime] = useState<Date>(new Date());
    const [showColon, setShowColon] = useState(true);

    useEffect(() => {
        // Update time every 1 second
        const timeInterval = setInterval(() => {
            setTime(new Date());
        }, 1000);

        // Toggle colon visibility every 500ms for blinking effect
        const colonInterval = setInterval(() => {
            setShowColon((prev) => !prev);
        }, 500);

        // Cleanup intervals on component unmount
        return () => {
            clearInterval(timeInterval);
            clearInterval(colonInterval);
        };
    }, []);

    // Convert to Asia/Jakarta timezone and format as HH:mm
    const jakartaTime = toZonedTime(time, 'Asia/Jakarta');
    const hours = format(jakartaTime, 'HH');
    const minutes = format(jakartaTime, 'mm');

    return (
        <div className="flex items-center text-2xl font-mono text-gray-900">
            <span>{hours}</span>
            <span
                className="transition-opacity duration-100"
                style={{ opacity: showColon ? 1 : 0 }}
            >
                :
            </span>
            <span>{minutes}</span>
        </div>
    );
}
