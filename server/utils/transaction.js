import mongoose from 'mongoose';
import { supportsTransactions } from '../config/db.js';

/**
 * Runs `fn(session)` inside a MongoDB transaction when the deployment supports it.
 * On a standalone server, `fn(null)` runs without a session; stock updates still use
 * atomic guarded `$inc` operations, so stock can never go negative.
 */
export async function runInTransaction(fn) {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
