import { env } from './config/env.js';
import { connectDB, disconnectDB, supportsTransactions } from './config/db.js';
import { createApp } from './app.js';
import { startBackgroundJobs } from './services/scheduler.js';

async function start() {
  try {
    await connectDB(env.mongoUri);
  } catch (err) {
    console.error(`\n✖ Could not connect to MongoDB at ${env.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
    console.error(`  ${err.message}`);
    console.error('  Start a local database with "npm run db:start" or set MONGO_URI in server/.env.\n');
    process.exit(1);
  }
  const tx = await supportsTransactions();
  console.log(`✔ MongoDB connected (transactions ${tx ? 'enabled' : 'not available: standalone server'})`);

  const app = createApp();
  // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
  const server = app.listen(env.port, (err) => {
    if (err) {
      console.error(`\n✖ Could not start the API on port ${env.port}: ${err.code === 'EADDRINUSE' ? 'the port is already in use (is another server running?)' : err.message}`);
      process.exit(1);
    }
    console.log(`✔ API listening on http://localhost:${env.port}/api`);
  });

  const backgroundJobs = startBackgroundJobs();

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    backgroundJobs.stop();
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
