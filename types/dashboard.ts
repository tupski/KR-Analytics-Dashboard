/**
 * Dashboard Data Models
 * Type definitions for dashboard components and data structures
 */

// KPI Data
export type KPICompareMode = 'yesterday' | 'lastweek' | 'lastmonth' | 'lastyear';

export interface KPIChange {
  bookingChangePct: number | null;
  revenueChangePct: number | null;
  occupancyChangePct: number | null;
  availableChangePct: number | null;
}

export interface KpiLocationBreakdown {
  location: string;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
}

export interface KPIData {
  bookingToday: number;
  revenueToday: number;
  avgOccupancy: number;
  availableUnits: number;
  /** Cash amount breakdown for revenue detail modal */
  cashAmount?: number;
  /** Transfer amount breakdown for revenue detail modal */
  transferAmount?: number;
  /** Total transaction count for revenue detail */
  transactionCount?: number;
  /** Total units for occupancy context */
  totalUnits?: number;
  /** Occupied units count */
  occupiedUnits?: number;
  /** Location breakdown for occupancy detail modal */
  locationBreakdown?: KpiLocationBreakdown[];
  prev?: {
    booking: number;
    revenue: number;
    avgOccupancy: number;
    availableUnits: number;
    label: string;
    mode: KPICompareMode;
  };
  change?: KPIChange;
}

// Revenue Data
export interface RevenueDataPoint {
  date: string;
  revenue: number;
  transactionCount: number;
  label?: string;
}

export type RevenueFilter = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Occupancy Data
export interface OccupancyDataPoint {
  date: string;
  occupancyRate: number;
  occupiedUnits: number;
  totalUnits: number;
}

// Check-in Data
export interface CheckinItem {
  id: string;
  apartmentLocation: string;
  roomNumber: string;
  customerName: string;
  time: string;
  checkinAt: Date;
}

// Check-out Data
export interface CheckoutItem {
  id: string;
  apartmentLocation: string;
  roomNumber: string;
  customerName: string;
  time: string;
  checkoutAt: Date;
}

// Unit Status Data
export interface UnitStatusCounts {
  tersedia: number;
  ditempati: number;
}

export type UnitStatus = 'tersedia' | 'ditempati';

// ─── Location Health Matrix ───
export type UnitIdleSeverity = 'normal' | 'watch' | 'action' | 'critical';

export type IdleUnitItem = {
  unitId: string;
  unitCode: string;
  location: string;
  currentStatus: string;
  lastCheckoutAt: string | null;
  idleDays: number;
  monthRevenue: number;
  severity: UnitIdleSeverity;
};

export type UnitPerformanceItem = {
  unitId: string;
  unitCode: string;
  location: string;
  revenue: number;
  bookingCount: number;
  occupancyRate?: number;
  idleDays?: number;
};

export type LocationHealthStatus =
  | 'healthy'
  | 'low_occupancy'
  | 'high_occupancy'
  | 'low_revenue'
  | 'needs_attention'
  | 'no_data';

export type LocationHealthItem = {
  location: string;
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  occupancyRate: number;
  revenue: number;
  revenuePerUnit: number;
  status: LocationHealthStatus;
};

// ─── Dashboard Insight ───
export type InsightSeverity = 'good' | 'info' | 'warning' | 'critical';
export type InsightTrend = 'up' | 'down' | 'flat';

// ─── Marketing Performance ───
export type MarketingPerformanceStatus = 'strong' | 'normal' | 'weak' | 'unknown';

export interface MarketingPerformanceItem {
  channel: string;
  transactionCount: number;
  totalRevenue: number;
  averageTransaction: number;
  percentageOfRevenue: number;
  percentageOfTransactions: number;
  status: MarketingPerformanceStatus;
}

export interface DashboardInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  metric?: string;
  trend?: InsightTrend;
}

// ─── Expense / Keuangan DTOs ───

export interface ExpenseItem {
  id: number;
  namaPengeluaran: string;
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  category: string | null;
  apartmentLocation: string | null;
  roomNumber: string | null;
  userId: string | null;
  createdAt: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  isDefault: boolean;
}

// ─── Booking Table DTOs ───

export interface BookingTableItem {
  id: number;
  customerName: string;
  apartmentLocation: string;
  roomNumber: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  rentalDuration: number;
  cashAmount: number;
  transferAmount: number;
  marketingName: string | null;
  marketingFee: number | null;
  shift: string | null;
  inputBy: string;
  status: string | null;
}

// ─── Report / Filter Params ───

export interface ReportPeriod {
  startDate: string;
  endDate: string;
  label?: string;
  mode?: string;
}

export interface DashboardFilterParams {
  startDate: string;
  endDate: string;
  location?: string | null;
  comparison?: KPICompareMode;
}

// ─── API Response Wrapper ───

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Tab Config ───

export interface DashboardTabConfig {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
  sortOrder: number;
}
