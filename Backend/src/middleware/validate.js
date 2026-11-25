import { ZodError } from 'zod';

/**
 * Validates request params, query, and body against Zod schemas.
 * Stores parsed data on `req.validated`.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      req.validated = {};

      if (schemas.params) {
        req.validated.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.validated.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.validated.body = schemas.body.parse(req.body);
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(err);
        return;
      }
      next(err);
    }
  };
}
