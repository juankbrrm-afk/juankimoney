import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { hasPermission, type Permission } from "@medgrowth/config";

export class UnauthorizedError extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sin permisos suficientes") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Resolves the current session and organization. Every server component
 * and Route Handler that touches tenant data calls this instead of trusting
 * an organizationId from the request — see docs/RISKS.md #9.
 */
export async function requireOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  // SUPER_ADMIN operates across organizations; for the MVP it still needs
  // an explicit organizationId (passed by the caller) since most queries
  // are scoped — see docs/ARCHITECTURE.md 1.3.
  if (!session.user.organizationId && session.user.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Usuario sin organización asignada");
  }

  return {
    userId: session.user.id,
    role: session.user.role,
    organizationId: session.user.organizationId,
  };
}

export async function requirePermission(permission: Permission) {
  const ctx = await requireOrgContext();
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError(`Rol ${ctx.role} no tiene permiso ${permission}`);
  }
  return ctx;
}
