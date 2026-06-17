import pg from 'pg';

const { Pool } = pg;

// 12-factor: all connection details come from environment variables only.
// Nothing is hardcoded; defaults exist only for local convenience.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ims',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // When DB_SSL=true we relax cert verification, which is required to connect
  // to AWS RDS (which presents an Amazon CA cert not in the default trust store).
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Surface pool-level errors instead of letting them crash an idle process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

export const query = (text, params) => pool.query(text, params);

export const getPool = () => pool;
