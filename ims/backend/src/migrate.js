import { query } from './db.js';

// Idempotent migration: safe to run on every boot. No external migration tool,
// no state — exactly what a 12-factor app needs for ephemeral container starts.
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS items (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    sku        TEXT NOT NULL UNIQUE,
    category   TEXT,
    quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    price      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Keep updated_at fresh on every UPDATE via a trigger, so the app never has to
// remember to set it.
const CREATE_TRIGGER_FN = `
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;

const CREATE_TRIGGER = `
  DROP TRIGGER IF EXISTS items_set_updated_at ON items;
  CREATE TRIGGER items_set_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
`;

const SEED = `
  INSERT INTO items (name, sku, category, quantity, price) VALUES
    ('USB-C Cable 1m',        'CBL-USBC-1M',  'Cables',      120, 6.99),
    ('Wireless Mouse',        'MSE-WL-001',   'Peripherals',  45, 18.50),
    ('Mechanical Keyboard',   'KBD-MECH-87',  'Peripherals',  30, 64.00),
    ('27in Monitor',          'MON-27-4K',    'Displays',     12, 289.99),
    ('Laptop Stand',          'STD-LAP-AL',   'Accessories',  60, 24.95),
    ('HDMI Cable 2m',         'CBL-HDMI-2M',  'Cables',       80, 8.49),
    ('Webcam 1080p',          'CAM-1080-USB', 'Peripherals',  25, 39.99),
    ('Desk Lamp LED',         'LMP-LED-001',  'Accessories',  40, 15.75);
`;

export async function migrate() {
  await query(CREATE_TABLE);
  await query(CREATE_TRIGGER_FN);
  await query(CREATE_TRIGGER);

  // Seed sample data only when the table is empty (idempotent).
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM items;');
  if (rows[0].count === 0) {
    await query(SEED);
    console.log('Seeded 8 sample items.');
  }
  console.log('Migration complete.');
}
