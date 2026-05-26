/**
 * Grouped chat templates for the full-screen AI chat page.
 * Each group has an emoji, label, and list of starter questions.
 */

export interface TemplateGroup {
    id: string;
    emoji: string;
    label: string;
    color: string; // tailwind bg class for accent
    questions: string[];
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
    {
        id: 'daily',
        emoji: '📊',
        label: 'Performa Harian',
        color: 'blue',
        questions: [
            'Berapa pendapatan hari ini? Bandingkan dengan kemarin.',
            'Berapa booking hari ini dibanding kemarin?',
            'Tampilkan ringkasan performa hari ini vs minggu lalu (hari yang sama).',
            'Apa perbedaan pendapatan hari ini dengan rata-rata 7 hari terakhir?',
            'Jam berapa paling banyak check-in hari ini?',
        ],
    },
    {
        id: 'weekly',
        emoji: '📅',
        label: 'Perbandingan Periode',
        color: 'indigo',
        questions: [
            'Bandingkan minggu ini vs minggu lalu — revenue, transaksi, dan tamu unik.',
            'Bagaimana performa bulan ini dibanding bulan lalu?',
            'Tampilkan tren revenue 30 hari terakhir vs 30 hari sebelumnya.',
            'Apakah revenue tahun ini lebih tinggi dari tahun lalu di periode yang sama?',
            'Hari apa dalam seminggu yang paling banyak transaksinya bulan ini?',
        ],
    },
    {
        id: 'location',
        emoji: '📍',
        label: 'Per Lokasi',
        color: 'emerald',
        questions: [
            'Lokasi mana yang revenue tertinggi bulan ini?',
            'Bandingkan performa semua lokasi 7 hari terakhir.',
            'Lokasi mana yang mengalami penurunan revenue signifikan minggu ini?',
            'Berapa okupansi setiap lokasi saat ini?',
            'Lokasi mana yang paling sedikit transaksinya 30 hari terakhir?',
        ],
    },
    {
        id: 'customer',
        emoji: '👥',
        label: 'Customer & Tamu',
        color: 'violet',
        questions: [
            'Siapa 10 tamu repeat terbanyak bulan ini?',
            'Berapa jumlah tamu unik minggu ini vs minggu lalu?',
            'Tamu mana yang paling sering menginap dalam 30 hari terakhir?',
            'Apakah ada tren peningkatan tamu repeat bulan ini?',
            'Dari lokasi mana tamu repeat paling banyak berasal?',
        ],
    },
    {
        id: 'finance',
        emoji: '💰',
        label: 'Keuangan & Laba',
        color: 'amber',
        questions: [
            'Berapa net profit (revenue - pengeluaran) bulan ini?',
            'Apa kategori pengeluaran terbesar bulan ini?',
            'Bandingkan pengeluaran bulan ini dengan bulan lalu.',
            'Berapa tagihan yang masih belum dibayar saat ini?',
            'Lokasi mana yang paling menguntungkan (net profit tertinggi) 30 hari terakhir?',
        ],
    },
    {
        id: 'operational',
        emoji: '🏠',
        label: 'Operasional & Unit',
        color: 'rose',
        questions: [
            'Berapa unit yang terisi saat ini dan berapa yang tersedia?',
            'Unit mana yang belum pernah digunakan minggu ini?',
            'Berapa rata-rata durasi menginap bulan ini?',
            'Tampilkan unit dengan tingkat pemakaian tertinggi bulan ini.',
            'Apakah ada kamar yang belum digunakan sama sekali 30 hari terakhir?',
        ],
    },
    {
        id: 'marketing',
        emoji: '📢',
        label: 'Marketing & Fee',
        color: 'orange',
        questions: [
            'Marketing siapa yang membawa paling banyak tamu bulan ini?',
            'Berapa total fee marketing yang belum dibayar?',
            'Tampilkan performa semua marketing 30 hari terakhir.',
            'Marketing mana yang revenue brought-nya paling tinggi vs fee-nya?',
            'Bandingkan performa marketing bulan ini vs bulan lalu.',
        ],
    },
    {
        id: 'insight',
        emoji: '💡',
        label: 'Insight & Rekomendasi',
        color: 'cyan',
        questions: [
            'Apa tiga hal yang perlu ditingkatkan minggu ini berdasarkan data?',
            'Lokasi atau unit mana yang underperforming dan kenapa?',
            'Berikan rekomendasi untuk meningkatkan pendapatan bulan depan.',
            'Identifikasi anomali atau pola tidak biasa dalam data 7 hari terakhir.',
            'Berikan ringkasan eksekutif performa bisnis bulan ini.',
        ],
    },
];

/** Color map for tailwind class generation */
export const COLOR_MAP: Record<string, { bg: string; text: string; border: string; hover: string; badge: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', hover: 'hover:bg-blue-100', badge: 'bg-blue-100 text-blue-700' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', hover: 'hover:bg-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', hover: 'hover:bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', hover: 'hover:bg-violet-100', badge: 'bg-violet-100 text-violet-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', hover: 'hover:bg-amber-100', badge: 'bg-amber-100 text-amber-700' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', hover: 'hover:bg-rose-100', badge: 'bg-rose-100 text-rose-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100', badge: 'bg-orange-100 text-orange-700' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', hover: 'hover:bg-cyan-100', badge: 'bg-cyan-100 text-cyan-700' },
};
