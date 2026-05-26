/**
 * Indonesian national holidays and joint holidays (cuti bersama).
 * Source: official government calendar. Updated as needed.
 *
 * Keys are YYYY-MM-DD strings, values are holiday names.
 * Covers 2025 and 2026. Extend as needed.
 */
export const LIBUR_NASIONAL: Record<string, string> = {
    // 2025
    '2025-01-01': 'Tahun Baru Masehi',
    '2025-01-27': 'Isra Mi\'raj',
    '2025-01-28': 'Cuti Bersama Imlek',
    '2025-01-29': 'Tahun Baru Imlek',
    '2025-03-29': 'Hari Suci Nyepi',
    '2025-03-31': 'Cuti Bersama Nyepi',
    '2025-04-07': 'Wafat Isa Al Masih',
    '2025-04-18': 'Cuti Bersama Idul Fitri',
    '2025-04-21': 'Cuti Bersama Idul Fitri',
    '2025-04-22': 'Cuti Bersama Idul Fitri',
    '2025-05-01': 'Hari Buruh',
    '2025-05-12': 'Hari Raya Waisak',
    '2025-05-13': 'Cuti Bersama Waisak',
    '2025-05-29': 'Kenaikan Isa Al Masih',
    '2025-06-01': 'Hari Lahir Pancasila',
    '2025-06-06': 'Idul Adha',
    '2025-06-27': 'Tahun Baru Islam 1 Muharram',
    '2025-08-17': 'HUT RI',
    '2025-09-05': 'Maulid Nabi',
    '2025-12-25': 'Hari Natal',
    '2025-12-26': 'Cuti Bersama Natal',
    // 2026
    '2026-01-01': 'Tahun Baru Masehi',
    '2026-01-17': 'Isra Mi\'raj',
    '2026-02-17': 'Tahun Baru Imlek',
    '2026-03-01': 'Cuti Bersama Imlek',
    '2026-03-19': 'Hari Suci Nyepi',
    '2026-03-20': 'Cuti Bersama Nyepi',
    '2026-04-03': 'Wafat Isa Al Masih',
    '2026-04-04': 'Cuti Bersama Wafat Isa',
    '2026-04-09': 'Idul Fitri 1447 H',
    '2026-04-10': 'Idul Fitri 1447 H',
    '2026-04-13': 'Cuti Bersama Idul Fitri',
    '2026-04-14': 'Cuti Bersama Idul Fitri',
    '2026-05-01': 'Hari Buruh',
    '2026-05-03': 'Cuti Bersama Waisak',
    '2026-05-04': 'Hari Raya Waisak',
    '2026-05-14': 'Kenaikan Isa Al Masih',
    '2026-05-15': 'Cuti Bersama Kenaikan',
    '2026-06-01': 'Hari Lahir Pancasila',
    '2026-06-16': 'Idul Adha 1447 H',
    '2026-07-06': 'Tahun Baru Islam 1 Muharram',
    '2026-08-17': 'HUT RI',
    '2026-09-25': 'Maulid Nabi',
    '2026-12-24': 'Cuti Bersama Natal',
    '2026-12-25': 'Hari Natal',
};

/** Returns holiday name if the date is a holiday, null otherwise */
export function getHolidayName(dateStr: string): string | null {
    return LIBUR_NASIONAL[dateStr] || null;
}

/** Returns true if the date is a Saturday or Sunday */
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
}
