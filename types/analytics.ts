/**
 * Analytics-specific types for the dashboard aggregation layer.
 *
 * These DTOs represent the output of analytics RPC functions
 * and the shape of data consumed by chart/grid components.
 */

// ─── Dashboard KPI ───

export interface DashboardKPIs {
    total_revenue: number;
    total_expense: number;
    net_profit: number;
    total_transactions: number;
    unique_customers: number;
    avg_occupancy_rate: number;
    prev_total_revenue: number;
    prev_total_expense: number;
    prev_net_profit: number;
    prev_total_transactions: number;
    prev_unique_customers: number;
    revenue_change_pct: number;
    expense_change_pct: number;
    net_profit_change_pct: number;
    transactions_change_pct: number;
    customers_change_pct: number;
    current_period_label: string;
    previous_period_label: string;
}

// ─── Revenue ───

export interface DailyRevenueTrend {
    transaction_date: string;
    total_revenue: number;
    transaction_count: number;
    avg_revenue_per_transaction: number;
    total_count: number;
}

export interface MonthlyRevenueTrend {
    month_start: string;
    month_label: string;
    total_revenue: number;
    transaction_count: number;
    avg_revenue_per_transaction: number;
}

// ─── Occupancy ───

export interface OccupancyPerLocation {
    apartment_location: string;
    total_rooms: number;
    total_transactions: number;
    total_revenue: number;
    occupancy_rate: number;
    total_count: number;
}

export interface OccupancyPerUnit {
    room_number: string;
    apartment_location: string;
    total_transactions: number;
    total_revenue: number;
    occupancy_rate: number;
    total_count: number;
}

export interface LocationFullness {
    apartment_location: string;
    total_rooms: number;
    peak_occupancy_rate: number;
    avg_occupancy_rate: number;
    total_transactions: number;
    total_count: number;
}

// ─── Expenses ───

export interface ExpenseBreakdown {
    category: string;
    total_expense: number;
    expense_count: number;
    percentage: number;
}

export interface CategorySummary {
    category: string;
    raw_category: string;
    total_amount: number;
    transaction_count: number;
}

// ─── Marketing / Guest Source ───

export interface MarketingPerformance {
    marketing_name: string;
    total_transactions: number;
    revenue_brought: number;
    total_fee: number;
    fee_to_revenue_ratio: number;
    total_count: number;
}

export interface GuestSourceSummary {
    source_name: string;
    transaction_count: number;
    total_revenue: number;
    percentage: number;
    total_count: number;
}

// ─── Profit ───

export interface NetProfitPerLocation {
    apartment_location: string;
    total_revenue: number;
    total_expense: number;
    net_profit: number;
    profit_margin: number;
    total_count: number;
}

export interface ProfitPerLocation {
    apartment_location: string;
    total_revenue: number;
    total_transactions: number;
    avg_revenue_per_transaction: number;
}

// ─── Payment ───

export interface PaymentMethodSummary {
    apartment_location: string;
    total_cash: number;
    total_transfer: number;
    total_revenue: number;
    cash_percentage: number;
    transfer_percentage: number;
    total_count: number;
}

// ─── Employee / Shift ───

export interface PerformanceByEmployee {
    employee_name: string;
    total_transactions: number;
    total_revenue: number;
    avg_revenue_per_transaction: number;
    total_count: number;
}

export interface PerformanceByShift {
    shift: string;
    total_transactions: number;
    total_revenue: number;
    avg_revenue_per_transaction: number;
    percentage: number;
}

// ─── Guests ───

export interface RepeatGuest {
    customer_name: string;
    visit_count: number;
    total_revenue: number;
    first_visit: string;
    last_visit: string;
    total_count: number;
}

// ─── Stay Duration ───

export interface StayDurationSummary {
    duration_category: string;
    duration_sort_key: number;
    transaction_count: number;
    percentage: number;
    total_revenue: number;
}

// ─── Check-in ───

export interface CheckinHeatmap {
    hour: number;
    transaction_count: number;
    percentage: number;
}

// ─── Bills / Tagihan ───

export interface OutstandingBillsSummary {
    aging_bucket: string;
    bucket_order: number;
    bill_count: number;
    total_amount: number;
}

// ─── Underperforming ───

export interface UnderperformingRoom {
    room_number: string;
    apartment_location: string;
    total_transactions: number;
    total_revenue: number;
    occupancy_rate: number;
    total_count: number;
}

// ─── YoY ───

export interface RevenueYoYComparison {
    current_revenue: number;
    current_transactions: number;
    previous_revenue: number;
    previous_transactions: number;
    revenue_change_pct: number;
    transactions_change_pct: number;
    current_period_label: string;
    previous_period_label: string;
}

// ─── Aggregated Dashboard ───

export interface DashboardAggregatedData {
    kpis: DashboardKPIs[];
    dailyRevenue: DailyRevenueTrend[];
    monthlyRevenue: MonthlyRevenueTrend[];
    occupancyByLocation: OccupancyPerLocation[];
    occupancyByUnit: OccupancyPerUnit[];
    locationFullness: LocationFullness[];
    expenseBreakdown: ExpenseBreakdown[];
    categorySummary: CategorySummary[];
    marketingPerformance: MarketingPerformance[];
    guestSourceSummary: GuestSourceSummary[];
    netProfitByLocation: NetProfitPerLocation[];
    profitByLocation: ProfitPerLocation[];
    paymentMethodSummary: PaymentMethodSummary[];
    performanceByEmployee: PerformanceByEmployee[];
    performanceByShift: PerformanceByShift[];
    repeatGuests: RepeatGuest[];
    stayDuration: StayDurationSummary[];
    checkinHeatmap: CheckinHeatmap[];
    outstandingBills: OutstandingBillsSummary[];
    underperformingRooms: UnderperformingRoom[];
    revenueYoY: RevenueYoYComparison[];
}
