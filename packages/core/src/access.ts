import { z } from 'zod';

/* ---------- permissions ---------- */

export const PERMISSION_KEYS = [
  'project:create',
  'project:update',
  'project:delete',
  'sprint:manage',
  'task:create',
  'task:update',
  'task:move',
  'task:delete',
  'comment:create',
  'user:manage',
  'role:manage',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export const permissionKeySchema = z.enum(PERMISSION_KEYS);

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'project:create': 'Create projects',
  'project:update': 'Edit project settings',
  'project:delete': 'Delete projects',
  'sprint:manage': 'Create, start & complete sprints',
  'task:create': 'Create tasks',
  'task:update': 'Edit tasks',
  'task:move': 'Move cards on the board',
  'task:delete': 'Delete tasks',
  'comment:create': 'Comment on tasks',
  'user:manage': 'Invite & manage members',
  'role:manage': 'Edit roles & permissions',
};

/* ---------- roles: fixed set, editable permissions ---------- */

export const ROLE_IDS = ['admin', 'project_manager', 'developer', 'viewer'] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export const roleIdSchema = z.enum(ROLE_IDS);

export const ROLE_NAMES: Record<RoleId, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  developer: 'Developer',
  viewer: 'Viewer',
};

/** The Admin role always has every permission; it cannot be edited or left without a member. */
export const ADMIN_ROLE: RoleId = 'admin';

/** Defaults inserted by the Module 2 migration (kept identical to its SQL). Admins can change them later. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleId, readonly PermissionKey[]> = {
  admin: PERMISSION_KEYS,
  project_manager: ['project:create', 'project:update', 'sprint:manage', 'task:create', 'task:update', 'task:move', 'task:delete', 'comment:create'],
  developer: ['task:create', 'task:update', 'task:move', 'comment:create'],
  viewer: [],
};

export const roleSummary = z.object({ id: roleIdSchema, name: z.string() });
export type RoleSummary = z.infer<typeof roleSummary>;
export const roleSummaryOf = (id: RoleId): RoleSummary => ({ id, name: ROLE_NAMES[id] });

export const roleWithPermissions = roleSummary.extend({
  permissions: z.array(permissionKeySchema),
  memberCount: z.number().int().nonnegative(),
});
export type RoleWithPermissions = z.infer<typeof roleWithPermissions>;

export const rolesResponse = z.object({
  roles: z.array(roleWithPermissions),
  permissions: z.array(z.object({ key: permissionKeySchema, label: z.string() })),
});
export type RolesResponse = z.infer<typeof rolesResponse>;

export const setPermissionInput = z.object({ granted: z.boolean() });
export const changeRoleInput = z.object({ roleId: roleIdSchema });
