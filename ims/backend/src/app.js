import express from 'express';
import { itemsRouter } from './items.js';
import { query } from './db.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  // Configurable CORS (12-factor): off by default (same-origin in prod via
  // ingress). Set ALLOW_ORIGIN for local cross-origin dev if needed.
  const allowOrigin = process.env.ALLOW_ORIGIN;
  if (allowOrigin) {
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', allowOrigin);
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  // Liveness: must NOT touch the DB. Tells K8s the process is alive.
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: verifies DB connectivity. K8s won't route traffic until 200.
  app.get('/readyz', async (req, res) => {
    try {
      await query('SELECT 1;');
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: err.message });
    }
  });

  // Expose the serving pod so load-balancing across replicas is visible in a demo.
  app.use('/api', (req, res, next) => {
    if (process.env.HOSTNAME) res.header('X-Pod', process.env.HOSTNAME);
    next();
  });

  app.use('/api/items', itemsRouter);

  // 404 for unknown routes (consistent JSON error shape).
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler — consistent { error } shape, never leak stack traces.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
