import {
  BRANCH_TYPES,
  ENTITY_STATUSES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  ROLE_SCOPES,
  TENANT_STATUSES,
  USER_STATUSES,
} from '@diamond/shared'
import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Postgres enums are generated from the shared constants so the database, the
 * API and the web client can never drift apart. Adding a value means editing
 * @diamond/shared and generating a migration.
 */
export const tenantStatusEnum = pgEnum('tenant_status', TENANT_STATUSES)
export const entityStatusEnum = pgEnum('entity_status', ENTITY_STATUSES)
export const userStatusEnum = pgEnum('user_status', USER_STATUSES)
export const branchTypeEnum = pgEnum('branch_type', BRANCH_TYPES)
export const roleScopeEnum = pgEnum('role_scope', ROLE_SCOPES)
export const permissionModuleEnum = pgEnum('permission_module', PERMISSION_MODULES)
export const permissionActionEnum = pgEnum('permission_action', PERMISSION_ACTIONS)
