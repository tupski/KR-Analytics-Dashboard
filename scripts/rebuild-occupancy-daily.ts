/**
 * REBUILD: analytics_occupancy_daily using stay-span overlap model.
 *
 * When to run:
 *   After sync-worker is deployed with stay-span occupancy logic, to
 *   rewrite ALL existing rows that were created with the old
 *   transaction-creation-date model.
 *
 * Background:
 *   Old sync-worker populated analytics_occupancy_daily using
 *   (created_at AT TIME ZONE 'Asia/Jakarta')::DATE — only counted
 *   occupied on the transaction creation date, not the actual stay
 *   span. A 3-night stay (Jun 1 checkout Jun 4) was counted as 1
 *   occupied room-day instead of 3 (Jun 1, 2, 3).
 *
 *   This script rewrites all rows using generate_series from
 *   checkin_at::date to checkout_at::date (exclusive, WIB),
 *   matching the new refreshOccupancyDaily() in sync-worker.
 *
 * Safety:
 *   - ONLY affects local analytics DB (not Supabase production).
 *   - TRUNCATE + rewrite — fully idempotent, safe to rerun.
 *   - Manual run only, not part of any automated pipeline.
 *
 * Usage:
 *   npx tsx scripts/rebuild-occupancy-daily.ts
 *
 * Requires:
 *   ANALYTICS_DATABASE_URL env var, or sync-worker/.env with LOCAL_DB_* vars.
 */

import { Pool } from 'pg'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Bootstrap DB_URL ───────────────────────────────────────
if (!process.env.ANALYTICS_DATABASE_URL) {
    const envPath = resolve(__dirname, '..', 'sync-worker', '.env')
    if (existsSync(envPath)) {
        const lines = readFileSync(envPath, 'utf-8').split('\n')
        const env: Record<string, string> = {}
        for (const line of lines) {
            const t = line.trim()
            if (!t || t.startsWith('#')) continue
            const eq = t.indexOf('=')
            if (eq === -1) continue
            env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
        }
        const host = env.LOCAL_DB_HOST || 'localhost'
        const port = env.LOCAL_DB_PORT || '5433'
        const db = env.LOCAL_DB_NAME || 'kr_analytics'
        const user = env.LOCAL_DB_USER || 'analytics'
        const pass = env.LOCAL_DB_PASSWORD || 'analytics_dev_password'
        process.env.ANALYTICS_DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`
        console.log('[bootstrap] DB_URL from sync-worker/.env')
    } else {
        // Try root .env ANALYTICS_DATABASE_URL
        const rootEnvPath = resolve(__dirname, '..', '.env')
        if (existsSync(rootEnvPath)) {
            for (const line of readFileSync(rootEnvPath, 'utf-8').split('\n')) {
                const t = line.trim()
                if (!t || t.startsWith('#')) continue
                const eq = t.indexOf('=')
                if (eq === -1) continue
                const key = t.slice(0, eq).trim()
                const val = t.slice(eq + 1).trim()
                if (key === 'ANALYTICS_DATABASE_URL') {
                    process.env.ANALYTICS_DATABASE_URL = val
                    console.log('[bootstrap] DB_URL from root .env')
                    break
                }
            }
        }
    }
}

const DB_URL = process.env.ANALYTICS_DATABASE_URL
if (!DB_URL) {
    console.error('❌ ANALYTICS_DATABASE_URL not set and sync-worker/.env not found')
    console.error('   Set ANALYTICS_DATABASE_URL or create sync-worker/.env with LOCAL_DB_* vars')
    process.exit(1)
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
    const pool = new Pool({ connectionString: DB_URL, max: 1 })
    const client = await pool.connect()

    try {
        console.log('='.repeat(60))
        console.log('  REBUILD analytics_occupancy_daily — stay-span model')
        console.log('='.repeat(60))

        const startTime = Date.now()

        // Step 1: count source transactions
        const { rows: [{ count: txCount }] } = await client.query(`
      SELECT COUNT(*)::bigint AS count
      FROM transactions
      WHERE is_deleted = false
        AND room_number IS NOT NULL
        AND checkin_at IS NOT NULL
    `)
        const txCountNum = Number(txCount)
        console.log(`📊 Source transactions: ${txCountNum.toLocaleString()}`)

        // Step 2: truncate existing data
        await client.query('TRUNCATE TABLE analytics_occupancy_daily')
        console.log('🗑️  Truncated analytics_occupancy_daily')

        // Step 3: rewrite using stay-span overlap (same logic as refreshOccupancyDaily,
        // but WITHOUT cutoff filter — processes ALL transactions)
        const insResult = await client.query(`
      WITH stay_dates AS (
        SELECT DISTINCT ON (gs.date_wib, gs.apartment_location, gs.room_number)
          gs.date_wib,
          gs.apartment_location,
          gs.room_number,
          gs.transaction_id,
          gs.customer_name,
          gs.checkin_at,
          gs.checkout_at
        FROM (
          SELECT
            t.id AS transaction_id,
            COALESCE(t.apartment_location, 'Unknown') AS apartment_location,
            COALESCE(t.room_number, 'Unknown') AS room_number,
            t.customer_name,
            t.checkin_at,
            t.checkout_at,
            generate_series(
              (t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE,
              CASE
                WHEN t.checkout_at IS NULL
                  THEN (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE - 1
                WHEN (t.checkout_at AT TIME ZONE 'Asia/Jakarta')::DATE
                     <= (t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE
                  THEN (t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE
                ELSE (t.checkout_at AT TIME ZONE 'Asia/Jakarta')::DATE - 1
              END,
              '1 day'::interval
            )::DATE AS date_wib
          FROM transactions t
          WHERE t.is_deleted = false
            AND t.room_number IS NOT NULL
            AND t.checkin_at IS NOT NULL
        ) gs
        ORDER BY gs.date_wib, gs.apartment_location, gs.room_number, gs.transaction_id DESC
      )
      INSERT INTO analytics_occupancy_daily
        (date_wib, apartment_location, room_number, is_occupied,
         transaction_id, customer_name, checkin_at, checkout_at)
      SELECT
        sd.date_wib,
        sd.apartment_location,
        sd.room_number,
        TRUE,
        sd.transaction_id,
        sd.customer_name,
        sd.checkin_at,
        sd.checkout_at
      FROM stay_dates sd
      ORDER BY sd.date_wib, sd.apartment_location, sd.room_number
      ON CONFLICT (date_wib, apartment_location, room_number)
      DO UPDATE SET
        is_occupied = TRUE,
        transaction_id = EXCLUDED.transaction_id,
        customer_name = EXCLUDED.customer_name,
        checkin_at = EXCLUDED.checkin_at,
        checkout_at = EXCLUDED.checkout_at,
        computed_at = NOW()
    `)

        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        const rowsGen = insResult.rowCount ?? 0
        console.log(`✅ Generated ${rowsGen.toLocaleString()} occupancy rows in ${duration}s`)

        // Step 4: stats
        const { rows: [{ count: dateCount }] } = await client.query(
            `SELECT COUNT(DISTINCT date_wib)::bigint AS count FROM analytics_occupancy_daily`
        )
        const { rows: [{ count: locCount }] } = await client.query(
            `SELECT COUNT(DISTINCT apartment_location)::bigint AS count FROM analytics_occupancy_daily`
        )

        console.log(`📅  Covers ${Number(dateCount).toLocaleString()} distinct dates`)
        console.log(`📍  Covers ${Number(locCount).toLocaleString()} locations`)
        console.log('='.repeat(60))
        console.log('🎉 Rebuild complete — analytics_occupancy_daily now uses stay-span model')
        console.log('='.repeat(60))

        await client.query('COMMIT')
        process.exit(0)
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { })
        console.error('')
        console.error('❌ REBUILD FAILED')
        console.error('')
        // Print structured error info
        if (err instanceof Error) {
            console.error(`   Message: ${err.message}`)
            if ((err as any).code) console.error(`   Code: ${(err as any).code}`)
            if ((err as any).position) console.error(`   Position: ${(err as any).position}`)
            if ((err as any).detail) console.error(`   Detail: ${(err as any).detail}`)
            if ((err as any).hint) console.error(`   Hint: ${(err as any).hint}`)
        } else {
            console.error(err)
        }
        console.error('')
        process.exit(1)
    } finally {
        client.release()
        await pool.end().catch(() => { })
    }
}

main()
