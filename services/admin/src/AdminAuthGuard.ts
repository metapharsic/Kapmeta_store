// services/admin/src/AdminAuthGuard.ts
//
// Small, reusable permission-check helper used by every destructive
// action in AdminService (and by the read-only actions that still
// require at least a 'manager' role, e.g. getLogs).

import { ActorContext, AdminRole } from './types';
import { ForbiddenError } from './errors';

/**
 * Throws ForbiddenError unless actor.role === 'admin'.
 * Used by every destructive System Configuration action.
 */
export function requireAdminRole(actor: ActorContext): void {
  if (actor.role !== 'admin') {
    throw new ForbiddenError(
      `Actor ${actor.actorId} has role '${actor.role}'; this action requires role 'admin'`
    );
  }
}

/**
 * Throws ForbiddenError unless actor.role is one of `allowed`.
 * Used by read-only actions like getLogs that are open to managers
 * and admins, but not cashiers/staff.
 */
export function requireRoleAtLeast(actor: ActorContext, allowed: AdminRole[]): void {
  if (!allowed.includes(actor.role)) {
    throw new ForbiddenError(
      `Actor ${actor.actorId} has role '${actor.role}'; this action requires one of: ${allowed.join(', ')}`
    );
  }
}
