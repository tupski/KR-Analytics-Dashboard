# Dashboard Server Actions

This directory contains server actions for the Kakarama Room Analytics Dashboard.

## Files

### `actions.ts`

Server actions for fetching dashboard data. All functions use the `'use server'` directive and execute on the server-side only.

#### Available Functions

##### `fetchKPIData()`

Fetches key performance indicators for the dashboard:
- Booking count today
- Revenue today (sum of cash + transfer amounts)
- Average occupancy rate
- Available units count

**Returns:** `Promise<KPIData>`

**Requirements:** 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 14.1, 14.2, 14.6

---

##### `fetchUnitStatus()`

Fetches unit status summary by counting units in each status category.

**Returns:** `Promise<UnitStatusCounts>`

**Status Categories:**
- `tersedia` - Available units
- `ditempati` - Occupied units
- `cleaning` - Units being cleaned
- `maintenance` - Units under maintenance

**Implementation Details:**
- Queries the `unit_apartemen` table
- Counts units by their `status` field
- Handles null data gracefully
- Ignores invalid status values
- Logs errors server-side without exposing details to client

**Requirements:** 5.4, 5.5, 5.6, 5.7, 5.8

**Example Usage:**

```typescript
import { fetchUnitStatus } from '@/app/dashboard/actions';

// In a Server Component
export default async function DashboardPage() {
  const unitStatus = await fetchUnitStatus();
  
  return (
    <StatusUnit statusCounts={unitStatus} />
  );
}
```

**Error Handling:**

The function throws an error if the database query fails. Errors are logged server-side with details, but only a generic error message is thrown to prevent exposing internal details to the client.

```typescript
try {
  const unitStatus = await fetchUnitStatus();
} catch (error) {
  // Handle error - display error state to user
  console.error('Failed to fetch unit status');
}
```

## Testing

Unit tests are located in `__tests__/actions.test.ts`.

### Running Tests

```bash
npm run test
# or
yarn test
# or
pnpm test
```

### Test Coverage

The `fetchUnitStatus` function has comprehensive test coverage including:
- ✅ Correct counting of units by status
- ✅ Handling empty data (no units)
- ✅ Handling null data
- ✅ Error handling for database failures
- ✅ Ignoring invalid status values
- ✅ All status types (tersedia, ditempati, cleaning, maintenance)

## Security

All server actions in this file:
- Use the `'use server'` directive
- Execute only on the server-side
- Use the Supabase service role key (never exposed to browser)
- Log errors server-side without exposing internal details
- Follow Next.js 15 App Router best practices

## Type Safety

All functions use TypeScript types from `@/types/dashboard`:
- `KPIData` - KPI metrics structure
- `UnitStatusCounts` - Unit status counts structure
- `RevenueDataPoint` - Revenue data point structure
- `RevenueFilter` - Revenue filter type

## Database Schema

The server actions query the following Supabase tables:
- `transactions` - Financial records for bookings
- `unit_apartemen` - Individual rental units
- `lokasi_apartemen` - Apartment locations/buildings

RPC functions used:
- `get_location_fullness` - Calculate occupancy rates
- `get_daily_revenue_trend` - Get revenue trends
- `get_occupancy_per_unit` - Get per-unit occupancy

## Date Handling

All date calculations use the Asia/Jakarta timezone via `date-fns-tz`:

```typescript
import { toZonedTime } from 'date-fns-tz';

const jakartaTime = toZonedTime(new Date(), 'Asia/Jakarta');
const today = format(jakartaTime, 'yyyy-MM-dd');
```

## Performance

Server actions use `Promise.all()` for parallel data fetching where possible to optimize performance:

```typescript
const [kpiData, unitStatus] = await Promise.all([
  fetchKPIData(),
  fetchUnitStatus()
]);
```
