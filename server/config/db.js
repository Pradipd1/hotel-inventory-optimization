import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

let transactionSupport;

export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  transactionSupport = undefined;
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  transactionSupport = undefined;
}

/**
 * Multi-document transactions require a replica set or sharded cluster
 * (MongoDB Atlas, or a local mongod started with --replSet). On a standalone
 * server we fall back to atomic single-document updates.
 */
export async function supportsTransactions() {
  if (transactionSupport !== undefined) return transactionSupport;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionSupport = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    transactionSupport = false;
  }
  return transactionSupport;
}
