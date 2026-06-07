/**
 * KRAI Tool Display Registry — metadata for rendering the AI Tools table in Settings.
 *
 * Single source of truth for tool category, badges, use case, input params.
 * Mirrors the function-calling definitions in tools.ts but adds display-only fields.
 */

export interface ToolDisplayInfo {
    name: string;
    category: 'Dashboard' | 'Marketing' | 'Operations' | 'Finance' | 'Occupancy' | 'Booking' | 'Customer' | 'Unit' | 'Expense' | 'Billing';
    description: string;
    capabilities: string[];
    inputParams: string[];
    cached: boolean;
    composite: boolean;
    realtime: boolean;
    requiresDateRange: boolean;
    supportsComparison: boolean;
    bestFor: string;
}

const TOOL_REGISTRY: ToolDisplayInfo[] = [
    // ── Composite Panels ─────────────────────────────────────────────────────
    {
        name: 'get_dashboard_kpi_panel',
        category: 'Dashboard',
        description: 'SATU TOOL untuk semua KPI dashboard: revenue, expense, net profit, transaksi, occupancy, perbandingan, breakdown pengeluaran, status hari ini, ringkasan harian.',
        capabilities: ['Composite', 'Multi-metric', 'Dashboard'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: true,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: 'Pertanyaan dashboard umum — gantikan 4 tool calls sekaligus',
    },
    {
        name: 'get_marketing_panel',
        category: 'Marketing',
        description: 'SATU TOOL untuk semua data marketing: performa marketing, sumber tamu, repeat guests, analisis weekend vs weekday.',
        capabilities: ['Composite', 'Multi-metric', 'Marketing'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: true,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: 'Pertanyaan marketing, sumber tamu, loyalitas',
    },
    {
        name: 'get_operations_panel',
        category: 'Operations',
        description: 'SATU TOOL untuk data operasional: occupancy per lokasi, heatmap jam checkin, performa karyawan, shift, unit underperforming.',
        capabilities: ['Composite', 'Multi-metric', 'Operational'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: true,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: 'Operasional, jam sibuk, kinerja karyawan',
    },
    {
        name: 'get_financial_panel',
        category: 'Finance',
        description: 'SATU TOOL untuk semua data keuangan: profit per lokasi, YoY, tren revenue bulanan, metode pembayaran, tren revenue harian.',
        capabilities: ['Composite', 'Multi-metric', 'Financial'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: true,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: 'Profit, perbandingan tahunan, analisis keuangan',
    },

    // ── Hari Ini (fast, no params) ──────────────────────────────────────────
    {
        name: 'get_daily_summary',
        category: 'Dashboard',
        description: 'RINGKASAN HARI INI vs kemarin — revenue, transaksi, expense, lokasi. Tanpa parameter.',
        capabilities: ['Fast', 'No params', 'Real-time'],
        inputParams: ['(none)'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Gimana kondisi hari ini?", "berapa revenue hari ini?"',
    },
    {
        name: 'get_latest_status',
        category: 'Dashboard',
        description: 'STATUS REAL-TIME — total checkin hari ini, checkout, revenue, tamu yang sedang menginap sekarang.',
        capabilities: ['Fast', 'No params', 'Real-time'],
        inputParams: ['(none)'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Siapa yang lagi nginep?", "status sekarang?"',
    },
    {
        name: 'get_period_summary',
        category: 'Dashboard',
        description: 'Ringkasan bisnis (revenue, expense, transaksi, breakdown lokasi & kategori pengeluaran) untuk rentang tanggal.',
        capabilities: ['Core', 'Revenue', 'Expense'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: false,
        bestFor: 'Periode spesifik (minggu lalu, bulan tertentu)',
    },
    {
        name: 'get_revenue_trend',
        category: 'Finance',
        description: 'DATA TREN REVENUE HARIAN — revenue per hari, rata-rata, hari maksimum/minimum.',
        capabilities: ['Trend', 'Daily', 'Revenue'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: false,
        bestFor: '"Gimana tren 7 hari terakhir?", "hari apa revenue tertinggi?"',
    },
    {
        name: 'compare_periods',
        category: 'Finance',
        description: 'Bandingkan dua periode side-by-side. Otomatis hitung delta dan persentase perubahan.',
        capabilities: ['Comparison', 'Delta', 'Period'],
        inputParams: ['a_start', 'a_end', 'b_start', 'b_end', 'location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: '"Vs minggu/bulan/tahun lalu"',
    },

    // ── Lokasi & Pelanggan ──────────────────────────────────────────────────
    {
        name: 'get_top_locations',
        category: 'Occupancy',
        description: 'Daftar lokasi apartemen dengan revenue/transaksi tertinggi.',
        capabilities: ['Ranking', 'Location'],
        inputParams: ['start_date', 'end_date', 'limit?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: false,
        bestFor: 'Lokasi terbaik berdasarkan revenue',
    },
    {
        name: 'get_top_customers',
        category: 'Customer',
        description: 'Top customer berdasarkan jumlah kunjungan/pendapatan dalam periode.',
        capabilities: ['Ranking', 'Customer'],
        inputParams: ['start_date', 'end_date', 'limit?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: false,
        bestFor: 'Identifikasi tamu repeat teratas',
    },

    // ── Tagihan & Inventaris ────────────────────────────────────────────────
    {
        name: 'get_outstanding_bills',
        category: 'Billing',
        description: 'Ringkasan tagihan bulanan yang belum dibayar (aging by bucket).',
        capabilities: ['Aging', 'Unpaid', 'Billing'],
        inputParams: ['location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Tagihan apa yang belum dibayar?"',
    },
    {
        name: 'get_unit_inventory',
        category: 'Unit',
        description: 'Status inventory unit saat ini: total kamar, terisi sekarang, tersedia, persentase okupansi.',
        capabilities: ['Real-time', 'Inventory'],
        inputParams: ['location?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Total kamar?", "kamar kosong sekarang?"',
    },

    // ── Search & Discovery ───────────────────────────────────────────────────
    {
        name: 'search_transactions',
        category: 'Booking',
        description: 'Cari transaksi berdasarkan nama customer, nomor kamar, lokasi, atau ID. Pattern matching fleksibel.',
        capabilities: ['Search', 'Pattern matching'],
        inputParams: ['query', 'start_date?', 'end_date?', 'location?', 'limit?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Cari transaksi atas nama X", "transaksi kamar 101"',
    },
    {
        name: 'search_transactions_flexible',
        category: 'Booking',
        description: 'Pencarian transaksi fleksibel dengan filter ganda: nama, lokasi, nomor kamar, tanggal, status. Lebih baik dari search_transactions untuk filter spesifik.',
        capabilities: ['Search', 'Filter', 'Flexible'],
        inputParams: ['query?', 'name?', 'location?', 'roomNumber?', 'date?', 'startDate?', 'endDate?', 'status?', 'limit?', 'sort?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Cari transaksi aktif di lokasi X", "transaksi lunas minggu ini", filter multi-kriteria',
    },
    {
        name: 'search_expenses',
        category: 'Expense',
        description: 'Cari pengeluaran berdasarkan deskripsi, kategori, atau ID.',
        capabilities: ['Search', 'Expense'],
        inputParams: ['query', 'start_date?', 'end_date?', 'location?', 'category?', 'limit?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Cari pengeluaran listrik", "expense maintenance"',
    },

    // ── Realtime & Monitoring ────────────────────────────────────────────────
    {
        name: 'get_live_checkins',
        category: 'Customer',
        description: 'Daftar realtime tamu yang sedang check-in sekarang.',
        capabilities: ['Real-time', 'Live'],
        inputParams: ['location?', 'limit?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Siapa yang lagi nginep?", "kamar mana yang terisi?"',
    },
    {
        name: 'detect_idle_units',
        category: 'Unit',
        description: 'Deteksi unit yang tidak ada transaksi dalam X hari terakhir.',
        capabilities: ['Detection', 'Idle', 'Unit'],
        inputParams: ['days_threshold?', 'location?', 'limit?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Kamar mana yang kosong lama?", "unit idle 7 hari"',
    },

    // ── Analytics & Insights ─────────────────────────────────────────────────
    {
        name: 'get_underperforming_units',
        category: 'Unit',
        description: 'Deteksi unit dengan occupancy rate atau revenue di bawah rata-rata.',
        capabilities: ['Analytics', 'Underperforming'],
        inputParams: ['start_date', 'end_date', 'location?', 'threshold?', 'limit?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: false,
        bestFor: '"Unit mana yang performa buruk?", "kamar revenue rendah"',
    },
    {
        name: 'get_weekend_vs_weekday_analysis',
        category: 'Operations',
        description: 'Perbandingan performa weekend (Sabtu-Minggu) vs weekday (Senin-Jumat).',
        capabilities: ['Analysis', 'Comparison'],
        inputParams: ['start_date', 'end_date', 'location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: true,
        supportsComparison: true,
        bestFor: '"Lebih ramai weekend atau weekday?"',
    },
    {
        name: 'estimate_month_end_revenue',
        category: 'Finance',
        description: 'Estimasi revenue akhir bulan berdasarkan trend harian saat ini.',
        capabilities: ['Prediction', 'Estimation'],
        inputParams: ['year?', 'month?', 'location?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Prediksi revenue bulan ini", "proyeksi revenue"',
    },
    {
        name: 'get_unpaid_bills_detail',
        category: 'Billing',
        description: 'Detail tagihan yang belum dibayar dengan aging analysis.',
        capabilities: ['Detail', 'Aging', 'Unpaid'],
        inputParams: ['location?', 'limit?'],
        cached: true,
        composite: false,
        realtime: false,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Detail tagihan unpaid", "aging analysis piutang"',
    },

    // ── Analytics DB Tools (2026-06-01) ──────────────────────────────────────
    {
        name: 'get_guest_stay_history',
        category: 'Customer',
        description: 'Cari riwayat menginap tamu berdasarkan nama dengan 3-step search (today checkins → currently staying → historical). ILIKE case-insensitive, partial name OK.',
        capabilities: ['Search', 'Customer', 'History', 'Real-time'],
        inputParams: ['guestName', 'location?', 'limit?'],
        cached: false,
        composite: false,
        realtime: true,
        requiresDateRange: false,
        supportsComparison: false,
        bestFor: '"Cari riwayat tamu atas nama X", "berapa kali tamu ini menginap?", "tamu X lagi nginep di mana?"',
    },
];

export default TOOL_REGISTRY;

export function getToolByName(name: string): ToolDisplayInfo | undefined {
    return TOOL_REGISTRY.find(t => t.name === name);
}

export function getToolsByCategory(category: string): ToolDisplayInfo[] {
    return TOOL_REGISTRY.filter(t => t.category === category);
}

export function getAllCategories(): string[] {
    return [...new Set(TOOL_REGISTRY.map(t => t.category))];
}
