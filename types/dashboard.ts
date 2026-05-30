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

export interface KPIData {
  bookingToday: number;
  revenueToday: number;
  avgOccupancy: number;
  availableUnits: number;
  // Optional comparison snapshot
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
  label?: string; // Formatted label for chart display
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

// ─── Dashboard Insight ───
export type InsightSeverity = 'good' | 'info' | 'warning' | 'critical';
export type InsightTrend = 'up' | 'down' | 'flat';

export interface DashboardInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  metric?: string;
  trend?: InsightTrend;
}
