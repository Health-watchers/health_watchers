/**
 * Auth middleware barrel for lazy-loading and archive routes.
 *
 * Re-exports the single authorisation middleware (`authorize` and
 * `requirePermission`) from the RBAC middleware so route files can use
 * a consistent permission model. The `authenticate` middleware is no
 * longer aliased here; import it directly from `auth.middleware`.
 */

export { authorize, requirePermission } from '../middlewares/rbac.middleware';