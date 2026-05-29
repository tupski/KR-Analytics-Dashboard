import { Pool } from 'pg';
import { config } from './config';

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            host: config.localDbHost,
            port: config.localDbPort,
            database: config.localDbName,
            user: config.localDbUser,
            password: config.localDbPassword,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
