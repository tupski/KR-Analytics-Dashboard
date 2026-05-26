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
        <div className="flex items-center text-sm sm:text-base font-mono text-gray-700 flex-shrink-0 tabular-nums">
            <span>{hours}</span>
            <span
                className="transition-opacity duration-100 mx-px"
                style={{ opacity: showColon ? 1 : 0 }}
            >
                :
            </span>
            <span>{minutes}</span>
        </div>
    );
}
