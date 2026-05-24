/**
 * Database type definitions for Supabase tables and views.
 * 
 * This file contains TypeScript interfaces that match the Supabase PostgreSQL schema.
 * These types ensure type safety when querying the database.
 */

/**
 * Unit status enum
 */
export type UnitStatus = 'tersedia' | 'ditempati' | 'cleaning' | 'maintenance';

/**
 * Transaction table - Financial records for bookings
 */
export interface Transaction {
    id: string;
    booking_id: string;
    customer_name: string;
    apartment_location: string;
    room_number: string;
    checkin_at: string;
    checkout_at: string;
    rental_duration: number;
    cash_amount: number;
    transfer_amount: number;
    marketing_name: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Unit Apartemen table - Individual rental units
 */
export interface UnitApartemen {
    id: string;
    lokasi_id: string;
    room_number: string;
    status: UnitStatus;
    floor: number | null;
    capacity: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * Lokasi Apartemen table - Apartment locations/buildings
 */
export interface LokasiApartemen {
    id: string;
    name: string;
    address: string;
    total_rooms: number;
    created_at: string;
    updated_at: string;
}

/**
 * Booking table - Reservation records
 */
export interface Booking {
    id: string;
    customer_id: string;
    unit_id: string;
    checkin_date: string;
    checkout_date: string;
    status: string;
    total_amount: number;
    created_at: string;
    updated_at: string;
}

/**
 * Customer table - Guest information
 */
export interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    id_card_number: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Supabase Database schema type
 * This type is used by the Supabase client for type-safe queries
 */
export interface Database {
    public: {
        Tables: {
            transactions: {
                Row: Transaction;
                Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>;
            };
            unit_apartemen: {
                Row: UnitApartemen;
                Insert: Omit<UnitApartemen, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<UnitApartemen, 'id' | 'created_at' | 'updated_at'>>;
            };
            lokasi_apartemen: {
                Row: LokasiApartemen;
                Insert: Omit<LokasiApartemen, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<LokasiApartemen, 'id' | 'created_at' | 'updated_at'>>;
            };
            booking: {
                Row: Booking;
                Insert: Omit<Booking, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<Booking, 'id' | 'created_at' | 'updated_at'>>;
            };
            customer: {
                Row: Customer;
                Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>;
                Update: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>;
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            get_daily_revenue_trend: {
                Args: {
                    p_start_date: string;
                    p_end_date: string;
                    p_location: string | null;
                    p_limit: number;
                    p_offset: number;
                };
                Returns: Array<{
                    date: string;
                    gross_revenue: number;
                    transaction_count: number;
                }>;
            };
            get_location_fullness: {
                Args: {
                    p_start_date: string;
                    p_end_date: string;
                    p_location?: string | null;
                };
                Returns: Array<{
                    location_name: string;
                    avg_occupancy_rate: number;
                    total_units: number;
                }>;
            };
            get_occupancy_per_unit: {
                Args: {
                    p_start_date: string;
                    p_end_date: string;
                };
                Returns: Array<{
                    unit_id: string;
                    room_number: string;
                    location_name: string;
                    occupancy_days: number;
                    total_days: number;
                    occupancy_rate: number;
                }>;
            };
        };
        Enums: {
            unit_status: UnitStatus;
        };
    };
}
