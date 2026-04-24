import { RequestHandler } from 'express';

/**
 * Middleware to mark an endpoint as deprecated.
 * Adds Deprecation, Sunset, and Link headers per RFC 8594.
 */
export const deprecated = (sunsetDate: string, successorUrl?: string): RequestHandler =>
  (_req, res, next) => {
    res.set('Deprecation', 'true');
    res.set('Sunset', sunsetDate);
    if (successorUrl) {
      res.set('Link', `<${successorUrl}>; rel="successor-version"`);
    }
    next();
  };

/**
 * Middleware to add API-Version header to all responses.
 */
export const apiVersionHeader = (version: string): RequestHandler =>
  (_req, res, next) => {
    res.set('API-Version', version);
    next();
  };
