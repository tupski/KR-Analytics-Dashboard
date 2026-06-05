// ─── Daily revenue per location per date ───
export interface DailyRevenue {
    date_wib: string; // YYYY-MM-DD
    apartment_location: string;
    total_revenue: number;
    cash_revenue: number;
    transfer_revenue: number;
    transaction_count: number;
    avg_revenue_per_tx: number;
    unique_rooms: number;
}

// ─── Monthly summary per location ───
export interface MonthlySummary {
    year: number;
    month: number;
    apartment_location: string;
    total_revenue: number;
    cash_revenue: number;
    transfer_revenue: number;
    total_expenses: number;
    expense_count: number;
    net_profit: number;
    transaction_count: number;
    paid_bills_count: number;
    unpaid_bills_count: number;
    paid_bills_amount: number;
    unpaid_bills_amount: number;
    total_marketing_fees: number;
    paid_fees_amount: number;
    computed_at: string;
}

// ─── Expense summary per date / location / category ───
export interface ExpenseSummary {
    date_wib: string; // YYYY-MM-DD
    apartment_location: string;
    category: string;
    total_amount: number;
    expense_count: number;
}

// ─── Daily occupancy per room ───
export interface OccupancyDaily {
    date_wib: string; // YYYY-MM-DD
    apartment_location: string;
    room_number: string;
    is_occupied: boolean;
    transaction_id: number | null;
    customer_name: string | null;
    checkin_at: string | null;
    checkout_at: string | null;
}

// ─── Sync metadata for a table ───
export interface SyncStatus {
    table_name: string;
    last_sync_at: string | null;
    row_count: number | null;
    sync_status: string | null;
    last_max_id: number | null;
    backfill_done: boolean | null;
    error_message: string | null;
    last_sync_log: SyncLogEntry | null;
}

// ─── Individual sync run log ───
export interface SyncLogEntry {
    id: number;
    table_name: string;
    sync_type: string;
    status: string;
    rows_synced: number;
    rows_deleted: number;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
}

// ─── Aggregated revenue for a date range ───
export interface RevenueByDateRange {
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalCash: number;
    totalTransfer: number;
    totalTransactions: number;
    averagePerDay: number;
    averagePerTransaction: number;
}

// ─── Aggregated expenses for a date range ───
export interface ExpenseByDateRange {
    startDate: string;
    endDate: string;
    totalAmount: number;
    totalExpenses: number;
    byCategory: Array<{ category: string; total_amount: number; expense_count: number }>;
    byLocation: Array<{ apartment_location: string; total_amount: number; expense_count: number }>;
}

// ─── Month-over-month comparison ───
export interface MonthlyComparison {
    yearMonth: string; // 'YYYY-MM'
    revenue: number;
    expenses: number;
    netProfit: number;
    transactions: number;
    paidBills: number;
    unpaidBills: number;
}
