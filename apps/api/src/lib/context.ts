import type { AuthUser } from '@erp/shared';

/** Per-request context passed from routes into services. */
export interface Ctx {
  tenantId: string;
  userId: string;
  user: AuthUser;
}

export const hasPermission = (user: AuthUser, perm: string) =>
  user.permissions.includes('*') || user.permissions.includes(perm);
