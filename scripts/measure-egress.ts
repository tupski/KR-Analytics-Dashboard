/**
 * ============================================================
 * TEMPORARY EGRESS MEASUREMENT SCRIPT — DO NOT COMMIT.
 *
 * THROWAWAY / Task-1 baseline measurement only.
 * REMOVE THIS FILE in Task 4 of the egress-optimization plan
 * (plans/supabase-egress-optimization.md) once baselines are
 * recorded in the audit report.
 *
 * Purpose: measure ACTUAL rows + payload bytes + duration for
 * the dashboard's top-N Supabase queries, exactly as the app
 * issues them (lib/supabase/server.ts service-role pattern,
 * same env source as lib/env.ts).
 *
 * Run: npx tsx scripts/measure-egress.ts
 * Env: reads .env / .env.local via next's dotenv-loading
 *       (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * ============================================================
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { format, subDays, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ── env (same sources as lib/env.ts) ─────────────────────────
function loadEnvFile(path: string): void {
  try {
    const fs = require('node:fs');
    const content = fs.readFileSync(path, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* file missing — skip */
  }
}
for (const f of ['.env.local', '.env']) loadEnvFile(f);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── measurement helpers ──────────────────────────────────────
interface Measurement {
  label: string;
  source: 'ACTUAL' | 'ESTIMATED';
  table: string;
  rows: number;
  payloadBytes: number;
  durationMs: number;
  notes?: string;
}

const results: Measurement[] = [];

function payloadBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data ?? []), 'utf8');
}

async function measure(
  label: string,
  table: string,
  run: (client: SupabaseClient) => Promise<{ rows: unknown[]; count?: number | null }>,
): Promise<void> {
  const client = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const t0 = performance.now();
  try {
    const { rows, count } = await run(client);
    const dur = performance.now() - t0;
    const rowCount = count ?? rows.length;
    results.push({
      label,
      source: 'ACTUAL',
      table,
      rows: rowCount,
      payloadBytes: payloadBytes(rows),
      durationMs: Math.round(dur * 10) / 10,
    });
  } catch (e) {
    const dur = performance.now() - t0;
    results.push({
      label,
      source: 'ESTIMATED',
      table,
      rows: -1,
      payloadBytes: -1,
      durationMs: Math.round(dur * 10) / 10,
      notes: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ── WIB time helpers (mirror app's getReportPeriodRange / getTodayReportRange) ──
const TZ = 'Asia/Jakarta';
const now = new Date();
const todayWIB = format(toZonedTime(now, TZ), 'yyyy-MM-dd');
const todayStartISO = `${todayWIB}T00:00:00.000+07:00`;
const tomorrowWIB = format(toZonedTime(addDays(now, 1), TZ), 'yyyy-MM-dd');
const todayEndExclISO = `${tomorrowWIB}T00:00:00.000+07:00`;
const threeDaysAgoISO = format(toZonedTime(subDays(now, 3), TZ), 'yyyy-MM-dd') + 'T00:00:00.000+07:00';
const lookback7ISO = format(toZonedTime(subDays(now, 7), TZ), 'yyyy-MM-dd') + 'T00:00:00.000+07:00';
const monthStartWIB = format(toZonedTime(new Date(now.getFullYear(), now.getMonth(), 1), TZ), 'yyyy-MM-dd') + 'T00:00:00.000+07:00';
const nowISO = now.toISOString();
const last30StartWIB = format(toZonedTime(subDays(now, 30), TZ), 'yyyy-MM-dd') + 'T00:00:00.000+07:00';

const periodOr = (start: string, endExcl: string) =>
  `and(checkin_at.gte.${start},checkin_at.lt.${endExcl}),and(checkin_at.is.null,created_at.gte.${start},created_at.lt.${endExcl})`;

async function main(): Promise<void> {
  if (!url || !key) {
    console.log('=== EGRESS BASELINE: UNAVAILABLE (no Supabase credentials in .env/.env.local) ===');
    console.log('State: baseline is source-code-estimated. Estimates below use current code paths.');
    printEstimatedOnly();
    return;
  }

  console.log(`=== EGRESS BASELINE — ACTUAL (Supabase ${url}) ===`);
  console.log(`now(WIB)=${todayWIB}  period=[${todayStartISO} .. ${todayEndExclISO})`);

  // ── Q1. HC-2 fetchUnitPerformanceData Query A: full-history checkout scan ──
  await measure(
    'HC-2 UnitPerf QueryA (checkout_at < now, full history)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('room_number, apartment_location, checkout_at').lt('checkout_at', nowISO).order('checkout_at', { ascending: false });
      return { rows: data ?? [] };
    },
  );

  // ── Q2. HC-2 Query B: current-month revenue per room (COALESCE or-filter) ──
  await measure(
    'HC-2 UnitPerf QueryB (month tx: COALESCE or-filter)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('room_number, apartment_location, cash_amount, transfer_amount, checkin_at, created_at').or(`checkin_at.gte.${monthStartWIB},and(checkin_at.is.null,created_at.gte.${monthStartWIB})`);
      return { rows: data ?? [] };
    },
  );

  // ── Q3. getLiveOccupancy: 3-day window + open stays ──
  await measure(
    'getLiveOccupancy (3-day window + open stays)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('room_number, apartment_location, checkin_at, created_at, checkout_at, rental_duration').or(`checkin_at.gt.${threeDaysAgoISO},checkout_at.is.null`).order('checkin_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      return { rows: data ?? [] };
    },
  );

  // ── Q4. getLiveActiveStays (used by unit status / today checkouts): 7-day OR-window ──
  await measure(
    'getLiveActiveStays (7-day OR-window)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('id, created_at, checkin_at, checkout_at, rental_duration, apartment_location, room_number, customer_name').or(`checkin_at.gte.${lookback7ISO},created_at.gte.${lookback7ISO},checkout_at.is.null,checkout_at.gte.${nowISO}`).order('created_at', { ascending: false });
      return { rows: data ?? [] };
    },
  );

  // ── Q5. fetchTodayCheckins (today or-filter) ──
  await measure(
    'fetchTodayCheckins (today checkin window)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('id, apartment_location, room_number, customer_name, checkin_at, created_at').or(`checkin_at.gte.${todayStartISO},and(checkin_at.is.null,created_at.gte.${todayStartISO})`).order('checkin_at', { ascending: false }).limit(100);
      return { rows: data ?? [] };
    },
  );

  // ── Q6. fetchKPIData booking count (head count today) ──
  await measure(
    'fetchKPIData bookingCount (head count today)',
    'transactions',
    async (c) => {
      const { count } = await c.from('transactions').select('*', { count: 'exact', head: true }).or(periodOr(todayStartISO, todayEndExclISO));
      return { rows: [], count: count ?? 0 };
    },
  );

  // ── Q7. fetchKPIData / getRevenueSummary Supabase fallback (today window) ──
  await measure(
    'fetchKPIData revenue (today window, service fallback)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('cash_amount, transfer_amount, checkin_at, created_at').or(periodOr(todayStartISO, todayEndExclISO));
      return { rows: data ?? [] };
    },
  );

  // ── Q8. fetchLocationHealthData revenue per location (today window) ──
  await measure(
    'fetchLocationHealthData revenue (today window)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('apartment_location, cash_amount, transfer_amount, checkin_at, created_at').or(periodOr(todayStartISO, todayEndExclISO));
      return { rows: data ?? [] };
    },
  );

  // ── Q9. fetchMarketingPerformanceData (today window) ──
  await measure(
    'fetchMarketingPerformanceData (today window)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('marketing_name, cash_amount, transfer_amount, checkin_at, created_at').or(`checkin_at.gte.${todayStartISO},and(checkin_at.is.null,created_at.gte.${todayStartISO})`);
      return { rows: data ?? [] };
    },
  );

  // ── Q10. getDailyOccupancyTrendLegacy Supabase fallback (30-day overlap window) ──
  await measure(
    'getDailyOccupancyTrendLegacy (30d overlap, Supabase fallback)',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('room_number, apartment_location, checkin_at, checkout_at, rental_duration, created_at').lte('checkin_at', `${todayWIB}T23:59:59`).or(`checkout_at.gte.${last30StartWIB.split('T')[0]}T00:00:00,checkout_at.is.null`);
      return { rows: data ?? [] };
    },
  );

  // ── Q11. nomor_kamar full row fetch (getLiveOccupancy + laporan + unit perf) ──
  await measure(
    'nomor_kamar full rows (name, lokasi)',
    'nomor_kamar',
    async (c) => {
      const { data } = await c.from('nomor_kamar').select('name, lokasi');
      return { rows: data ?? [] };
    },
  );

  // ── Q12. fetchLaporanData transactions select(*) full period (30-day) ──
  await measure(
    'fetchLaporanData transactions select(*) 30d',
    'transactions',
    async (c) => {
      const { data } = await c.from('transactions').select('*').or(`checkin_at.gte.${last30StartWIB},and(checkin_at.is.null,created_at.gte.${last30StartWIB})`).order('checkin_at', { ascending: false });
      return { rows: data ?? [] };
    },
  );

  // ── Q13. fetchLaporanData pengeluaran scan (30d) ──
  await measure(
    'fetchLaporanData pengeluaran scan 30d',
    'pengeluaran',
    async (c) => {
      const { data } = await c.from('pengeluaran').select('category, jumlah, apartment_location, room_number').gte('tanggal', last30StartWIB.split('T')[0]).lte('tanggal', todayWIB);
      return { rows: data ?? [] };
    },
  );

  // ── Q14. fetchLaporanData tagihan_bulanan full scans (no date filter) ──
  await measure(
    'fetchLaporanData tagihan_bulanan paid (full scan)',
    'tagihan_bulanan',
    async (c) => {
      const { data } = await c.from('tagihan_bulanan').select('amount').eq('status', 'paid');
      return { rows: data ?? [] };
    },
  );
  await measure(
    'fetchLaporanData tagihan_bulanan unpaid (full scan)',
    'tagihan_bulanan',
    async (c) => {
      const { data } = await c.from('tagihan_bulanan').select('amount').eq('status', 'unpaid');
      return { rows: data ?? [] };
    },
  );

  // ── Q15. fetchLaporanData tagihan_fee_lunas_items full scans ──
  await measure(
    'fetchLaporanData tagihan_fee_lunas_items (full scan)',
    'tagihan_fee_lunas_items',
    async (c) => {
      const { data } = await c.from('tagihan_fee_lunas_items').select('fee_amount');
      return { rows: data ?? [] };
    },
  );

  // ── Q16. booking page fetchBookings (select * + exact count, page 1/20) ──
  await measure(
    'fetchBookings select(*) count exact page1',
    'transactions',
    async (c) => {
      const { data, count } = await c.from('transactions').select('*', { count: 'exact' }).order('checkin_at', { ascending: false }).range(0, 19);
      return { rows: data ?? [], count };
    },
  );

  // ── Q17. nomor_kamar count head (fetchKPIData totalRooms) ──
  await measure(
    'nomor_kamar count head',
    'nomor_kamar',
    async (c) => {
      const { count } = await c.from('nomor_kamar').select('id', { count: 'exact', head: true });
      return { rows: [], count: count ?? 0 };
    },
  );

  // ── Print ──
  printResults(results);
}

function printResults(rs: Measurement[]): void {
  console.log('\n--- per-query ─────────────────────────────────────────────');
  console.log('LABEL | SOURCE | TABLE | ROWS | PAYLOAD_BYTES | DURATION_MS | NOTES');
  let totalBytes = 0;
  let actualCount = 0;
  for (const r of rs) {
    console.log(
      `${r.label} | ${r.source} | ${r.table} | ${r.rows} | ${r.payloadBytes} | ${r.durationMs}${r.notes ? ' | ' + r.notes : ''}`,
    );
    if (r.source === 'ACTUAL') {
      totalBytes += r.payloadBytes;
      actualCount++;
    }
  }
  console.log('--- totals ─────────────────────────────────────────────────');
  if (actualCount > 0) {
    console.log(`ACTUAL TOTAL payload bytes: ${totalBytes} (${(totalBytes / 1024).toFixed(1)} KiB) across ${actualCount} measured queries`);
  } else {
    console.log('No ACTUAL measurements — all failed/unavailable.');
  }
  console.log('NOTE: payload bytes = JSON.stringify length of returned rows (JSONB wire format). PostgREST adds JSON envelope overhead.');
}

function printEstimatedOnly(): void {
  const estimates: Array<[string, string, number, number]> = [
    ['HC-2 UnitPerf QueryA checkout scan', 'transactions', 4000, 200000],
    ['HC-2 UnitPerf QueryB month tx', 'transactions', 300, 25000],
    ['getLiveOccupancy 3-day window', 'transactions', 120, 15000],
    ['getLiveActiveStays 7-day OR', 'transactions', 200, 30000],
    ['fetchTodayCheckins', 'transactions', 10, 2000],
    ['fetchKPIData count today', 'transactions', 0, 120],
    ['fetchKPIData revenue today', 'transactions', 10, 2000],
    ['fetchLocationHealthData revenue', 'transactions', 10, 2000],
    ['fetchMarketingPerformanceData', 'transactions', 10, 2000],
    ['getDailyOccupancyTrendLegacy 30d', 'transactions', 1500, 200000],
    ['nomor_kamar full rows', 'nomor_kamar', 60, 4000],
    ['fetchLaporanData select(*) 30d', 'transactions', 800, 400000],
    ['fetchLaporanData pengeluaran 30d', 'pengeluaran', 200, 25000],
    ['tagihan_bulanan paid+unpaid scans', 'tagihan_bulanan', 400, 20000],
    ['tagihan_fee_lunas_items scan', 'tagihan_fee_lunas_items', 500, 15000],
    ['fetchBookings select(*) p1', 'transactions', 20, 12000],
    ['nomor_kamar count head', 'nomor_kamar', 0, 100],
  ];
  console.log('LABEL | TABLE | EST_ROWS | EST_PAYLOAD_BYTES');
  let total = 0;
  for (const [label, table, rows, bytes] of estimates) {
    console.log(`${label} | ${table} | ${rows} | ${bytes}`);
    total += bytes;
  }
  console.log(`ESTIMATED TOTAL: ${total} bytes (${(total / 1024).toFixed(1)} KiB) per full page load (analytics DB path disabled — all Supabase).`);
}

main().catch((e) => {
  console.error('measure-egress crashed:', e);
  process.exit(1);
});
