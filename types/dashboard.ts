/**
 * Dashboard Data Models
 * Type definitions for dashboard components and data structures
 */

// KPI Data
export interface KPIData {
  bookingToday: number;
  revenueToday: number;
  avgOccupancy: number;
  availableUnits: number;
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
