#!/usr/bin/env node
/**
 * KR Analytics — Docker Container Startup Script
 *
 * 1. Waits for PostgreSQL to be ready (up to 60 seconds)
 * 2. Runs pending database migrations (idempotent)
 * 3. Starts the Next.js production server
 *
 * This is used as Docker ENTRYPOINT to ensure migrations
 * run before the application serves traffic.
 */
'use strict';

const { Client } = require('pg');
const { spawn } = require('child_process');

const DB_URL =
    process.env.ANALYTICS_DATABASE_URL ||
    `postgresql://${process.env.LOCAL_DB_USER || 'analytics_user'}:${process.env.LOCAL_DB_PASSWORD || 'postgres'}@${process.env.LOCAL_DB_HOST || 'localhost'}:${process.env.LOCAL_DB_PORT || '5432'}/${process.env.LOCAL_DB_NAME || 'analytics_db'}`;

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

async function waitForDatabase() {
    for (let i = 1; i <= MAX_RETRIES; i++) {
        const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
        try {
            await client.connect();
            await client.query('SELECT 1');
            await client.end();
            console.log('  ✅ Database is ready.');
            return;
        } catch (err) {
            await client.end().catch(() => {});
            if (i < MAX_RETRIES) {
                console.log(`  ⏳ Waiting for database (${i}/${MAX_RETRIES})...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error('  ❌ Database did not become ready in time.');
                process.exit(1);
            }
        }
    }
}

async function runMigrations() {
    console.log('  Running database migrations...');
    return new Promise((resolve, reject) => {
        const child = spawn('node', ['db/migrate.cjs'], {
            stdio: ['inherit', 'inherit', 'inherit'],
            env: { ...process.env, ANALYTICS_DATABASE_URL: DB_URL },
        });
        child.on('exit', (code) => {
            if (code === 0) {
                console.log('  ✅ Migrations completed.');
                resolve();
            } else {
                console.error(`  ❌ Migration failed (exit code ${code}).`);
                reject(new Error(`Migration exited with code ${code}`));
            }
        });
        child.on('error', (err) => {
            console.error('  ❌ Migration process error:', err.message);
            reject(err);
        });
    });
}

function startApp() {
    console.log('  Starting Next.js production server...');
    const server = spawn('node', ['server.js'], {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: process.env,
    });
    server.on('exit', (code) => {
        console.log(`  Server exited with code ${code}.`);
        process.exit(code ?? 0);
    });
    server.on('error', (err) => {
        console.error('  Failed to start server:', err.message);
        process.exit(1);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log('=== KR Analytics Dashboard — Startup ===');
    await waitForDatabase();
    await runMigrations();
    startApp();
})().catch((err) => {
    console.error('  ❌ Startup failed:', err.message);
    process.exit(1);
});
