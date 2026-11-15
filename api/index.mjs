// Vercel serverless entry: the same Express app as server/server.js, with a cached DB connection.
import { createApp } from '../server/app.js';
import { connectDB } from '../server/config/db.js';
import { env } from '../server/config/env.js';

const app = createApp();
let ready;

export default async function handler(req, res) {
  if (!ready) ready = connectDB(env.mongoUri).catch((err) => { ready = undefined; throw err; });
  await ready;
  return app(req, res);
}
