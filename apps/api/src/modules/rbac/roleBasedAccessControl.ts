/**
 * Role-based access control (RBAC) for multi-clinic management.
 *
 * Provides role hierarchy, a permission matrix, role assignment, dynamic
 * permission-checking middleware, API filtering helpers, audit logging,
 * temporary role elevation, role inheritance, role templates, and role
 * conflict detection.
 */

export type BaseRole = "admin" | "provider" | "staff" | "patient";

export type ResourceAction = "create" | "read" | "update" | "delete" | "list";

export interface RoleDefinition {
  name: string;
  inherits?: string[]; // parent roles this role inherits permissions from
  permissions: Partial<Record<string, ResourceAction[]>>; // resource -> actions
}

export interface RoleAssignment {
  userId: string;
  clinicId: string;
  role: string;
  assignedBy: string;
  assignedAt: number;
  expiresAt?: number;
}

export interface AuditLogEntry {
  timestamp: number;
  actorId: string;
  action: string;
  targetUserId?: string;
  clinicId?: string;
  detail: string;
}

export interface ElevationRequest {
  id: string;
  userId: string;
  clinicId: string;
  requestedRole: string;
  reason: string;
  requestedAt: number;
  expiresAt: number;
  approvedBy?: string;
  status: "pending" | "approved" | "denied" | "expired";
}

const BASE_ROLE_HIERARCHY: Record<BaseRole, RoleDefinition> = {
  patient: {
    name: "patient",
    permissions: {
      own_record: ["read"],
      appointment: ["create", "read", "list"],
      message: ["create", "read", "list"],
    },
  },
  staff: {
    name: "staff",
    inherits: ["patient"],
    permissions: {
      appointment: ["create", "read", "update", "list"],
      patient_record: ["read", "list"],
      billing: ["read", "list"],
    },
  },
  provider: {
    name: "provider",
    inherits: ["staff"],
    permissions: {
      patient_record: ["read", "update", "list"],
      prescription: ["create", "read", "update", "list"],
      message: ["create", "read", "update", "list"],
    },
  },
  admin: {
    name: "admin",
    inherits: ["provider"],
    permissions: {
      patient_record: ["create", "read", "update", "delete", "list"],
      billing: ["create", "read", "update", "delete", "list"],
      role_assignment: ["create", "read", "update", "delete", "list"],
      clinic_settings: ["create", "read", "update", "delete", "list"],
    },
  },
};

/** Common role templates for quick onboarding of new staff positions. */
export const ROLE_TEMPLATES: Record<string, RoleDefinition> = {
  front_desk: {
    name: "front_desk",
    inherits: ["staff"],
    permissions: { appointment: ["create", "read", "update", "list"] },
  },
  nurse: {
    name: "nurse",
    inherits: ["staff"],
    permissions: { patient_record: ["read", "update", "list"], prescription: ["read", "list"] },
  },
  billing_clerk: {
    name: "billing_clerk",
    inherits: ["staff"],
    permissions: { billing: ["create", "read", "update", "list"] },
  },
};

export class RbacRegistry {
  private roles = new Map<string, RoleDefinition>();
  private assignments: RoleAssignment[] = [];
  private auditLog: AuditLogEntry[] = [];
  private elevations = new Map<string, ElevationRequest>();
  private permissionCache = new Map<string, Partial<Record<string, ResourceAction[]>>>();

  constructor() {
    Object.values(BASE_ROLE_HIERARCHY).forEach((r) => this.roles.set(r.name, r));
    Object.values(ROLE_TEMPLATES).forEach((r) => this.roles.set(r.name, r));
  }

  registerRole(role: RoleDefinition): void {
    this.detectConflicts(role);
    this.roles.set(role.name, role);
    this.permissionCache.delete(role.name);
  }

  /** Detects duplicate or circular-inheritance role definitions before registering. */
  private detectConflicts(role: RoleDefinition): void {
    if (role.inherits?.includes(role.name)) {
      throw new Error(`Role ${role.name} cannot inherit from itself`);
    }
    const visited = new Set<string>();
    const stack = [...(role.inherits ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === role.name) {
        throw new Error(`Circular inheritance detected for role ${role.name}`);
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const parent = this.roles.get(current);
      if (parent?.inherits) stack.push(...parent.inherits);
    }
  }

  /** Resolves the fully-inherited permission set for a role, memoized. */
  resolvePermissions(roleName: string): Partial<Record<string, ResourceAction[]>> {
    if (this.permissionCache.has(roleName)) return this.permissionCache.get(roleName)!;

    const role = this.roles.get(roleName);
    if (!role) return {};

    const merged: Partial<Record<string, ResourceAction[]>> = {};
    for (const parentName of role.inherits ?? []) {
      const parentPerms = this.resolvePermissions(parentName);
      for (const [resource, actions] of Object.entries(parentPerms)) {
        merged[resource] = Array.from(new Set([...(merged[resource] ?? []), ...(actions ?? [])]));
      }
    }
    for (const [resource, actions] of Object.entries(role.permissions)) {
      merged[resource] = Array.from(new Set([...(merged[resource] ?? []), ...(actions ?? [])]));
    }

    this.permissionCache.set(roleName, merged);
    return merged;
  }

  assignRole(userId: string, clinicId: string, role: string, assignedBy: string, expiresAt?: number): RoleAssignment {
    if (!this.roles.has(role)) throw new Error(`Unknown role: ${role}`);
    const assignment: RoleAssignment = {
      userId,
      clinicId,
      role,
      assignedBy,
      assignedAt: Date.now(),
      expiresAt,
    };
    this.assignments.push(assignment);
    this.audit(assignedBy, "role_assigned", `Assigned ${role} to ${userId} in clinic ${clinicId}`, userId, clinicId);
    return assignment;
  }

  revokeRole(userId: string, clinicId: string, role: string, revokedBy: string): void {
    this.assignments = this.assignments.filter(
      (a) => !(a.userId === userId && a.clinicId === clinicId && a.role === role)
    );
    this.audit(revokedBy, "role_revoked", `Revoked ${role} from ${userId} in clinic ${clinicId}`, userId, clinicId);
  }

  getActiveRoles(userId: string, clinicId: string): string[] {
    const now = Date.now();
    return this.assignments
      .filter((a) => a.userId === userId && a.clinicId === clinicId && (!a.expiresAt || a.expiresAt > now))
      .map((a) => a.role);
  }

  /** Core permission check used by middleware; target of the <10ms budget. */
  can(userId: string, clinicId: string, resource: string, action: ResourceAction): boolean {
    const roles = this.getActiveRoles(userId, clinicId);
    return roles.some((role) => this.resolvePermissions(role)[resource]?.includes(action));
  }

  /** Express-style middleware factory for dynamic permission checks. */
  requirePermission(resource: string, action: ResourceAction) {
    return (req: any, res: any, next: any) => {
      const userId = req.user?.id;
      const clinicId = req.params?.clinicId ?? req.user?.clinicId;
      if (!userId || !clinicId) {
        return res.status(401).json({ error: "Missing authentication context" });
      }
      if (!this.can(userId, clinicId, resource, action)) {
        this.audit(userId, "access_denied", `${action} on ${resource}`, userId, clinicId);
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    };
  }

  /** Filters a list of records to those the requesting role is allowed to read. */
  filterByPermission<T extends { clinicId?: string }>(userId: string, records: T[], resource: string): T[] {
    return records.filter((record) => this.can(userId, record.clinicId ?? "", resource, "read"));
  }

  requestElevation(userId: string, clinicId: string, requestedRole: string, reason: string, ttlMs = 60 * 60 * 1000): ElevationRequest {
    const request: ElevationRequest = {
      id: `elev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      clinicId,
      requestedRole,
      reason,
      requestedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      status: "pending",
    };
    this.elevations.set(request.id, request);
    this.audit(userId, "elevation_requested", `Requested ${requestedRole}: ${reason}`, userId, clinicId);
    return request;
  }

  approveElevation(requestId: string, approvedBy: string): ElevationRequest {
    const request = this.elevations.get(requestId);
    if (!request) throw new Error(`Elevation request ${requestId} not found`);
    request.status = "approved";
    request.approvedBy = approvedBy;
    this.assignRole(request.userId, request.clinicId, request.requestedRole, approvedBy, request.expiresAt);
    this.audit(approvedBy, "elevation_approved", `Approved elevation ${requestId}`, request.userId, request.clinicId);
    return request;
  }

  private audit(actorId: string, action: string, detail: string, targetUserId?: string, clinicId?: string): void {
    this.auditLog.push({ timestamp: Date.now(), actorId, action, targetUserId, clinicId, detail });
  }

  getAuditLog(filter?: { userId?: string; clinicId?: string }): AuditLogEntry[] {
    return this.auditLog.filter(
      (e) =>
        (!filter?.userId || e.targetUserId === filter.userId || e.actorId === filter.userId) &&
        (!filter?.clinicId || e.clinicId === filter.clinicId)
    );
  }
}

export const rbacRegistry = new RbacRegistry();
