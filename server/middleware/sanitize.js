/**
 * Defence-in-depth against NoSQL operator injection: removes any object key that starts
 * with "$" or contains "." from the JSON body before it reaches validation or Mongoose.
 */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
}
