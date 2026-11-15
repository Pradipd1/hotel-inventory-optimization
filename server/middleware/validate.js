import { ApiError } from '../utils/ApiError.js';

function formatIssues(error) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

/**
 * Validates request parts against Zod schemas. Unknown body keys are stripped.
 * Parsed values are available as req.body, req.validated.query and req.validated.params
 * (Express 5 exposes req.query as a read-only getter).
 */
export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    req.validated = req.validated || {};
    const parts = [
      ['params', params, req.params],
      ['query', query, req.query],
      ['body', body, req.body ?? {}],
    ];
    for (const [key, schema, value] of parts) {
      if (!schema) continue;
      const result = schema.safeParse(value);
      if (!result.success) {
        throw ApiError.badRequest('Validation failed', formatIssues(result.error));
      }
      if (key === 'body') req.body = result.data;
      else req.validated[key] = result.data;
    }
    next();
  };
}
