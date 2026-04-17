import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

/**
 * Convert snake_case keys to camelCase
 */
function toCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'hydash',
  user: process.env.DB_USER || 'hydash',
  password: process.env.DB_PASSWORD || 'hydash',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
  process.exit(-1);
});

pool.on('connect', () => {
  logger.info('New PostgreSQL client connected');
});

/**
 * Execute a parameterized SQL query
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    // Transform snake_case keys to camelCase
    result.rows = result.rows.map(row => toCamelCase<T>(row as Record<string, unknown>));
    const duration = Date.now() - start;
    logger.debug('Query executed', { text: text.substring(0, 100), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query error', { text: text.substring(0, 100), duration, error });
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: { query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>> }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const queryFn = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
      client.query<R>(text, params);
    const result = await callback({ query: queryFn });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a single row from a query
 */
export async function getOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query(text, params);
  if (!result.rows[0]) return null;
  return toCamelCase<T>(result.rows[0] as Record<string, unknown>);
}

/**
 * Get all rows from a query
 */
export async function getMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query(text, params);
  return result.rows.map(row => toCamelCase<T>(row as Record<string, unknown>));
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  try {
    // Check if migrations table exists
    const tableCheck = await query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migrations')"
    );

    if (!tableCheck.rows[0].exists) {
      await query(`
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    }

    // Get applied migrations
    const applied = await getMany<{ name: string }>('SELECT name FROM migrations ORDER BY id');
    const appliedNames = new Set(applied.map(r => r.name));

    // Define migration files in order
    const migrations = [
      '001_init.sql',
      '002_seed_admin.sql',
    ];

    const fs = await import('fs/promises');
    const path = await import('path');

    for (const migration of migrations) {
      if (appliedNames.has(migration)) {
        logger.info(`Migration ${migration} already applied, skipping`);
        continue;
      }

      logger.info(`Applying migration: ${migration}`);
      const migrationPath = path.join(__dirname, '../../migrations', migration);
      const sql = await fs.readFile(migrationPath, 'utf-8');

      await transaction(async (tx) => {
        await tx.query(sql);
        await tx.query('INSERT INTO migrations (name) VALUES ($1)', [migration]);
      });

      logger.info(`Migration ${migration} applied successfully`);
    }

    logger.info('All migrations applied');
  } catch (error) {
    logger.error('Migration error:', error);
    throw error;
  }
}

/**
 * Test database connection
 */
export async function testConnection(retries = 5, delay = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await query('SELECT 1');
      logger.info('Database connection established');
      return;
    } catch (error) {
      logger.warn(`Database connection attempt ${i + 1}/${retries} failed`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export default pool;