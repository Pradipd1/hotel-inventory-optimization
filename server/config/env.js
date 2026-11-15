import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(serverRoot, '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Copy server/.env.example to server/.env and set a long random secret.'
  );
}
if (nodeEnv === 'production' && (process.env.JWT_SECRET.length < 32 || /change-me/i.test(process.env.JWT_SECRET))) {
  throw new Error('JWT_SECRET must be a random value of at least 32 characters in production (not the .env.example placeholder).');
}

if (process.env.CLOUDINARY_URL && !/^cloudinary:\/\/[^:]+:[^@]+@.+/.test(process.env.CLOUDINARY_URL)) {
  throw new Error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name> (copy it from the Cloudinary dashboard).');
}

// Behind a reverse proxy / PaaS load balancer, set TRUST_PROXY=1 (number of proxy hops) so
// req.ip and the login rate limiter see the real client address instead of the proxy's.
const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxy = trustProxyRaw == null || trustProxyRaw === '' ? false : /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw === 'true';

export const env = Object.freeze({
  nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hotel_inventory?replicaSet=rs0',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // browsers send the Origin without a trailing slash
    .filter(Boolean),
  trustProxy,
  alertScanIntervalMinutes: Number(process.env.ALERT_SCAN_INTERVAL_MINUTES) || 60,
  // Optional. When set (cloudinary://<key>:<secret>@<cloud_name>), item images are stored in
  // Cloudinary instead of the local uploads folder, which is needed on hosts with ephemeral disks.
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  uploadDir: path.join(serverRoot, 'uploads'),
  serverRoot,
});
