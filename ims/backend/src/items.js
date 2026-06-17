import { Router } from 'express';
import { query } from './db.js';

export const itemsRouter = Router();

// --- Validation helpers -----------------------------------------------------

function validateItem(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  // name
  if (has('name')) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      errors.push('name must be a non-empty string');
    } else {
      out.name = body.name.trim();
    }
  } else if (!partial) {
    errors.push('name is required');
  }

  // sku
  if (has('sku')) {
    if (typeof body.sku !== 'string' || body.sku.trim() === '') {
      errors.push('sku must be a non-empty string');
    } else {
      out.sku = body.sku.trim();
    }
  } else if (!partial) {
    errors.push('sku is required');
  }

  // category (optional, nullable)
  if (has('category')) {
    if (body.category === null || body.category === '') {
      out.category = null;
    } else if (typeof body.category !== 'string') {
      errors.push('category must be a string');
    } else {
      out.category = body.category.trim();
    }
  }

  // quantity
  if (has('quantity')) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q < 0) {
      errors.push('quantity must be an integer >= 0');
    } else {
      out.quantity = q;
    }
  } else if (!partial) {
    out.quantity = 0;
  }

  // price
  if (has('price')) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0) {
      errors.push('price must be a number >= 0');
    } else {
      out.price = p;
    }
  } else if (!partial) {
    out.price = 0;
  }

  return { errors, value: out };
}

// --- Routes -----------------------------------------------------------------

// GET /api/items  — list, with optional ?search= and ?category=
itemsRouter.get('/', async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const clauses = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      clauses.push(`(name ILIKE $${i} OR sku ILIKE $${i} OR category ILIKE $${i})`);
    }
    if (category) {
      params.push(category);
      clauses.push(`category = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM items ${where} ORDER BY id ASC;`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id
itemsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be an integer' });

    const { rows } = await query('SELECT * FROM items WHERE id = $1;', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/items
itemsRouter.post('/', async (req, res, next) => {
  try {
    const { errors, value } = validateItem(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { rows } = await query(
      `INSERT INTO items (name, sku, category, quantity, price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [value.name, value.sku, value.category ?? null, value.quantity, value.price]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'sku already exists' });
    }
    next(err);
  }
});

// PUT /api/items/:id  — update (full or partial); 404 if missing
itemsRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be an integer' });

    const { errors, value } = validateItem(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const keys = Object.keys(value);
    if (keys.length === 0) return res.status(400).json({ error: 'no valid fields to update' });

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
    const params = keys.map((k) => value[k]);
    params.push(id);

    const { rows } = await query(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *;`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'sku already exists' });
    }
    next(err);
  }
});

// DELETE /api/items/:id  — 204; 404 if missing
itemsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be an integer' });

    const { rowCount } = await query('DELETE FROM items WHERE id = $1;', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
