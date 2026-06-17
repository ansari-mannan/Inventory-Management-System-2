import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { getPool } from './db.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Run idempotent migration before accepting traffic.
  await migrate();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`IMS backend listening on port ${PORT}`);
  });

  // --- Graceful shutdown (SIGTERM) ----------------------------------------
  // K8s sends SIGTERM during rolling updates. We stop accepting new
  // connections, let in-flight requests drain, then close the DB pool — so
  // rolling updates don't drop requests.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      console.log('HTTP server closed, draining DB pool...');
      try {
        await getPool().end();
        console.log('DB pool closed. Bye.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown', err);
        process.exit(1);
      }
    });

    // Failsafe: force exit if draining hangs.
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
