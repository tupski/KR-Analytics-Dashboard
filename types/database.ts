/**
 * Database type definitions for Supabase tables and views.
 *
 * GENERATED FROM SCHEMA — manual, kept in sync with current_schema.sql
 * Each interface maps 1:1 to a PostgreSQL table.
 */

// ─── Lookup / Enum-like Types ───

export type UnitStatus = 'tersedia' | 'ditempati' | 'cleaning' | 'maintenance';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type BillStatus = 'unpaid' | 'paid';
export type UserRole = 'karyawan' | 'admin' | 'super_admin';

// ─── Core Business Tables ───

export interface Transaction {
    id: number;
    customer_name: string;
    marketing_name: string;
    rental_duration: number;
    shift: string | null;
    input_by: string;
    apartment_location: string;
    room_number: string;
    cash_amount: number | null;
    transfer_amount: number | null;
    transfer_to: string | null;
    marketing_fee: number | null;
    ktp_image_url: string | null;
    transfer_proof_url: string | null;
    user_id: string | null;
    created_at: string;
    checkout_at: string | null;
    deposit_cash: number | null;
    deposit_transfer: number | null;
    deposit_returned_at: string | null;
    deposit_refund_proof_url: string | null;
    checkin_at: string | null;
}

export interface Pengeluaran {
    id: number;
    nama_pengeluaran: string;
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
    user_id: string | null;
    created_at: string;
    category: string | null;
    apartment_location: string | null;
    room_number: string | null;
}

export interface PengeluaranCategory {
    id: number;
    name: string;
    is_default: boolean | null;
    created_at: string;
}

export interface TagihanBulanan {
    id: number;
    apartment_location: string;
    room_number: string;
    amount: number;
    due_date: string;
    status: string | null;
    paid_at: string | null;
    proof_url: string | null;
    user_id: string | null;
    created_at: string;
    is_recurring: boolean;
    recurring_parent_id: number | null;
}

export interface TagihanFeeLunas {
    id: number;
    marketing_name: string;
    customer_count: number;
    total_fee: number;
    transactions_detail: unknown | null;
    proof_url: string | null;
    paid_at: string;
    user_id: string | null;
    created_at: string;
    paid_date: string; // GENERATED ALWAYS
}

export interface TagihanFeeLunasItem {
    id: number;
    transaction_id: number;
    marketing_name: string;
    fee_amount: number;
    paid_at: string;
    paid_date: string; // GENERATED ALWAYS
    paid_by: string;
    proof_url: string | null;
    created_at: string;
}

// ─── Master Data Tables ───

export interface LokasiApartemen {
    id: number;
    name: string;
    created_at: string;
    total_rooms: number | null;
}

export interface NomorKamar {
    id: number;
    name: string;
    lokasi: string;
    status: string | null;
    created_at: string;
}

export interface KaryawanList {
    id: number;
    name: string;
    created_at: string;
}

export interface MarketingList {
    id: number;
    name: string;
    created_at: string;
}

// ─── Request / Approval ───

export interface Request {
    id: number;
    employee_name: string;
    apartment_location: string;
    request_type: string;
    description: string | null;
    amount: number | null;
    desired_date: string;
    status: string | null;
    user_id: string | null;
    created_at: string;
    updated_at: string;
}

// ─── User & Auth Tables ───

export interface UserProfile {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: string;
    last_sign_in_at: string | null;
    created_at: string;
    updated_at: string;
    avatar_url: string | null;
    gender: string | null;
}

export interface UserRoleRow {
    id: number;
    user_id: string;
    role: string;
    created_at: string;
}

export interface UserLocationAssignment {
    id: number;
    user_id: string;
    location_name: string;
    assigned_at: string;
    assigned_by: string | null;
}

export interface UserPermission {
    id: number;
    user_id: string;
    permission_key: string;
    is_allowed: boolean;
    created_at: string;
    updated_at: string;
}

// ─── Activity & Audit ───

export interface ActivityLog {
    id: number;
    user_id: string | null;
    user_name: string | null;
    role: string | null;
    action: string;
    details: string | null;
    metadata: unknown | null;
    created_at: string;
}

export interface MenuAccessLog {
    id: number;
    user_id: string | null;
    role: string | null;
    menu_item_id: string;
    action: string;
    metadata: unknown;
    created_at: string;
}

// ─── Menu Configuration ───

export interface MenuConfiguration {
    id: number;
    menu_item_id: string;
    label: string | null;
    category: string | null;
    sort_order: number | null;
    is_active: boolean;
    metadata: unknown;
    updated_at: string;
}

export interface RoleMenuVisibility {
    id: number;
    role: string;
    menu_item_id: string;
    is_visible: boolean;
    updated_at: string;
}

// ─── Notifications ───

export interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    data: unknown;
    dedupe_key: string | null;
    audience_role: string | null;
    audience_user_id: string | null;
    created_at: string;
}

export interface NotificationHidden {
    notification_id: string;
    user_id: string;
    hidden_at: string;
}

export interface NotificationPreference {
    user_id: string;
    push_enabled: boolean;
    types_enabled: unknown;
    updated_at: string;
}

export interface NotificationRead {
    notification_id: string;
    user_id: string;
    read_at: string;
}

export interface PushSubscription {
    id: number;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    created_at: string;
}

// ─── Settings & Configuration ───

export interface SystemSetting {
    id: number;
    key: string;
    value: unknown;
    updated_at: string;
    description: string | null;
}

export interface AppSetting {
    key: string;
    value: string | null;
    updated_at: string;
}

// ─── AI / KRAI Tables ───

export interface AiProviderModel {
    id: number;
    provider_slug: string;
    provider_name: string;
    model_id: string;
    display_name: string;
    enabled: boolean;
    capabilities: unknown | null;
    pricing: unknown | null;
    raw: unknown | null;
    last_fetched_at: string;
    created_at: string;
    updated_at: string;
}

export interface AiInsightCache {
    id: string;
    cache_key: string;
    page: string;
    provider_slug: string | null;
    model_id: string | null;
    report_period_mode: string | null;
    range_start: string | null;
    range_end: string | null;
    comparison_start: string | null;
    comparison_end: string | null;
    input_hash: string | null;
    response: unknown;
    generated_at: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

export interface KraiConversation {
    id: string;
    scope: string;
    title: string;
    messages: unknown;
    created_at: string;
    updated_at: string;
}

export interface KraiSetting {
    key: string;
    value: unknown;
    updated_at: string;
}

// ─── Analytics Cache Tables ───

export interface AnalyticsQueryCache {
    id: number;
    cache_key: string;
    metric_name: string;
    params: unknown | null;
    result: unknown;
    generated_at: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

export interface AnalyticsCacheMart {
    id: number;
    mart_name: string;
    metric_name: string;
    range_start: string | null;
    range_end: string | null;
    comparison_start: string | null;
    comparison_end: string | null;
    report_period_mode: string | null;
    location: string | null;
    category: string | null;
    unit_id: number | null;
    result: unknown;
    generated_at: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

// ─── Database Schema Type (Supabase client) ───

export interface Database {
    public: {
        Tables: {
            transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> };
            pengeluaran: { Row: Pengeluaran; Insert: Partial<Pengeluaran>; Update: Partial<Pengeluaran> };
            pengeluaran_categories: { Row: PengeluaranCategory; Insert: Partial<PengeluaranCategory>; Update: Partial<PengeluaranCategory> };
            tagihan_bulanan: { Row: TagihanBulanan; Insert: Partial<TagihanBulanan>; Update: Partial<TagihanBulanan> };
            tagihan_fee_lunas: { Row: TagihanFeeLunas; Insert: Partial<TagihanFeeLunas>; Update: Partial<TagihanFeeLunas> };
            tagihan_fee_lunas_items: { Row: TagihanFeeLunasItem; Insert: Partial<TagihanFeeLunasItem>; Update: Partial<TagihanFeeLunasItem> };
            lokasi_apartemen: { Row: LokasiApartemen; Insert: Partial<LokasiApartemen>; Update: Partial<LokasiApartemen> };
            nomor_kamar: { Row: NomorKamar; Insert: Partial<NomorKamar>; Update: Partial<NomorKamar> };
            karyawan_list: { Row: KaryawanList; Insert: Partial<KaryawanList>; Update: Partial<KaryawanList> };
            marketing_list: { Row: MarketingList; Insert: Partial<MarketingList>; Update: Partial<MarketingList> };
            requests: { Row: Request; Insert: Partial<Request>; Update: Partial<Request> };
            user_profiles: { Row: UserProfile; Insert: Partial<UserProfile>; Update: Partial<UserProfile> };
            user_roles: { Row: UserRoleRow; Insert: Partial<UserRoleRow>; Update: Partial<UserRoleRow> };
            user_location_assignments: { Row: UserLocationAssignment; Insert: Partial<UserLocationAssignment>; Update: Partial<UserLocationAssignment> };
            user_permissions: { Row: UserPermission; Insert: Partial<UserPermission>; Update: Partial<UserPermission> };
            activity_logs: { Row: ActivityLog; Insert: Partial<ActivityLog>; Update: Partial<ActivityLog> };
            menu_access_logs: { Row: MenuAccessLog; Insert: Partial<MenuAccessLog>; Update: Partial<MenuAccessLog> };
            menu_configuration: { Row: MenuConfiguration; Insert: Partial<MenuConfiguration>; Update: Partial<MenuConfiguration> };
            role_menu_visibility: { Row: RoleMenuVisibility; Insert: Partial<RoleMenuVisibility>; Update: Partial<RoleMenuVisibility> };
            notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
            notification_hidden: { Row: NotificationHidden; Insert: Partial<NotificationHidden>; Update: Partial<NotificationHidden> };
            notification_preferences: { Row: NotificationPreference; Insert: Partial<NotificationPreference>; Update: Partial<NotificationPreference> };
            notification_reads: { Row: NotificationRead; Insert: Partial<NotificationRead>; Update: Partial<NotificationRead> };
            push_subscriptions: { Row: PushSubscription; Insert: Partial<PushSubscription>; Update: Partial<PushSubscription> };
            system_settings: { Row: SystemSetting; Insert: Partial<SystemSetting>; Update: Partial<SystemSetting> };
            app_settings: { Row: AppSetting; Insert: Partial<AppSetting>; Update: Partial<AppSetting> };
            ai_provider_models: { Row: AiProviderModel; Insert: Partial<AiProviderModel>; Update: Partial<AiProviderModel> };
            ai_insight_cache: { Row: AiInsightCache; Insert: Partial<AiInsightCache>; Update: Partial<AiInsightCache> };
            krai_conversations: { Row: KraiConversation; Insert: Partial<KraiConversation>; Update: Partial<KraiConversation> };
            krai_settings: { Row: KraiSetting; Insert: Partial<KraiSetting>; Update: Partial<KraiSetting> };
            analytics_query_cache: { Row: AnalyticsQueryCache; Insert: Partial<AnalyticsQueryCache>; Update: Partial<AnalyticsQueryCache> };
            analytics_cache_mart: { Row: AnalyticsCacheMart; Insert: Partial<AnalyticsCacheMart>; Update: Partial<AnalyticsCacheMart> };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            get_dashboard_kpis: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
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
                }>;
            };
            get_daily_revenue_trend: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    transaction_date: string;
                    total_revenue: number;
                    transaction_count: number;
                    avg_revenue_per_transaction: number;
                    total_count: number;
                }>;
            };
            get_monthly_revenue_trend: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    month_start: string;
                    month_label: string;
                    total_revenue: number;
                    transaction_count: number;
                    avg_revenue_per_transaction: number;
                }>;
            };
            get_occupancy_per_location: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    apartment_location: string;
                    total_rooms: number;
                    total_transactions: number;
                    total_revenue: number;
                    occupancy_rate: number;
                    total_count: number;
                }>;
            };
            get_occupancy_per_unit: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    room_number: string;
                    apartment_location: string;
                    total_transactions: number;
                    total_revenue: number;
                    occupancy_rate: number;
                    total_count: number;
                }>;
            };
            get_location_fullness: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    apartment_location: string;
                    total_rooms: number;
                    peak_occupancy_rate: number;
                    avg_occupancy_rate: number;
                    total_transactions: number;
                    total_count: number;
                }>;
            };
            get_expense_breakdown_summary: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    category: string;
                    total_expense: number;
                    expense_count: number;
                    percentage: number;
                }>;
            };
            get_marketing_performance: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    marketing_name: string;
                    total_transactions: number;
                    revenue_brought: number;
                    total_fee: number;
                    fee_to_revenue_ratio: number;
                    total_count: number;
                }>;
            };
            get_guest_source_summary: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    source_name: string;
                    transaction_count: number;
                    total_revenue: number;
                    percentage: number;
                    total_count: number;
                }>;
            };
            get_net_profit_per_location: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    apartment_location: string;
                    total_revenue: number;
                    total_expense: number;
                    net_profit: number;
                    profit_margin: number;
                    total_count: number;
                }>;
            };
            get_payment_method_summary: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    apartment_location: string;
                    total_cash: number;
                    total_transfer: number;
                    total_revenue: number;
                    cash_percentage: number;
                    transfer_percentage: number;
                    total_count: number;
                }>;
            };
            get_performance_by_employee: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    employee_name: string;
                    total_transactions: number;
                    total_revenue: number;
                    avg_revenue_per_transaction: number;
                    total_count: number;
                }>;
            };
            get_performance_by_shift: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    shift: string;
                    total_transactions: number;
                    total_revenue: number;
                    avg_revenue_per_transaction: number;
                    percentage: number;
                }>;
            };
            get_repeat_guests: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    customer_name: string;
                    visit_count: number;
                    total_revenue: number;
                    first_visit: string;
                    last_visit: string;
                    total_count: number;
                }>;
            };
            get_stay_duration_summary: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    duration_category: string;
                    duration_sort_key: number;
                    transaction_count: number;
                    percentage: number;
                    total_revenue: number;
                }>;
            };
            get_checkin_heatmap: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    hour: number;
                    transaction_count: number;
                    percentage: number;
                }>;
            };
            get_outstanding_bills_summary: {
                Args: { p_location?: string | null };
                Returns: Array<{
                    aging_bucket: string;
                    bucket_order: number;
                    bill_count: number;
                    total_amount: number;
                }>;
            };
            get_underperforming_rooms: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null; p_threshold_pct?: number; p_limit?: number; p_offset?: number };
                Returns: Array<{
                    room_number: string;
                    apartment_location: string;
                    total_transactions: number;
                    total_revenue: number;
                    occupancy_rate: number;
                    total_count: number;
                }>;
            };
            get_revenue_yoy_comparison: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    current_revenue: number;
                    current_transactions: number;
                    previous_revenue: number;
                    previous_transactions: number;
                    revenue_change_pct: number;
                    transactions_change_pct: number;
                    current_period_label: string;
                    previous_period_label: string;
                }>;
            };
            get_category_summary: {
                Args: { p_lokasi?: string | null; p_kamar?: string | null; p_start_date?: string | null; p_end_date?: string | null };
                Returns: Array<{
                    category: string;
                    raw_category: string;
                    total_amount: number;
                    transaction_count: number;
                }>;
            };
            get_profit_per_location: {
                Args: { p_start_date: string; p_end_date: string; p_location?: string | null };
                Returns: Array<{
                    apartment_location: string;
                    total_revenue: number;
                    total_transactions: number;
                    avg_revenue_per_transaction: number;
                }>;
            };
        };
        Enums: {
            unit_status: UnitStatus;
        };
    };
}
