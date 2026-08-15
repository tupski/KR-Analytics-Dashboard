/**
 * Application Constants
 *
 * Centralized configuration for all magic numbers and thresholds.
 * This makes it easy to adjust values without searching through code.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Cache TTL Constants (in seconds)
// ═══════════════════════════════════════════════════════════════════════════════

export const CACHE_TTL = {
    /** Today/dashboard data: 5 min */
    DASHBOARD_TODAY: 300,
    /** Week data: 15 min */
    DASHBOARD_WEEK: 900,
    /** Month data: 30 min */
    DASHBOARD_MONTH: 1800,
    /** Historical closed periods (past complete months): 24h */
    HISTORICAL_CLOSED: 86400,
    /** Old quarters/years: 72h */
    HISTORICAL_OLD: 259200,
    /** Live tier (point-in-time status): 30s */
    LIVE_TIER: 30,
    /** Mart tables refreshed by sync-worker: 5 min */
    MART_DEFAULT: 300,
    /** AI Insight cache default: 30 min */
    AI_INSIGHT_DEFAULT: 1800,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Date Range Limits
// ═══════════════════════════════════════════════════════════════════════════════

export const DATE_RANGE = {
    /** Maximum queryable date range in days (2 years) */
    MAX_DAYS: 730,
    /** Default retention period for chat history in days */
    DEFAULT_RETENTION_DAYS: 30,
    /** Minimum retention period in days */
    MIN_RETENTION_DAYS: 1,
    /** Maximum retention period in days */
    MAX_RETENTION_DAYS: 365,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Idle Unit Detection Thresholds (in days)
// ═══════════════════════════════════════════════════════════════════════════════

export const IDLE_THRESHOLDS = {
    /** Days before unit is considered "watch" status */
    WATCH_DAYS: 3,
    /** Days before unit is considered "action needed" status */
    ACTION_DAYS: 7,
    /** Days before unit is considered "critical" status */
    CRITICAL_DAYS: 14,
    /** Default threshold for idle unit queries */
    DEFAULT_QUERY_DAYS: 7,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Location Health Thresholds
// ═══════════════════════════════════════════════════════════════════════════════

export const LOCATION_HEALTH = {
    /** Occupancy rate below this % is considered low */
    LOW_OCCUPANCY_RATE: 40,
    /** Occupancy rate above this % is considered high */
    HIGH_OCCUPANCY_RATE: 85,
    /** Revenue per unit below this % of average is considered low */
    LOW_REVENUE_RATIO: 0.6,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// API & Pagination Limits
// ═══════════════════════════════════════════════════════════════════════════════

export const API_LIMITS = {
    /** Default page size for list endpoints */
    DEFAULT_PAGE_SIZE: 20,
    /** Maximum page size */
    MAX_PAGE_SIZE: 100,
    /** Maximum idle units to return */
    MAX_IDLE_UNITS: 50,
    /** Maximum underperforming units to return */
    MAX_UNDERPERFORMING_UNITS: 20,
    /** Maximum top customers to return */
    MAX_TOP_CUSTOMERS: 50,
    /** Maximum location breakdown entries */
    MAX_LOCATION_BREAKDOWN: 20,
    /** Maximum marketing performance entries */
    MAX_MARKETING_ENTRIES: 50,
    /** Maximum employee performance entries */
    MAX_EMPLOYEE_ENTRIES: 50,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// AI Chat Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export const AI_CONFIG = {
    /** Maximum number of messages in conversation context */
    MAX_CONTEXT_MESSAGES: 20,
    /** Timeout for AI API calls in milliseconds */
    API_TIMEOUT_MS: 60000,
    /** Maximum retries for failed AI requests */
    MAX_RETRIES: 2,
    /** Default AI Insight cache TTL in minutes */
    INSIGHT_CACHE_TTL_MINUTES: 30,
    /** Available cache TTL options in minutes */
    INSIGHT_CACHE_TTL_OPTIONS: [15, 30, 60, 360, 1440] as const,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Insight Cache TTL Options (for UI)
// ═══════════════════════════════════════════════════════════════════════════════

export const INSIGHT_CACHE_OPTIONS = [
    { value: 15, label: '15 menit' },
    { value: 30, label: '30 menit' },
    { value: 60, label: '1 jam' },
    { value: 360, label: '6 jam' },
    { value: 1440, label: '24 jam' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const VALIDATION = {
    /** Maximum length for app name */
    MAX_APP_NAME_LENGTH: 100,
    /** Regex for valid hex color */
    HEX_COLOR_REGEX: /^#[0-9A-F]{6}$/i,
    /** Minimum length for non-empty strings */
    MIN_STRING_LENGTH: 1,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Time Constants (for calculations)
// ═══════════════════════════════════════════════════════════════════════════════

export const TIME = {
    /** Milliseconds in a day */
    MS_PER_DAY: 86_400_000,
    /** Milliseconds in an hour */
    MS_PER_HOUR: 3_600_000,
    /** WIB timezone identifier */
    WIB_TIMEZONE: 'Asia/Jakarta',
    /** Early day threshold hour (00:00-03:59 WIB = day transition) */
    EARLY_DAY_HOUR: 4,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Refresh Control (dashboard UI)
// ═══════════════════════════════════════════════════════════════════════════════

export const REFRESH = {
    /** Auto-refresh interval when checkbox enabled: 5 minutes (ms) */
    AUTO_INTERVAL_MS: 5 * 60 * 1000,
    /** Manual refresh button rate-limit cooldown: 1 minute (ms) */
    MANUAL_COOLDOWN_MS: 60 * 1000,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Default Values
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULTS = {
    /** Default app name */
    APP_NAME: 'Kakarama Room Analytics',
    /** Default primary color */
    PRIMARY_COLOR: '#2563eb',
    /** Default report period mode */
    REPORT_PERIOD_MODE: 'calendar_day' as const,
    /** Default timezone */
    TIMEZONE: 'Asia/Jakarta',
    /** Default sidebar behavior */
    SIDEBAR_BEHAVIOR: 'default',
    /** Default compact display setting */
    COMPACT_DISPLAY: false,
    /** Default app URL for development */
    APP_URL: 'http://localhost:3000',
    /** Default insight mode */
    INSIGHT_MODE: 'ai-with-fallback' as const,
} as const;
