#!/usr/bin/env node
/**
 * KR Analytics — Database Migration Runner
 *
 * Idempotent migration script for the analytics PostgreSQL database.
 * Tracks applied migrations in a `schema_migrations` table.
 * Safe to run multiple times — only new migrations are applied.
 *
 * Usage:
 *   ANALYTICS_DATABASE_URL=postgresql://user:pass@host:5432/db node db/migrate.cjs
 *   npm run db:migrate
 *
 * Environment variables:
 *   ANALYTICS_DATABASE_URL  — Connection string (primary)
 *   LOCAL_DB_USER/PASSWORD  — Fallback if URL not set
 *   LOCAL_DB_HOST/PORT/NAME — Fallback if URL not set
 */
'use strict';

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const TRACKING_TABLE = 'schema_migrations';

function getConnectionString() {
    if (process.env.ANALYTICS_DATABASE_URL) {
        return process.env.ANALYTICS_DATABASE_URL;
    }
    const user = process.env.LOCAL_DB_USER || 'analytics_user';
    const pass = process.env.LOCAL_DB_PASSWORD || 'postgres';
    const host = process.env.LOCAL_DB_HOST || 'localhost';
    const port = process.env.LOCAL_DB_PORT || '5432';
    const name = process.env.LOCAL_DB_NAME || 'analytics_db';
    return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

async function main() {
    const dbUrl = getConnectionString();
    console.log(`  Connecting to analytics database...`);

    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    try {
        // ── Create tracking table (idempotent) ──────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS "${TRACKING_TABLE}" (
                filename    VARCHAR(255) PRIMARY KEY,
                applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                checksum    TEXT
            )
        `);

        // ── Get already-applied migrations ──────────────────────────────
        const { rows: applied } = await client.query(
            `SELECT filename FROM "${TRACKING_TABLE}" ORDER BY filename`
        );
        const appliedSet = new Set(applied.map(r => r.filename));

        // ── Read migration files ────────────────────────────────────────
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            console.log('  No migrations directory found. Nothing to do.');
            return;
        }

        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort();

        if (files.length === 0) {
            console.log('  No migration files found. Nothing to do.');
            return;
        }

        const pending = files.filter(f => !appliedSet.has(f));

        if (pending.length === 0) {
            console.log(`  All ${files.length} migration(s) already applied. ✅`);
            return;
        }

        console.log(`  Found ${pending.length} pending migration(s):`);
        pending.forEach(f => console.log(`    · ${f}`));

        // ── Apply each pending migration in a transaction ───────────────
        for (const file of pending) {
            const filePath = path.join(MIGRATIONS_DIR, file);
            const sql = fs.readFileSync(filePath, 'utf-8');

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    `INSERT INTO "${TRACKING_TABLE}" (filename, checksum) VALUES ($1, $2)`,
                    [file, simpleHash(sql)]
                );
                await client.query('COMMIT');
                console.log(`  ✅ Applied: ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ Failed: ${file} — ${err.message}`);
                throw err;
            }
        }

        console.log(`  ✅ All ${pending.length} migration(s) applied successfully.`);
    } finally {
        await client.end();
    }
}

/** Simple string hash for checksum (not cryptographic, just change detection) */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

main().catch(err => {
    console.error('  Migration script failed:', err.message);
    process.exit(1);
});
