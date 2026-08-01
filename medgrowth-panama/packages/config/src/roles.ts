/**
 * RBAC map. Kept as a single source of truth so both the dashboard UI
 * (hide/show nav items) and the API route handlers (reject unauthorized
 * writes) check against the same table. See docs/ARCHITECTURE.md 1.2 for
 * why this is a plain object instead of a policy engine.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "RECEPTION",
  "DOCTOR",
  "MARKETING",
  "SALES",
  "CLIENT",
] as const;

export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:read",
  "leads:read",
  "leads:write",
  "appointments:read",
  "appointments:write",
  "campaigns:read",
  "campaigns:write",
  "conversations:read",
  "conversations:write",
  "landings:read",
  "landings:write",
  "audit:read",
  "audit:write",
  "reports:read",
  "reports:write",
  "billing:read",
  "billing:write",
  "users:read",
  "users:write",
  "integrations:read",
  "integrations:write",
  "ai:read",
  "ai:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  MANAGER: PERMISSIONS.filter((p) => p !== "billing:write" && p !== "integrations:write"),
  RECEPTION: [
    "dashboard:read",
    "leads:read",
    "leads:write",
    "appointments:read",
    "appointments:write",
    "conversations:read",
    "conversations:write",
  ],
  DOCTOR: ["dashboard:read", "leads:read", "appointments:read", "appointments:write", "conversations:read"],
  MARKETING: [
    "dashboard:read",
    "leads:read",
    "campaigns:read",
    "campaigns:write",
    "landings:read",
    "landings:write",
    "audit:read",
    "audit:write",
    "reports:read",
  ],
  SALES: [
    "dashboard:read",
    "leads:read",
    "leads:write",
    "appointments:read",
    "appointments:write",
    "conversations:read",
    "conversations:write",
  ],
  CLIENT: ["dashboard:read", "reports:read", "billing:read"],
};

export function hasPermission(role: RoleName, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(role: RoleName, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role ${role} does not have permission ${permission}`);
  }
}
