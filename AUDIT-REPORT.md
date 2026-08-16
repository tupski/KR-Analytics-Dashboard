# KR Analytics Dashboard - Comprehensive Audit Report

**Generated:** 2026-08-16  
**Audit Scope:** Data Query Patterns, UI/UX Responsiveness, Analytics Fallback Behavior

---

## Executive Summary

This audit examined the KR Analytics Dashboard codebase across two primary domains:

1. **Data Query & Analytics Layer** - Period boundaries, metric consistency, analytics DB fallback behavior
2. **UI/UX & Mobile Responsiveness** - Layout issues, mobile navigation, touch interactions

**Overall Assessment:** The codebase shows strong architecture with analytics-first patterns and comprehensive fallback mechanisms. However, several critical issues were identified that could impact data accuracy, user experience, and system reliability.

### Critical Findings Summary

- **5 High-Priority Data Query Issues** - Inconsistent timezone handling, manual offset arithmetic, potential cache key collisions
- **4 High-Priority UI/UX Issues** - Mobile drawer state management, responsive breakpoint inconsistencies, chart readability on mobile
- **3 Medium-Priority Issues** - Location filter inconsistency, missing error boundaries, accessibility concerns

---

## 1. Data Query & Analytics Issues

### 1.1 ❌ CRITICAL: Timezone Handling Inconsistencies

**Location:** [`lib/analytics/revenue.ts:8-18`](lib/analytics/revenue.ts:8), [`lib/analytics/occupancy.ts:46-52`](lib/analytics/occupancy.ts:46), [`lib/analytics/analytics-service.ts:20-31`](lib/analytics/analytics-service.ts:20)

**Issue:**  
Multiple analytics service functions use manual timezone offset arithmetic (`now.getTime() + 7 * 60 * 60 * 1000`) instead of using `date-fns-tz` for WIB timezone conversion.

**Code Example:**
```typescript
// ❌ INCORRECT - Manual offset arithmetic
function defaultRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000); // Brittle!
    const end = new Date(wib);
    end.setDate(end.getDate() + 1);
    // ...
}
```

**Impact:**
- **DST edge cases** - Indonesia doesn't observe DST, but this pattern is error-prone if copied
- **Inconsistency** - [`lib/shared/report-period.ts`](lib/shared/report-period.ts) uses `date-fns-tz` correctly as the single source of truth
- **Maintenance burden** - Hardcoded offset is scattered across 3+ files

**Recommendation:**
```typescript
// ✅ CORRECT - Use date-fns-tz consistently
import { toZonedTime } from 'date-fns-tz';

function defaultRange(): { startDate: string; endDate: string } {
    const now = toZonedTime(new Date(), 'Asia/Jakarta');
    // ... rest of logic
}
```

**Priority:** HIGH  
**Effort:** Low (1-2 hours to refactor all occurrences)

---

### 1.2 ⚠️ HIGH: Period Boundary Validation Gap

**Location:** [`lib/dashboard/revenue.ts:42-50`](lib/dashboard/revenue.ts:42), [`lib/dashboard/occupancy.ts:65-94`](lib/dashboard/occupancy.ts:65)

**Issue:**  
Dashboard aggregation functions accept both `ReportPeriodRange` (new) and legacy `{ startDate, endDate }` parameters, but don't validate that legacy parameters match the period mode (calendar_day vs hotel_day).

**Code Example:**
```typescript
export async function getRevenueSummary(params: {
    period?: ReportPeriodRange;
    startDate?: string;  // Legacy - no validation
    endDate?: string;    // Legacy - no validation
    location?: string;
}) {
    // If legacy params are used, period mode is unknown!
}
```

**Impact:**
- **Data integrity risk** - Mixing hotel_day period boundaries with legacy date ranges could produce incorrect results
- **Silent failures** - No error is thrown when incompatible parameters are passed
- **Migration risk** - Old code paths may silently produce wrong data

**Recommendation:**
1. Deprecate legacy parameters with console warnings
2. Add validation: `if (startDate && !period) throw new Error('Use ReportPeriodRange instead')`
3. Set migration deadline (e.g., remove legacy support in Q3 2026)

**Priority:** HIGH  
**Effort:** Medium (4-6 hours including validation + deprecation notices)

---

### 1.3 ⚠️ HIGH: Analytics Fallback Logic Not Uniform

**Location:** [`lib/services/revenue.ts:99-150`](lib/services/revenue.ts:99), [`lib/services/occupancy.ts:146-264`](lib/services/occupancy.ts:146)

**Issue:**  
Revenue service checks `data.totalTransactions > 0` before returning analytics results, falling back to Supabase if zero. Occupancy service has no equivalent check, blindly trusting analytics DB even if it returns empty results.

**Code Example:**
```typescript
// Revenue - checks for zero transactions
if (data.totalTransactions > 0) {
    return result;
}
console.debug('[Revenue] Analytics returned 0 transactions, falling back');

// Occupancy - no such check!
// Returns analytics data even if sync is incomplete
```

**Impact:**
- **Inconsistent reliability** - Occupancy metrics may show stale/incomplete data when analytics DB is behind
- **User confusion** - Revenue shows recent data (from Supabase fallback), occupancy shows old data (from analytics)
- **Silent staleness** - No warning to user that occupancy data may be outdated

**Recommendation:**
1. Add sync freshness check to occupancy service (check `analytics_sync_metadata` table)
2. Fall back to Supabase if analytics data is >15 minutes stale
3. Return metadata flag: `{ data, source: 'analytics' | 'supabase', isFresh: boolean }`

**Priority:** HIGH  
**Effort:** Medium (6-8 hours including freshness checking logic)

---

### 1.4 ⚠️ MEDIUM: Location Filter Not Applied Consistently

**Location:** [`lib/dashboard/revenue.ts:42-51`](lib/dashboard/revenue.ts:42)

**Issue:**  
The `getRevenueSummary` function accepts a `location` parameter but doesn't pass it to `getRevenueSummaryAnalytics()` or `getExpenseSummary()`. Location filtering only works for the trend chart, not the summary KPI.

**Code Example:**
```typescript
export async function getRevenueSummary(params: {
    period: ReportPeriodRange;
    location?: string;  // ← Accepted but ignored!
}): Promise<RevenueSummaryResult> {
    const [revenueSummary, expenseSummary, revenueTrend] = await Promise.all([
        getServiceRevenueSummary(params.period),  // ← location not passed
        getServiceExpenseSummary(undefined, undefined, params.period),  // ← location not passed
        getRevenueTrend(params.period, params.location ?? null),  // ← Only trend uses location!
    ]);
}
```

**Impact:**
- **Misleading UI** - Summary KPI shows all-location totals, but trend chart shows filtered data
- **User confusion** - "Why doesn't the summary match the trend line?"
- **API inconsistency** - Parameter accepted but partially ignored

**Recommendation:**
1. Pass `location` to all three data fetchers
2. Update analytics queries to support location filtering
3. Or remove `location` param from function signature if not supported

**Priority:** MEDIUM  
**Effort:** Medium (4-6 hours including analytics query updates)

---

### 1.5 ⚠️ MEDIUM: Cache Key Collision Risk

**Location:** [`lib/egress-cache.ts:10-20`](lib/egress-cache.ts:10), [`lib/analytics/cache.ts:85-140`](lib/analytics/cache.ts:85)

**Issue:**  
Egress cache and analytics cache both use simple string concatenation for cache keys without URL-safe encoding or delimiters. This could cause collisions if parameters contain special characters.

**Code Example:**
```typescript
// Potential collision:
// egressCacheKey('transactions', 'revenue', '2026-05-01', '2026-05-31')
// → 'transactions:revenue:2026-05-01:2026-05-31'
// 
// What if location contains ':'?
// → 'transactions:revenue:2026-05-01:2026-05-31:Apartment:A'
//    vs 'transactions:revenue:2026-05-01:2026-05:31:Apartment:A' (malformed date)
```

**Impact:**
- **Cache pollution** - Edge case parameters could overwrite unrelated cache entries
- **Security risk (low)** - Malicious input could intentionally cause collisions
- **Debugging difficulty** - Hard to trace why cache returns wrong data

**Recommendation:**
```typescript
function egressCacheKey(table: string, metric: string, ...params: any[]): string {
    return `${table}:${metric}:${params.map(p => 
        encodeURIComponent(String(p ?? 'null'))
    ).join(':')}`;
}
```

**Priority:** MEDIUM  
**Effort:** Low (2-3 hours to add encoding + invalidate old cache)

---

## 2. UI/UX & Mobile Responsiveness Issues

### 2.1 ❌ CRITICAL: Mobile Bottom Nav Drawer State Not Persisted

**Location:** [`components/layout/MobileBottomNav.tsx:19`](components/layout/MobileBottomNav.tsx:19)

**Issue:**  
The "More" drawer uses local component state (`useState`). When navigating to a new page, the drawer closes immediately because the component unmounts. Users expect the drawer to stay open until explicitly closed.

**Code Example:**
```typescript
export default function MobileBottomNav() {
    const [drawerOpen, setDrawerOpen] = useState(false);  // ← Lost on navigation!
    // ...
}
```

**Impact:**
- **Poor UX** - User opens drawer, taps a link, drawer closes, user loses context
- **Extra taps** - User must reopen drawer for each navigation item
- **Inconsistent behavior** - Desktop nav stays visible, mobile doesn't

**Recommendation:**
1. Move drawer state to URL search params: `?drawer=open`
2. Or use `localStorage`: `const [drawerOpen, setDrawerOpen] = usePersistedState('mobileDrawer', false)`
3. Or move state to parent layout component

**Priority:** HIGH  
**Effort:** Low (1-2 hours)

---

### 2.2 ⚠️ HIGH: Chart Responsiveness Issues on Small Screens

**Location:** [`components/dashboard/GrafikPendapatan.tsx:159-182`](components/dashboard/GrafikPendapatan.tsx:159), [`components/dashboard/GrafikOkupansi.tsx:87-121`](components/dashboard/GrafikOkupansi.tsx:87)

**Issue:**  
Charts use fixed height (`h-64 sm:h-80`) but don't adjust axis label sizing or rotation on mobile. On screens <375px, X-axis labels overlap and become unreadable.

**Code Example:**
```typescript
<XAxis
    dataKey="label"
    stroke="#6b7280"
    style={{ fontSize: '12px' }}  // ← Fixed size, too large for mobile
    angle={-45}
    textAnchor="end"
    height={80}  // ← Fixed height doesn't scale
/>
```

**Impact:**
- **Readability** - Date labels overlap on iPhone SE, small Android devices
- **Accessibility** - Low vision users can't read crowded labels
- **Professional appearance** - Charts look broken on small screens

**Recommendation:**
```typescript
// Use responsive font sizing
style={{ fontSize: 'clamp(9px, 2vw, 12px)' }}

// Or conditionally render fewer data points on mobile
const displayData = isMobile 
    ? data.filter((_, i) => i % 2 === 0)  // Show every other point
    : data;
```

**Priority:** HIGH  
**Effort:** Medium (3-4 hours including testing on multiple devices)

---

### 2.3 ⚠️ MEDIUM: Inconsistent Responsive Breakpoints

**Location:** Multiple dashboard components

**Issue:**  
Components use inconsistent breakpoints for mobile/desktop transitions:
- [`HeaderDashboard.tsx`](components/dashboard/HeaderDashboard.tsx:24): `hidden sm:inline-flex` (640px)
- [`MarketingPerformancePanel.tsx`](components/dashboard/MarketingPerformancePanel.tsx:163): `hidden lg:block` (1024px)
- [`UnitPerformancePanel.tsx`](components/dashboard/UnitPerformancePanel.tsx:145): `hidden lg:block` (1024px)
- [`LocationHealthMatrix.tsx`](components/dashboard/LocationHealthMatrix.tsx:96): `hidden sm:block` (640px)

**Impact:**
- **Layout jumping** - Some components switch at 640px, others at 1024px
- **Wasted space** - Tablet users (768-1024px) see mobile layout when desktop fits
- **Maintenance burden** - No single source of truth for "mobile vs desktop"

**Recommendation:**
1. Define standard breakpoints in Tailwind config:
   ```js
   module.exports = {
       theme: {
           screens: {
               'mobile': '640px',
               'tablet': '768px',
               'desktop': '1024px',
           }
       }
   }
   ```
2. Use consistent breakpoint: `hidden desktop:block` for all table ↔ card switches

**Priority:** MEDIUM  
**Effort:** Medium (4-6 hours to audit and update all components)

---

### 2.4 ⚠️ MEDIUM: Missing Loading States for Chart Filters

**Location:** [`components/dashboard/GrafikPendapatan.tsx:37-50`](components/dashboard/GrafikPendapatan.tsx:37)

**Issue:**  
When changing the revenue chart filter (daily/weekly/monthly), there's no visual feedback during the fetch. The chart stays visible with stale data until the new data loads.

**Code Example:**
```typescript
const handleFilterChange = async (newFilter: RevenueFilter) => {
    setFilter(newFilter);  // ← Filter updates immediately
    startTransition(async () => {
        const newData = await fetchRevenueData(newFilter);  // ← Chart shows old data
        setData(newData);
    });
};
```

**Impact:**
- **Confusing UX** - User sees old data for 500ms-2s after clicking filter
- **Accidental double-clicks** - User thinks filter didn't work, clicks again
- **No error feedback** - If fetch fails, user never knows

**Recommendation:**
```typescript
{isPending && (
    <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
        <Loader className="animate-spin" />
    </div>
)}
```

**Priority:** MEDIUM  
**Effort:** Low (1-2 hours)

---

### 2.5 ⚠️ LOW: Touch Target Size Below 44px Minimum

**Location:** [`components/dashboard/TabSwitcher.tsx:32-54`](components/dashboard/TabSwitcher.tsx:32), [`components/dashboard/GrafikPendapatan.tsx:107-119`](components/dashboard/GrafikPendapatan.tsx:107)

**Issue:**  
Several buttons/tabs have touch targets <44px on mobile, violating WCAG 2.5.5 (AAA) and iOS Human Interface Guidelines.

**Examples:**
- Tab buttons: `px-3 py-1.5` (approx 38px height)
- Chart filter buttons: `px-2.5 py-1` (approx 32px height)

**Impact:**
- **Accessibility failure** - Motor impairment users struggle to tap buttons
- **Accidental taps** - Users miss intended button, tap wrong one
- **App Store rejection risk** - iOS app submission may fail accessibility review

**Recommendation:**
```typescript
// Minimum 44x44px touch target
className="px-4 py-2.5 text-sm"  // Ensures min-h-[44px]
```

**Priority:** LOW (but required for accessibility compliance)  
**Effort:** Low (2-3 hours to audit and update all interactive elements)

---

## 3. Additional Observations

### 3.1 ✅ POSITIVE: Strong Analytics-First Architecture

The codebase demonstrates excellent separation of concerns:
- [`lib/shared/report-period.ts`](lib/shared/report-period.ts) - Single source of truth for period calculations
- Consistent fallback pattern: Analytics DB → Supabase fallback
- Clear migration comments documenting legacy support

### 3.2 ✅ POSITIVE: Comprehensive Error Handling

Services use try-catch with graceful degradation:
```typescript
try {
    const data = await getRevenueSummaryAnalytics(startStr, endExclusive);
    if (data.totalTransactions > 0) return result;
} catch (error) {
    console.warn('[Revenue] Analytics unavailable, falling back');
}
```

### 3.3 ⚠️ IMPROVEMENT: Missing Error Boundaries

UI components don't have error boundaries. If a chart component throws, entire dashboard crashes.

**Recommendation:**
Wrap dashboard sections in `<ErrorBoundary>`:
```tsx
<ErrorBoundary fallback={<ChartErrorState />}>
    <GrafikPendapatan {...props} />
</ErrorBoundary>
```

---

## 4. Prioritized Recommendations

### Immediate Action (Sprint 1)
1. **Fix timezone handling inconsistencies** - Migrate to `date-fns-tz` everywhere
2. **Add mobile drawer state persistence** - Use URL params or localStorage
3. **Implement analytics fallback freshness check** - Prevent stale occupancy data

### Short-term (Sprint 2-3)
4. **Add period boundary validation** - Reject legacy parameters with warnings
5. **Fix chart responsiveness** - Responsive font sizing, fewer data points on mobile
6. **Implement location filter consistently** - Pass through all aggregation functions

### Medium-term (Q3 2026)
7. **Standardize responsive breakpoints** - Single source of truth in Tailwind config
8. **Add error boundaries** - Prevent cascade failures
9. **Fix touch target sizes** - Meet WCAG 2.5.5 AAA compliance

### Low-priority
10. **Add cache key encoding** - Prevent collision edge cases

---

## 5. Impact Assessment

| Issue | Severity | User Impact | Data Integrity Risk | Effort |
|-------|----------|-------------|---------------------|--------|
| Timezone handling | HIGH | Medium | HIGH - Wrong period boundaries | Low |
| Period validation | HIGH | Low | HIGH - Silent data mismatches | Medium |
| Analytics fallback | HIGH | High | MEDIUM - Stale metrics | Medium |
| Mobile drawer state | HIGH | High | None | Low |
| Chart responsiveness | HIGH | High | None | Medium |
| Location filter | MEDIUM | Medium | MEDIUM - Misleading summaries | Medium |
| Cache key collision | MEDIUM | Low | LOW - Rare edge case | Low |
| Breakpoint consistency | MEDIUM | Medium | None | Medium |
| Chart loading states | MEDIUM | Medium | None | Low |
| Touch target size | LOW | Low | None | Low |

---

## 6. Testing Recommendations

### Data Query Testing
1. **Period boundary tests** - Verify calendar_day vs hotel_day produce correct date ranges
2. **Timezone edge case tests** - Test midnight boundaries, date transitions
3. **Analytics fallback tests** - Mock analytics DB failure, verify Supabase fallback
4. **Location filter tests** - Verify filtering works across all aggregation functions

### UI/UX Testing
1. **Mobile device testing** - Test on iPhone SE, iPhone 14 Pro, small Android (<375px)
2. **Tablet testing** - Verify layout at 768px-1024px breakpoint
3. **Touch target audit** - Use browser dev tools to measure tap regions
4. **Chart readability tests** - Test with 30, 60, 90 data points

### Integration Testing
5. **Cross-browser testing** - Safari, Chrome, Firefox mobile
6. **Network conditions** - Test slow 3G to verify loading states
7. **Accessibility audit** - Run axe-core, test with screen reader

---

## Conclusion

The KR Analytics Dashboard demonstrates solid architectural patterns with analytics-first design and comprehensive fallback mechanisms. However, critical issues in timezone handling, period validation, and mobile UX require immediate attention to ensure data accuracy and user satisfaction.

**Recommended immediate actions:**
1. Migrate all timezone calculations to `date-fns-tz`
2. Add period boundary validation to prevent silent data mismatches
3. Implement mobile drawer state persistence
4. Add analytics freshness checks to occupancy service

**Estimated total effort:** 30-40 engineering hours across 2-3 sprints

---

**Report compiled by:** OpenAgentic AI Code Audit  
**Last updated:** 2026-08-16  
**Next audit recommended:** Q4 2026 (post-migration cleanup)
