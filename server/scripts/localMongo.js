/**
 * Local development database (no system-wide MongoDB install required).
 *
 * Starts a real `mongod` process (binary downloaded once by mongodb-memory-server)
 * as a single-node replica set "rs0" on port 27017, storing data in server/.mongo-data
 * so it survives restarts. A replica set is used so multi-document transactions work.
 *
 * Usage: npm run db:start   (keep this terminal open; Ctrl+C to stop)
 * Then:  MONGO_URI=mongodb://127.0.0.1:27017/hotel_inventory?replicaSet=rs0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', '.mongo-data');
const port = Number(process.env.LOCAL_MONGO_PORT) || 27017;

fs.mkdirSync(dbPath, { recursive: true });

console.log('Starting local MongoDB replica set (first run downloads the mongod binary)...');

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath, storageEngine: 'wiredTiger' }],
});

const uri = `mongodb://127.0.0.1:${port}/hotel_inventory?replicaSet=rs0`;
console.log('\n✔ MongoDB is running');
console.log(`  URI:  ${uri}`);
console.log(`  Data: ${dbPath}`);
console.log('  Press Ctrl+C to stop.\n');

const stop = async () => {
  console.log('\nStopping MongoDB...');
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
