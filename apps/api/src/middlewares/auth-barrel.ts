/**
 * Auth middleware barrel for lazy-loading and archive routes.
 *
 * Re-exports `authenticate` as `protect` (common Express convention)
 * and `authorize` from the RBAC middleware so route files can use
 * the familiar `protect` / `authorize` pairing.
 */

export { authenticate as protect } from '../middlewares/auth.middleware';
export { authorize } from '../middlewares/rbac.middleware';
